import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { storePaytrConfig, type PaytrStoreConfig } from "@/lib/paytr/config";
import { saglayiciSirasi, type Saglayici } from "@/lib/odeme/secim";
import { garantiAyariCoz, GARANTI_ALANLARI, type GarantiAyari } from "@/lib/odeme/garanti/ayar";
import { formAlanlari } from "@/lib/odeme/garanti/istek";
import { recordOrderEvent } from "@/lib/siparis-olayi";
import { createServiceClient } from "@/lib/paytr/service-client";
import { resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";
import { getStoreBrand } from "@/lib/store-brand";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/resend";
import { transferOrderEmail } from "@/lib/email/order-confirmation";

/*
  Havale siparişi e-postası. PayTR bildirimi gelmediği için onay
  e-postası buradan gider. Kalemler ve banka bilgileri
  veritabanından okunur; vitrinden gelen değerlere güvenilmez.
*/
async function sendTransferConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  order: { order_id: string; order_number: string },
  to: string,
  customerName: string,
  total: number,
  transferDiscount: number,
) {
  const [{ data: orderRow }, { data: items }] = await Promise.all([
    supabase.from("arc_orders").select("organization_id").eq("id", order.order_id).single(),
    supabase.from("arc_order_items").select("product_name, quantity, total").eq("order_id", order.order_id),
  ]);
  const { data: bank } = orderRow
    ? await supabase.from("arc_store_settings").select("bank_name, bank_account_holder, bank_iban, bank_transfer_instructions").eq("organization_id", orderRow.organization_id).maybeSingle()
    : { data: null };
  const brand = await getStoreBrand(supabase, orderRow?.organization_id ?? "");
  const mail = transferOrderEmail({
    brand,
    orderNumber: order.order_number,
    customerName: customerName || "değerli müşterimiz",
    items: (items ?? []).map((item: { product_name: string; quantity: number; total: number }) => ({ name: item.product_name, quantity: item.quantity, total: item.total })),
    total,
    transferDiscount,
    bank: bank ? { holder: bank.bank_account_holder, name: bank.bank_name, iban: bank.bank_iban, note: bank.bank_transfer_instructions } : null,
  });
  await sendEmail({ to, ...mail, from: brand.from, replyTo: brand.replyTo });
}

/* Sahte sipariş yığınına karşı: IP başına 10 dakikada 10 ödeme denemesi. */
const orderLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vitrinden gelen ödeme isteği.
 *
 * Akış:
 *   1. Sipariş veritabanında oluşturulur — tutarı sunucu hesaplar.
 *   2. PayTR'dan o tutar için token istenir.
 *   3. Token vitrine döner, iFrame açılır.
 *
 * İstemciden gelen hiçbir tutar kullanılmaz. `create_..._order`
 * fonksiyonu gerçek toplamı döndürür ve PayTR'a giden tutar odur.
 */

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const organizationId = await resolveStore(createServiceClient(), origin);
  return new NextResponse(null, {
    status: 204,
    headers: storefrontCorsHeaders(origin, Boolean(organizationId)),
  });
}

type Item = { sku: string; quantity: number; name?: string };

