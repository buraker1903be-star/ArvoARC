"use server";

import { formTutari } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { backUrl } from "@/lib/back-url";
import { stogaDonecekler } from "@/lib/iade-stok";
import { getStoreBrand } from "@/lib/store-brand";
import { odemeyiIadeEt } from "@/lib/odeme/iade";
import { sendEmail } from "@/lib/email/resend";
import { returnDecisionEmail } from "@/lib/email/order-confirmation";
import { calculateRefund, refundOutcome } from "@/lib/refund";
import { isBankTransfer } from "@/lib/payment-method";
import { claimOrderLock, releaseOrderLock, withoutLock } from "@/lib/order-lock";

/**
 * İade talebini sonuçlandırır.
 *
 * Onay PayTR iadesini tetikler; para gerçekten iade edilir.
 * Bu yüzden yalnızca sahip ve yönetici yapabiliyor.
 */
export async function resolveReturn(formData: FormData) {
  /*
    GERİ DÖNÜŞ ADRESİ (16.10.2026). İşlem her durumda listenin başına
    dönüyordu: süzgeç, arama, dönem ve sayfa gidiyordu — kırk kayıtlı
    bir listede üçüncü sayfadaki talebi sonuçlandırmak başa dönmek
    demekti. Karar artık iade DETAY sayfasından da verilebildiği için
    aynı dönüş o sayfayı da listeye atıyordu.

    Adres formdan geldiği için backUrl doğruluyor: yalnızca
    /siparisler/iadeler ve altındaki bir talep adresi kabul edilir
    (açık yönlendirme kapalı).
  */
  const geri = backUrl(formData.get("back"), "/siparisler/iadeler", {});
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin"].includes(membership.role)) {
    return await bildirimliDonus(geri,{hata:hataMetni("forbidden")});
  }

  const id = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  if (!id || !["onayla", "reddet", "iade-et"].includes(decision)) {
    return await bildirimliDonus(geri,{hata:hataMetni("invalid")});
  }

  const { data: request } = await supabase
    .from("arc_return_requests")
    .select("id,order_id,items,status,updated_at,arc_orders(order_number,status,payment_status,total,shipping,customer_name,customer_email,metadata,updated_at)")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .single();

  if (!request) return await bildirimliDonus(geri,{hata:hataMetni("not-found")});
  /*
    Onay ve ret yalnızca bekleyen talepte; para iadesi yalnızca
    onaylanmış talepte yapılabiliyor.
  */
  if (decision === "iade-et" && request.status !== "onaylandi") {
    return await bildirimliDonus(geri,{hata:hataMetni("not-approved")});
  }
  if (decision !== "iade-et" && request.status !== "beklemede") {
    return await bildirimliDonus(geri,{hata:hataMetni("already-resolved")});
  }

  const order = (Array.isArray(request.arc_orders)
    ? request.arc_orders[0]
    : request.arc_orders) as {
    order_number: string;
    status: string;
    payment_status: string | null;
    total: number;
    shipping: number | null;
    customer_name: string | null;
    customer_email: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  } | null;

  if (!order) return await bildirimliDonus(geri,{hata:hataMetni("not-found")});

  /* --- Ret --- */
  /*
    Ret ve onay yalnızca hâlâ bekleyen talepte yazılır ve sonucu
    kontrol edilir. Öncesinde kayıt başarısız olsa da müşteriye
    karar e-postası gidiyordu; iki sekmeden verilen iki karar da
    üst üste yazılabiliyordu.
  */
  if (decision === "reddet") {
    const { data: rejected, error: rejectError } = await supabase
      .from("arc_return_requests")
      .update({
        status: "reddedildi",
        status_note: note || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("id", id)
      .eq("status", "beklemede")
      .select("id");

    if (rejectError) return await bildirimliDonus(geri,{hata:hataMetni("save-failed")});
    if (!rejected?.length) return await bildirimliDonus(geri,{hata:hataMetni("already-resolved")});

    if (order.customer_email) {
      try {
        const mail = returnDecisionEmail({
          brand: await getStoreBrand(supabase, organization.id),
          approved: false,
          orderNumber: order.order_number,
          customerName: order.customer_name || "değerli müşterimiz",
          note,
        });
        await sendEmail({ to: order.customer_email, ...mail });
      } catch (mailError) {
        console.error("İade ret bildirimi gönderilemedi:", mailError);
      }
    }

    revalidatePath("/siparisler/iadeler");
    return await bildirimliDonus(geri,{basari:basariMetni("reddedildi")});
  }

  /* --- Onay: para henüz iade edilmiyor --- */

  /*
    Onay yalnızca "ürünü gönderebilirsiniz" demek. Para, ürün
    elimize ulaşıp kontrol edildikten sonra iade ediliyor.

    Öncesinde onay anında iade yapılıyordu: ürün gelmezse ya da
    hasarlı gelirse elimizde bir şey kalmıyordu.
  */
  if (decision === "onayla") {
    const sonuc = await onayiYaz({ supabase, organizationId: organization.id }, id, note, order);
    /*
      ONAY SONRASI HEDEF. Açık bir "back" yoksa liste "ürün bekleniyor"
      süzgeciyle açılıyor: kullanıcı onayladığı talebi görmeli, oysa
      bekleyenler süzgecinde o talep artık yok. "back" varsa kullanıcı
      nereden geldiyse oraya döner (detay sayfası ya da süzgeçli liste).
    */
    const hedef = formData.get("back") ? geri : "/siparisler/iadeler?filter=onaylandi";
    return await bildirimliDonus(sonuc.hata ? geri : hedef, sonuc);
  }

  /* --- Ürün teslim alındı: PayTR iadesi --- */

  /*
    Siparişin ödeme durumu kontrol edilir. Öncesinde bu akış daha
    önce yapılmış iadeye bakmıyordu: sipariş detayından tam iade
    edilmiş sipariş buradan ikinci kez iade edilebiliyordu.
  */
  const orderMeta = (order.metadata ?? {}) as Record<string, unknown>;
  if (isBankTransfer(orderMeta)) return await bildirimliDonus(geri,{hata:hataMetni("transfer-order")});
  if (order.payment_status === "refunded") return await bildirimliDonus(geri,{hata:hataMetni("already-refunded")});
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return await bildirimliDonus(geri,{hata:hataMetni("not-paid")});
  }
  /* Aynı siparişe birden çok talep olabilir; iade edilen tutar birikir. */
  const alreadyRefunded = Math.max(0, Number(orderMeta.refunded_amount ?? 0) || 0);
  const remaining = Math.max(0, order.total - alreadyRefunded);

  /*
    Tutar seçilen kalemlerden hesaplanıyor. Formdan gelen
    değere güvenmiyoruz: parasal işlem.
  */
  const items = (request.items ?? []) as Array<{ total?: number }>;
  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.total ?? 0),
    0,
  );

  /*
    Kargo çıkmadıysa kargo bedeli de iadeye giriyor. Hesap
    `calculateRefund` içinde; panel de aynı fonksiyondan okuyor,
    ekranda yazan tutarla gönderilen tutar ayrışmasın.
  */
  const breakdown = calculateRefund({
    itemsTotal,
    orderTotal: order.total,
    shipping: order.shipping,
    orderStatus: order.status,
  });

  /*
    Elle girilen tutar.

    `Number.isFinite` şart: "abc" ya da "1.234,56" gibi bir girdi
    `NaN` üretiyor, `NaN > 0` da false olduğu için sessizce
    varsayılan tutara düşülüyordu. Kullanıcı 50 ₺ yazdığını
    sanırken siparişin tamamı iade edilebiliyordu.
  */
  /* Yalnızca boş alan "hesaplanan tutar" demek; "0", eksi ya da sayı olmayan girdi reddedilir. */
  /* Türkçe yazım (formTutari): "1.500" bin beş yüz liradır, 1,5 değil. Boş alan "tamamı". */
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const customKurus = formTutari(rawAmount);
  if (rawAmount && (customKurus === null || customKurus <= 0)) {
    return await bildirimliDonus(geri,{hata:hataMetni("invalid-amount")});
  }
  const amountKurus = rawAmount ? customKurus! : breakdown.amount;

  /*
    Üst sınır artık siparişin tamamı değil, iade edilen kalemler
    (ve varsa kargo bedeli). Öncesinde 50 ₺'lik tek bir kalemin
    iadesinde 5.000 ₺'lik siparişin tamamı geçirilebiliyordu.
  */
  if (amountKurus > remaining) {
    return await bildirimliDonus(geri,{hata:hataMetni("over-remaining")});
  }
  if (amountKurus <= 0 || amountKurus > breakdown.amount) {
    return await bildirimliDonus(geri,{hata:hataMetni("invalid-amount")});
  }

  /*
    Sipariş kilitlenir (talep değil): aynı talebin çift gönderimi de,
    aynı siparişe ait iki talebin aynı anda işlenmesi de durur. Kilit
    okunduğu andaki updated_at'e koşullu olduğu için yukarıda okunan
    "önceden iade edilen" tutar kilit süresince geçerli kalır; iki
    talep toplamda ödenenden fazlasını iade edemez (bkz. lib/order-lock).
  */
  const lockedMeta = await claimOrderLock(supabase, organization.id, { id: request.order_id, updated_at: order.updated_at, metadata: order.metadata }, "refund_lock");
  if (!lockedMeta) return await bildirimliDonus(geri,{hata:hataMetni("busy")});

  const result = await odemeyiIadeEt({
    supabase,
    organizationId: organization.id,
    order: { id: request.order_id, order_number: order.order_number, metadata: order.metadata },
    amountKurus,
    referenceNo: `ARCIADE${id.replace(/-/g, "").slice(0, 12)}`,
  });

  if (!result.ok) {
    await releaseOrderLock(supabase, organization.id, request.order_id, lockedMeta, "refund_lock");
    console.error("İade başarısız:", order.order_number, result.message);
    return await bildirimliDonus(geri,{hata:hataMetni("refund-failed")});
  }

  const refundedTotal = alreadyRefunded + amountKurus;
  const outcome = refundOutcome({ orderTotal: order.total, refundedTotal, status: order.status });

  /*
    Test siparişinin iadesinde gerçek para hareketi olmuyor.
    Notta belirtiliyor ki panelde "iade edildi" görüp PayTR'da
    bulamama karışıklığı yaşanmasın.
  */
  const testNote = result.isTest
    ? "TEST siparişi — gerçek para iadesi yapılmadı."
    : null;

  const { error: requestError } = await supabase
    .from("arc_return_requests")
    .update({
      status: "tamamlandi",
      status_note: [note, testNote].filter(Boolean).join(" · ") || null,
      refund_amount: amountKurus,
      refund_reference: result.reference ?? null,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", id);

  /*
    STOĞA GERİ EKLEME.

    İade akışında stok hiç güncellenmiyordu: müşteri ürünü geri
    gönderiyor, para iade ediliyor, ama sistem ürünü hâlâ satılmış
    sayıyordu. Sipariş iptalinde stok geri veriliyor
    (arc_update_order_status) — aynı fiziksel olay, iki farklı sonuç.

    KARAR OPERASYONCUNUN: geri gelen ürün hasarlı ya da açılmışsa
    stoğa girmemeli ve bunu sistem bilemez. Ekrandaki onay kutusu
    varsayılan olarak işaretli, çünkü iadelerin çoğu satılabilir
    dönüyor ve iptal akışı da stoğu soru sormadan geri veriyor.

    HATA PARA İADESİNİ GEÇERSİZ SAYMIYOR: para çoktan gitti. Stok elle
    de düzeltilebilir, oysa burada hata dönmek operasyoncuyu iadeyi
    ikinci kez yapmaya iterdi.
  */
  let stogaEklenen = 0;
  /* Kutusu işaretlendiği hâlde hiç eklenemedi mi? Mesajda yazıyor. */
  let stokIstendi = false;
  if (String(formData.get("stoga_ekle") ?? "") === "on") {
    stokIstendi = true;
    /*
      SİPARİŞİN GERÇEK KALEMLERİ sınır olarak veriliyor: iade talebinin
      kalemleri müşterinin tarayıcısından geliyor ve RPC onları
      doğrulamadan saklıyor.
    */
    const { data: siparisKalemleri, error: kalemHatasi } = await supabase.from("arc_order_items")
      .select("sku,quantity").eq("organization_id", organization.id).eq("order_id", request.order_id);
    /*
      Hata akışı KESMİYOR (para çoktan gitti, yukarıdaki gerekçe) ama
      artık iz bırakıyor. Yutulduğunda sınır listesi boş kalıyor,
      stogaDonecekler hiçbir şey döndürmüyor ve stok sessizce eksik
      kalıyordu: "neden eklenmedi" sorusunun hiçbir cevabı yoktu.
    */
    if (kalemHatasi) console.error("İade stoğu için sipariş kalemleri okunamadı:", request.order_id, kalemHatasi.message);
    const donecekler = stogaDonecekler(request.items, (siparisKalemleri ?? []) as Array<{ sku: string | null; quantity: number }>);
    if (donecekler.length) {
      const { data: varyantlar, error: varyantHatasi } = await supabase.from("arc_product_variants")
        .select("id,sku").eq("organization_id", organization.id)
        .in("sku", donecekler.map((k) => k.sku));
      // Aynı gerekçe: okunamadıysa hiçbir SKU eşleşmez ve stok sessizce eksik kalır.
      if (varyantHatasi) console.error("İade stoğu için varyantlar okunamadı:", request.order_id, varyantHatasi.message);
      const varyantBySku = new Map(((varyantlar ?? []) as Array<{ id: string; sku: string }>).map((v) => [v.sku, v.id]));
      for (const kalem of donecekler) {
        const varyantId = varyantBySku.get(kalem.sku);
        /* Varyantı bulunamayan SKU atlanıyor: silinmiş ürün olabilir. */
        if (!varyantId) continue;
        const { error: stokHatasi } = await supabase.rpc("arc_adjust_inventory", {
          p_variant_id: varyantId,
          p_quantity: kalem.adet,
          p_kind: "return",
          p_reference_type: "return_request",
          p_reference_id: id,
          p_note: `İade: ${order.order_number}`,
        });
        if (stokHatasi) console.error("İade stoğa eklenemedi:", kalem.sku, stokHatasi.message);
        else stogaEklenen += kalem.adet;
      }
    }
  }

  /*
    Sipariş detayındaki iade akışıyla aynı kural (refundOutcome):
    tamamı iade edilen sipariş kapanır, kısmi iadede sipariş olduğu
    adımda kalır. İki akış aynı siparişi farklı duruma bırakmamalı.
  */
  const { error: orderError } = await supabase
    .from("arc_orders")
    .update({
      payment_status: outcome.paymentStatus,
      status: outcome.status,
      metadata: {
        ...withoutLock(lockedMeta, "refund_lock"),
        refunded_at: new Date().toISOString(),
        refunded_amount: refundedTotal,
        refund_count: (Number(orderMeta.refund_count ?? 0) || 0) + 1,
        refund_reference: result.reference ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", request.order_id);

  /*
    Para iade edildi ama kayıt güncellenemedi. Sessizce geçmek
    tehlikeli: talep "onaylandı" kalırsa aynı iade tekrar denenebilir.
  */
  if (requestError || orderError) {
    console.error("İADE YAPILDI AMA KAYIT GÜNCELLENEMEDİ:", order.order_number, amountKurus, requestError?.message, orderError?.message);
    return await bildirimliDonus(geri,{hata:hataMetni("refund-recorded-failed")});
  }

  if (order.customer_email) {
    try {
      const mail = returnDecisionEmail({
          brand: await getStoreBrand(supabase, organization.id),
        approved: true,
        orderNumber: order.order_number,
        customerName: order.customer_name || "değerli müşterimiz",
        amount: amountKurus,
        note,
      });
      await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("İade onay bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath("/siparisler/iadeler");
  /* Stok da değiştiyse o ekranlar tazeleniyor. */
  if (stogaEklenen) {
    revalidatePath("/stok");
    revalidatePath("/urunler");
    revalidatePath("/");
  }
  /*
    STOK EKLENEMEDİYSE SUSULMUYOR (17.10.2026). Operasyoncu kutuyu
    işaretliyor, iade tamamlanıyor ve mesaj yalnızca "İade tamamlandı"
    diyordu; stok yazımı başarısız olduğunda bunu SADECE sunucu
    günlüğü biliyordu. Canlıda tam bu oldu: organization_modules
    görünmediği için arc_adjust_inventory her çağrıda reddediyordu.
    Para iadesi yine geçerli (yukarıdaki gerekçe), ama stoğu elle
    düzeltmek gerektiği ekranda yazıyor.
  */
  return await bildirimliDonus(geri, {
    basari: stogaEklenen
      ? `İade tamamlandı · ${stogaEklenen} ürün stoğa geri eklendi.`
      : stokIstendi
        ? "İade tamamlandı, ancak ürünler stoğa geri EKLENEMEDİ; stoğu elle düzeltin."
        : "İade tamamlandı.",
  });
}

/* ---------------------------------------------------------------- */

type Kurum = { supabase: Awaited<ReturnType<typeof requireTenant>>["supabase"]; organizationId: string };
type OnaySiparisi = { order_number: string; customer_name: string | null; customer_email: string | null };

/*
  ONAY ÇEKİRDEĞİ.

  Onay üç yerden veriliyor: iade detayının karar formu, listedeki
  satırın "Onayla" düğmesi ve seçilenlerin toplu onayı. Üçü aynı şeyi
  yapmalı — kaydı koşullu yaz, müşteriye haber ver — ve kopya yazılsaydı
  biri e-postayı atlar ya da koşulu düşürürdü.

  Onay PARA GÖNDERMİYOR: yalnızca "ürünü gönderebilirsiniz" demek.
  Para, ürün elimize ulaşıp kontrol edildikten sonra iade ediliyor ve o
  yol (iade-et) hâlâ tek yerden, kilitli ve tutar denetimli geçiyor —
  bu yüzden toplu işleme açılan tek karar onaydır.

  Güncelleme `status = beklemede` koşullu: iki sekmeden verilen iki
  karar üst üste yazılamıyor, toplu onayda arada el değmiş bir talep de
  sessizce atlanıyor.
*/
async function onayiYaz(kurum: Kurum, id: string, note: string, order: OnaySiparisi): Promise<{ hata?: string; basari?: string }> {
  const { data: approved, error: approveError } = await kurum.supabase
    .from("arc_return_requests")
    .update({
      status: "onaylandi",
      status_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", kurum.organizationId)
    .eq("id", id)
    .eq("status", "beklemede")
    .select("id");

  if (approveError) return { hata: hataMetni("save-failed") };
  if (!approved?.length) return { hata: hataMetni("already-resolved") };

  if (order.customer_email) {
    try {
      const mail = returnDecisionEmail({
        brand: await getStoreBrand(kurum.supabase, kurum.organizationId),
        approved: true,
        orderNumber: order.order_number,
        customerName: order.customer_name || "değerli müşterimiz",
        note,
      });
      await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("İade onay bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath("/siparisler/iadeler");
  return { basari: basariMetni("onaylandi") };
}

/** Onay için gereken en az kayıt: durum ve müşteriye yazacak sipariş alanları. */
async function onayIcinOku(kurum: Kurum, id: string) {
  const { data, error } = await kurum.supabase
    .from("arc_return_requests")
    .select("id,status,arc_orders(order_number,customer_name,customer_email)")
    .eq("organization_id", kurum.organizationId)
    .eq("id", id)
    .maybeSingle();
  /* Okunamayan talep "yok" DEĞİL: hatayı yutmak onayı sessizce düşürürdü. */
  if (error) return { hata: hataMetni("save-failed") } as const;
  if (!data) return { hata: hataMetni("not-found") } as const;
  if (data.status !== "beklemede") return { hata: hataMetni("already-resolved") } as const;
  const order = (Array.isArray(data.arc_orders) ? data.arc_orders[0] : data.arc_orders) as OnaySiparisi | null;
  if (!order) return { hata: hataMetni("not-found") } as const;
  return { order } as const;
}

/*
  LİSTEDE YERİNDE ONAY. Sipariş listesindeki "Onayla →" ile aynı kalıp:
  eylem sonuç DÖNDÜRÜYOR, yönlendirmiyor — kaydırma yeri ve seçim
  korunuyor (bkz. siparisler/order-table.tsx'teki gerekçe).
*/
export async function iadeOnaySonuc(id: string): Promise<{ hata?: string; basari?: string }> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin"].includes(membership.role)) return { hata: hataMetni("forbidden") };
  if (!id) return { hata: hataMetni("invalid") };
  const kurum = { supabase, organizationId: organization.id };
  const okuma = await onayIcinOku(kurum, id);
  if ("hata" in okuma) return okuma;
  return await onayiYaz(kurum, id, "", okuma.order);
}

/*
  TOPLU ONAY. Günde onlarca talep geldiğinde her birini tek tek açmak
  sayfayı onlarca kez yeniliyordu. Uygun olmayanlar (arada el değmiş,
  zaten sonuçlanmış) ATLANIYOR ve sayısı söyleniyor; sessizce
  atlamak "onayladım" sanmaya yol açardı.

  Not alanı yok: toplu onayda tek bir not elli müşteriye birden
  gider ve notlar talebe özel yazılıyor (iade adresi, kargo talimatı).
*/
export async function topluIadeOnayla(idler: string[]): Promise<{ hata?: string; basari?: string }> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin"].includes(membership.role)) return { hata: hataMetni("forbidden") };
  const temiz = [...new Set(idler.filter((id) => typeof id === "string" && id))].slice(0, 50);
  if (!temiz.length) return { hata: hataMetni("invalid") };

  const kurum = { supabase, organizationId: organization.id };
  let onaylanan = 0;
  const atlanan: string[] = [];
  for (const id of temiz) {
    const okuma = await onayIcinOku(kurum, id);
    if ("hata" in okuma) { atlanan.push(id); continue; }
    const sonuc = await onayiYaz(kurum, id, "", okuma.order);
    if (sonuc.basari) onaylanan += 1;
    else atlanan.push(id);
  }
  if (!onaylanan) return { hata: "Seçilen taleplerin hiçbiri onaylanamadı; durumları değişmiş olabilir." };
  return {
    basari: atlanan.length
      ? `${onaylanan} talep onaylandı · ${atlanan.length} talep atlandı (durumu değişmiş).`
      : `${onaylanan} talep onaylandı; müşterilere ürünü gönderebilecekleri bildirildi.`,
  };
}