/*
  Sepet satırı doğrulaması: SKU dolu, adet 1–50 arası tam sayı.
  Negatif ya da kesirli adet, veritabanı fonksiyonu ne yaparsa
  yapsın buradan geçmez.
*/
function parseItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sku = String(value.sku ?? "").trim();
  const quantity = Number(value.quantity);
  if (!sku || sku.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
  return { sku, quantity, name: typeof value.name === "string" ? value.name.slice(0, 120) : undefined };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const supabase = createServiceClient();
  /*
    Sipariş hangi mağazaya yazılacak: isteğin geldiği alan adından çözülüyor.
    Tanınmayan alan adından sipariş alınmıyor — eskiden hangi alan adından
    gelirse gelsin sipariş arvoculture'a yazılırdı.
  */
  const organizationId = await resolveStore(supabase, origin);
  const headers = storefrontCorsHeaders(origin, Boolean(organizationId));

  const limited = orderLimiter(clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Çok fazla ödeme denemesi yapıldı. Birkaç dakika sonra tekrar deneyin." },
      { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const address = body.address ?? {};
  const couponCode = body.couponCode ? String(body.couponCode).trim() : null;
  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map(parseItem).filter((item): item is Item => item !== null);
  /* Vitrin notu gönderiyordu ama hiç kaydedilmiyordu. */
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  /*
    Banka havalesi. Sipariş oluşuyor ama PayTR'a gidilmiyor;
    ödeme beklemede kalıyor ve havale geldiğinde panelden
    onaylanıyor.

    İndirim tutarına vitrinden gelen değere güvenilmiyor:
    oran sunucuda uygulanıyor.
  */
  const isTransfer = body.paymentMethod === "havale";

  if (!email || !name || rawItems.length === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 422, headers });
  }

  if (rawItems.length > 50 || items.length !== rawItems.length) {
    return NextResponse.json(
      { error: "invalid_items", message: "Sepetinizdeki ürün adetleri geçersiz. Sepeti yenileyip tekrar deneyin." },
      { status: 422, headers },
    );
  }

  // Tanınmayan alan adı: sipariş yazılacak mağaza belli değil.
  if (!organizationId) {
    return NextResponse.json(
      { error: "unknown_store", message: "Bu adresten sipariş alınamıyor." },
      { status: 403, headers },
    );
  }

  /*
    Ödeme gecikmesinde mağaza kademeli kapanır (public.arc_store_stage).
    "sales_closed" ve "closed" kademelerinde yeni sipariş alınmaz — kartla da
    havaleyle de. Panel bir kademe önce kapanmıştı; vitrinin tamamen kapanması
    ise vitrin projesinde.

    Kademe okunamazsa engellenmez: geçici bir arıza satışı durdurmamalı.
  */
  const { data: stage } = await supabase.rpc("arc_store_stage", {
    p_organization_id: organizationId,
  });
  if (stage === "sales_closed" || stage === "closed") {
    return NextResponse.json(
      {
        error: "store_suspended",
        message: "Mağaza şu anda sipariş alamıyor. Lütfen daha sonra tekrar deneyin.",
      },
      { status: 503, headers },
    );
  }

  /*
    Kupon son bir kez doğrulanıyor. Sepette geçerliyken ödeme
    anında dolmuş olabilir: son kullanım hakkını başka bir
    müşteri almış olabilir ya da müşteri aynı kodu ikinci kez
    kullanıyor olabilir.

    Sessizce yok saymak yerine hata döndürülüyor; müşteri
    beklediğinden fazla ödeme yapmasın.
  */
  if (couponCode) {
    /*
      Ara toplam burada henüz bilinmiyor: fiyatlama sipariş fonksiyonunun
      içinde. null geçiyoruz — "bilinmiyor" demek. Eskiden 0 geçiliyordu ve
      alt limiti olan her kupon "0 < limit" diye elenip siparişi tamamen
      engelliyordu. Alt limit sipariş oluşturulurken gerçek tutarla
      uygulanıyor.

      Hata yutulmuyor: doğrulama çalışmazsa kuponu geçerli saymak, "ilk
      alışverişe özel" kodların ikinci kez kullanılmasına yol açar.
    */
    const { data: check, error: checkError } = await supabase.rpc("arc_check_coupon", {
      p_organization_id: organizationId,
      p_code: couponCode,
      p_subtotal: null,
      p_email: email,
    });

    if (checkError) {
      console.error("Kupon doğrulanamadı:", couponCode, checkError.message);
      return NextResponse.json(
        { couponRejected: "İndirim kodu şu anda doğrulanamıyor. Kodu kaldırıp tekrar deneyin." },
        { status: 503, headers },
      );
    }

    const row = Array.isArray(check) ? check[0] : check;

    if (row && row.valid === false) {
      return NextResponse.json(
        { couponRejected: row.message ?? "İndirim kodu geçerli değil." },
        { status: 422, headers },
      );
    }
  }

  /*
    ÖDEME YÖNTEMİ SİPARİŞTEN ÖNCE DENETLENİYOR.

    Sipariş burada oluşuyor, yöntemin kullanılabilir olup olmadığı ise
    AŞAĞIDA denetleniyordu. Havalesi kapalı ya da PayTR bilgisi girilmemiş
    bir mağazada müşteri her denemede arkasında bir sipariş bırakıp
    "kullanılamıyor" görüyordu. Yeni bir salonun varsayılan hâli tam olarak
    bu: havale kapalı (sütun varsayılanı false), PayTR boş. Yani kiracı
    daha ilk gününde, sipariş listesi hiç ödenmeyecek "Bekliyor"
    kayıtlarıyla dolarken satış yapamıyordu.

    Stok etkilenmiyordu: stok siparişte değil, ödeme kesinleşince düşülüyor.
  */
  let transferSettings: { bank_transfer_enabled: boolean | null; bank_transfer_discount_percent: number | null } | null = null;
  let paytrConfig: PaytrStoreConfig | null = null;
  let garantiAyar: GarantiAyari | null = null;
  /* Bankanın ödeme ekranında görünen işyeri adı. Ayar satırı zaten
     okunuyor; marka için ikinci bir sorgu atmıyoruz. */
  let isyeriAdi = "";
  let saglayicilar: Saglayici[] = [];

  if (isTransfer) {
    /*
      Havalenin açık olup olmadığı ve indirim oranı mağazanın ayarında.
      Eskiden ikisi de yoktu: havaleyi panelden kapatmış bir mağazadan da
      havale siparişi geçiyor, indirim ise kodda sabit %3 olduğu için her
      mağazaya uygulanıyordu.
    */
    const { data, error: transferSettingsError } = await supabase
      .from("arc_store_settings")
      .select("bank_transfer_enabled, bank_transfer_discount_percent")
      .eq("organization_id", organizationId)
      .maybeSingle();

    /*
      Ayar okunamazsa havale AÇIK sayılamaz: "=== false" kontrolü undefined'ı
      geçirdiği için geçici bir arızada, havaleyi panelden kapatmış mağazadan
      da sipariş geçiyor ve indirim varsayılan %3'e düşüyordu.
    */
    if (transferSettingsError) {
      console.error("Havale ayarları okunamadı:", transferSettingsError.message);
      return NextResponse.json(
        { error: "transfer_unavailable", message: "Havale ile ödeme şu anda kullanılamıyor, lütfen kartla deneyin." },
        { status: 503, headers },
      );
    }

    if (data?.bank_transfer_enabled === false) {
      return NextResponse.json(
        { error: "transfer_disabled", message: "Bu mağazada havale ile ödeme kapalı." },
        { status: 422, headers },
      );
    }
    transferSettings = data;
  } else {
    /*
      Anahtarlar mağaza başına: isteğin geldiği mağazanın kendi PayTR hesabı
      kullanılıyor. Havale yolu ayrı döndüğü için, PayTR bilgisi girilmemiş
      mağaza hâlâ havaleyle satış yapabilir.
    */
    /*
      SAĞLAYICI SIRASI. Kart artık "PayTR" demek değil: mağaza Garanti
      Sanal POS'u birincil seçebiliyor (lib/odeme/secim.ts). Biri hazır
      değilse öteki devralıyor; hiçbiri hazır değilse kartla ödeme kapalı.
    */
    const { data: saglayiciSatiri, error: saglayiciHatasi } = await supabase
      .from("arc_store_settings")
      .select(`odeme_saglayicisi,store_name,${GARANTI_ALANLARI}`)
      .eq("organization_id", organizationId)
      .maybeSingle();
    /* Okunamadıysa Garanti hazır sayılmıyor; PayTR yolu aşağıda kendi denetiminden geçiyor. */
    if (saglayiciHatasi) console.error("Ödeme sağlayıcısı ayarı okunamadı:", saglayiciHatasi.message);
    garantiAyar = garantiAyariCoz(saglayiciSatiri as never);
    isyeriAdi = String((saglayiciSatiri as { store_name?: string | null } | null)?.store_name ?? "").trim();

    try {
      paytrConfig = await storePaytrConfig(supabase, organizationId, origin);
      /*
        Dönüş adresi olmadan ödeme başlatılmıyor. Eskiden yedek adres
        ArvoCulture'dı: adresi çözülemeyen başka bir mağazanın müşterisi,
        ödedikten sonra o markanın sitesinde "sipariş bulunamadı" görürdü.
      */
      if (!paytrConfig.storeUrl) throw new Error("Mağazanın vitrin adresi tanımlı değil");
      // Mağaza panelden kartla ödemeyi kapattıysa yeni ödeme başlatılmaz.
      // (İade ve gelen bildirim doğrulaması bu bayrağa bakmaz; onlar çalışmaya
      // devam etmeli.)
      if (!paytrConfig.enabled) throw new Error("Mağaza kartla ödemeyi kapatmış");
    } catch (configError) {
      /*
        PayTR'ın düşmesi artık tek başına kartla ödemeyi kapatmıyor:
        Garanti hazırsa ödeme oradan açılır. Hata yine de günlüğe yazılıyor
        — "yedek devraldı" ile "iki sağlayıcı da bozuk" farklı şeyler.
      */
      console.error("PayTR yapılandırması alınamadı:", organizationId, configError);
      paytrConfig = null;
    }

    saglayicilar = saglayiciSirasi(saglayiciSatiri?.odeme_saglayicisi, {
      garanti: Boolean(garantiAyar),
      paytr: Boolean(paytrConfig),
    });
    if (!saglayicilar.length) {
      return NextResponse.json(
        {
          error: "paytr_unavailable",
          message: "Kartla ödeme şu an kullanılamıyor. Havale/EFT ile ödeyebilir ya da bizimle iletişime geçebilirsiniz.",
        },
        { status: 503, headers },
      );
    }
  }

  // --- 1. Sipariş oluştur (tutar sunucuda hesaplanır) --------
  const { data, error } = await supabase.rpc(
    "arc_create_storefront_order",
    {
      p_organization_id: organizationId,
      p_email: email,
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      p_coupon_code: couponCode,
    },
  );

  if (error || !data?.[0]) {
    console.error("Sipariş oluşturulamadı:", error);
    return NextResponse.json(
      { error: "order_failed", message: error?.message },
      { status: 400, headers },
    );
  }

  const order = data[0] as {
    order_id: string;
    order_number: string;
    total: number;
  };

  /*
    Sipariş üstverisine ekleme. Havale bilgisi metadata'yı baştan
    yazıyordu: sipariş oluşurken kaydedilen teslimat adresi ve
    kupon bilgisi siliniyor, panelde ve onay e-postasında adres
    boş görünüyordu. Artık mevcut değerlerle birleşiyor.
  */
  const mergeMetadata = async (extra: Record<string, unknown>, fields: Record<string, unknown> = {}) => {
    const { data: current, error: readError } = await supabase.from("arc_orders").select("metadata").eq("id", order.order_id).single();
    /*
      Okuma hatası yutulursa current null kalır ve metadata YALNIZCA yeni
      anahtarlarla üzerine yazılır — yukarıdaki yorumda "düzeltildi" denen
      hatanın ta kendisi geri gelir: teslimat adresi, kupon kodu ve indirim
      silinir. Okunamıyorsa hiç yazmıyoruz.
    */
    if (readError) return { error: readError };
    return supabase
      .from("arc_orders")
      .update({
        ...fields,
        metadata: { ...((current?.metadata ?? {}) as Record<string, unknown>), ...extra },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.order_id);
  };

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

  /*
    Havale siparişinde PayTR adımı atlanıyor. İndirim sipariş
    üstverisine yazılıyor; panelde ve faturada görünüyor.
  */
  if (isTransfer) {
    /* Ayar yukarıda, sipariş oluşmadan önce okundu ve denetlendi. */
    /*
      İndirim YALNIZCA mal bedeline uygulanır. Eskiden taban order.total idi,
      yani kargo da indiriliyordu: 120 TL kargonun %3'ü müşteriye hediye
      ediliyordu. Ayrıca yalnızca total güncelleniyordu; subtotal ve shipping
      olduğu gibi kaldığı için panelde ve dışa aktarmada
      subtotal − indirim + kargo ≠ total oluyordu.
    */
    const { data: amounts, error: amountsError } = await supabase
      .from("arc_orders")
      .select("subtotal, shipping, metadata")
      .eq("id", order.order_id)
      .single();
    if (amountsError) {
      console.error("Sipariş tutarları okunamadı:", amountsError.message);
      return NextResponse.json(
        { error: "transfer_unavailable", message: "Havale ile ödeme şu anda kullanılamıyor, lütfen kartla deneyin." },
        { status: 503, headers },
      );
    }

    const subtotal = Number(amounts?.subtotal ?? 0);
    const shipping = Number(amounts?.shipping ?? 0);
    const couponDiscount = Number((amounts?.metadata as Record<string, unknown> | null)?.discount ?? 0);
    const goodsAfterCoupon = Math.max(subtotal - couponDiscount, 0);

    const discountPercent = Number(transferSettings?.bank_transfer_discount_percent ?? 3);
    const discount = Math.round((goodsAfterCoupon * discountPercent) / 100);
    const transferTotal = Math.max(goodsAfterCoupon - discount, 0) + shipping;

    const { error: transferError } = await mergeMetadata(
      {
        payment_method: "Banka havalesi / EFT",
        transfer_discount: discount,
        transfer_discount_percent: discountPercent,
        ...(note ? { notes: note } : {}),
      },
      { total: transferTotal, payment_status: "pending", status: "pending" },
    );

    /* Güncelleme olmadıysa indirim uygulanmadı; vitrine gerçek tutar döner. */
    if (transferError) console.error("Havale indirimi kaydedilemedi:", transferError);
    const payable = transferError ? order.total : transferTotal;

    /*
      Havale kaydı yazılamadıysa e-posta gönderilmez: sipariş havale
      olarak tanınmadığı için panelden onaylanamaz, müşteriye IBAN
      göndermek yanıltıcı olur. Gönderim hatası siparişi bozmaz.
    */
    if (!transferError) {
      try {
        await sendTransferConfirmation(supabase, order, email, name, payable, discount);
      } catch (mailError) {
        console.error("Havale e-postası gönderilemedi:", order.order_number, mailError);
      }
    }

    return NextResponse.json(
      {
        orderNumber: order.order_number,
        total: payable,
        paymentMethod: "havale",
      },
      { headers },
    );
  }

  // --- 2. Ödeme oturumu aç -----------------------------------

  /*
    GARANTİ SANAL POS — 3D PAY HOSTING. Kart formu bankanın sayfasında,
    bize hiç uğramıyor.

    Banka bir FORM POST'u bekliyor, gidilebilir bir bağlantı değil:
    alanların arasında imza var. Bu yüzden Tami'deki gibi tek bir
    `odemeAdresi` dönmüyoruz; alanları vitrine veriyoruz ve vitrin
    gizli bir formu kendiliğinden gönderiyor. İmzayı tarayıcıya vermek
    sır sızdırmıyor: imza zaten tarayıcının gördüğü değerlerden
    üretiliyor, gizli olan mağaza anahtarı sunucuda kalıyor.

    Bankanın sipariş numarası SİPARİŞİN UUID'Sİ: bizim numaralarımızın
    bir kısmı "#" taşıyor (SPR#1018) ve banka özel karakter kabul
    etmiyor. Dönüşte siparişi bu kimlikle buluyoruz.
  */
  if (saglayicilar[0] === "garanti" && garantiAyar) {
    const panelKokeni = new URL(request.url).origin;
    const donusAdresi = `${panelKokeni}/api/storefront/garanti-donus`;
    const alanlar = formAlanlari(garantiAyar.kimlik, garantiAyar.guvenlikDuzeyi, garantiAyar.testModu, {
      siparisNo: order.order_id,
      tutarKurus: order.total,
      /* Başarı ve hata aynı uca gidiyor: ikisini de imza denetiminden
         geçirmek gerekiyor ve "hata" adresine gelen bir isteğin
         gerçekten bankadan geldiğini de doğrulamak zorundayız. */
      basariAdresi: donusAdresi,
      hataAdresi: donusAdresi,
      musteriEposta: email,
      musteriIp: ip,
      isyeriAdi,
    });

    if (alanlar) {
      const { error: garantiMetaError } = await mergeMetadata({
        odeme_saglayicisi: "garanti",
        garanti_order_id: order.order_id,
        garanti_test_modu: garantiAyar.testModu,
        ...(note ? { notes: note } : {}),
      });
      if (garantiMetaError) console.error("Sipariş üstverisi kaydedilemedi:", garantiMetaError);

      return NextResponse.json(
        {
          saglayici: "garanti",
          odemeFormu: { adres: garantiAyar.uclar.form, alanlar },
          orderNumber: order.order_number,
          total: order.total,
        },
        { headers },
      );
    }

    /*
      YEDEĞE DÜŞME BURADA VE YALNIZCA BURADA: müşteri henüz bankanın
      sayfasına gitmedi, ortada açık bir ödeme oturumu yok. Müşteri
      sayfaya düştükten sonra ikinci bir sağlayıcıda oturum açmak çift
      çekim riski demek olurdu.

      Sebep SİPARİŞE de yazılıyor; yalnızca sunucu günlüğüne yazmak
      "PayTR açıldı ama neden" sorusunu Vercel günlüklerinde aramak
      demekti.
    */
    console.error("Garanti ödeme formu üretilemedi:", order.order_number);
    await recordOrderEvent(
      supabase,
      { id: order.order_id, organization_id: organizationId },
      "payment_session_failed",
      { saglayici: "garanti", reason: "imza üretilemedi", yedek: paytrConfig ? "paytr" : null },
    );
    if (!paytrConfig) {
      return NextResponse.json(
        { error: "payment_failed", message: "Kartla ödeme şu an başlatılamadı. Lütfen tekrar deneyin." },
        { status: 502, headers },
      );
    }
  }

  // --- PayTR token iste --------------------------------------
  /*
    Yapılandırma sipariş oluşmadan önce alındı ve denetlendi; havale dalı
    yukarıda döndüğü için buraya yalnızca kart yolu geliyor. Denetim yine
    de duruyor: "as" ile susturmak, ileride dalların biri değişirse
    müşteriyi boş bir ödeme ekranına gönderirdi.
  */
  if (!paytrConfig) {
    console.error("PayTR yapılandırması beklenmedik biçimde boş:", order.order_number);
    return NextResponse.json(
      {
        error: "paytr_unavailable",
        message: "Kartla ödeme şu an kullanılamıyor. Havale/EFT ile ödeyebilir ya da bizimle iletişime geçebilirsiniz.",
      },
      { status: 503, headers },
    );
  }
  const config = paytrConfig;

  /*
    PayTR sipariş kimliği siparişe kaydedilir: bildirim siparişi
    numara deseniyle aramak yerine birebir bulur.
  */
  const merchantOid = order.order_number.replace(/[^A-Za-z0-9]/g, "");
  const { error: metaError } = await mergeMetadata({ paytr_merchant_oid: merchantOid, ...(note ? { notes: note } : {}) });
  if (metaError) console.error("Sipariş üstverisi kaydedilemedi:", metaError);

  // PayTR sepet formatı: [[ad, birim fiyat, adet], ...]
  const basket = Buffer.from(
    JSON.stringify(
      items.map((item) => [item.name ?? item.sku, "0.00", item.quantity]),
    ),
  ).toString("base64");

  const params = {
    merchant_id: config.merchantId,
    user_ip: ip,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(order.total), // kuruş
    user_basket: basket,
    no_installment: "0",
    max_installment: "0",
    currency: "TL",
    test_mode: config.testMode,
  };

  // İmza: PayTR'ın beklediği alan sırası birebir korunmalıdır.
  const hashInput =
    params.merchant_id +
    params.user_ip +
    params.merchant_oid +
    params.email +
    params.payment_amount +
    params.user_basket +
    params.no_installment +
    params.max_installment +
    params.currency +
    params.test_mode +
    config.merchantSalt;

  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(hashInput)
    .digest("base64");

  const form = new URLSearchParams({
    ...params,
    paytr_token: token,
    debug_on: config.testMode,
    timeout_limit: "30",
    /* Numaradaki "#" gibi karakterler adresi bölmesin. */
    merchant_ok_url: `${config.storeUrl}/siparis/tamam?no=${encodeURIComponent(order.order_number)}`,
    merchant_fail_url: `${config.storeUrl}/siparis/hata?no=${encodeURIComponent(order.order_number)}`,
    user_name: name,
    user_address: String((address as Record<string, unknown>).line ?? "-"),
    user_phone: phone || "-",
  });

  const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  const result = (await response.json()) as {
    status: string;
    token?: string;
    reason?: string;
  };

  if (result.status !== "success" || !result.token) {
    console.error("PayTR token alınamadı:", result.reason);
    return NextResponse.json(
      { error: "paytr_failed", message: result.reason },
      { status: 502, headers },
    );
  }

  return NextResponse.json(
    {
      token: result.token,
      orderNumber: order.order_number,
      total: order.total,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}`,
    },
    { headers },
  );
}
