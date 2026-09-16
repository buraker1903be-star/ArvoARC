import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { storePaytrConfig, type PaytrStoreConfig } from "@/lib/paytr/config";
import { createServiceClient } from "@/lib/paytr/service-client";
import { resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";
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
  const mail = transferOrderEmail({
    orderNumber: order.order_number,
    customerName: customerName || "değerli müşterimiz",
    items: (items ?? []).map((item: { product_name: string; quantity: number; total: number }) => ({ name: item.product_name, quantity: item.quantity, total: item.total })),
    total,
    transferDiscount,
    bank: bank ? { holder: bank.bank_account_holder, name: bank.bank_name, iban: bank.bank_iban, note: bank.bank_transfer_instructions } : null,
  });
  await sendEmail({ to, ...mail });
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
  const TRANSFER_DISCOUNT_PERCENT = 3;

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
    const { data: check } = await supabase.rpc("arc_check_coupon", {
      p_organization_id: organizationId,
      p_code: couponCode,
      p_subtotal: 0,
      p_email: email,
    });

    const row = Array.isArray(check) ? check[0] : check;

    if (row && row.valid === false) {
      return NextResponse.json(
        { couponRejected: row.message ?? "İndirim kodu geçerli değil." },
        { status: 422, headers },
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
    const { data: current } = await supabase.from("arc_orders").select("metadata").eq("id", order.order_id).single();
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
    const discount = Math.round(
      (order.total * TRANSFER_DISCOUNT_PERCENT) / 100,
    );

    const { error: transferError } = await mergeMetadata(
      {
        payment_method: "Banka havalesi / EFT",
        transfer_discount: discount,
        transfer_discount_percent: TRANSFER_DISCOUNT_PERCENT,
        ...(note ? { notes: note } : {}),
      },
      { total: order.total - discount, payment_status: "pending", status: "pending" },
    );

    /* Güncelleme olmadıysa indirim uygulanmadı; vitrine gerçek tutar döner. */
    if (transferError) console.error("Havale indirimi kaydedilemedi:", transferError);
    const payable = transferError ? order.total : order.total - discount;

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

  // --- 2. PayTR token iste -----------------------------------
  /*
    Anahtarlar mağaza başına: isteğin geldiği mağazanın kendi PayTR hesabı
    kullanılıyor. Havale yolu yukarıda döndüğü için, PayTR bilgisi girilmemiş
    mağaza hâlâ havaleyle satış yapabilir.
  */
  let config: PaytrStoreConfig;
  try {
    config = await storePaytrConfig(supabase, organizationId);
    // Mağaza panelden kartla ödemeyi kapattıysa yeni ödeme başlatılmaz.
    // (İade ve gelen bildirim doğrulaması bu bayrağa bakmaz; onlar çalışmaya
    // devam etmeli.)
    if (!config.enabled) throw new Error("Mağaza kartla ödemeyi kapatmış");
  } catch (configError) {
    console.error("PayTR yapılandırması alınamadı:", order.order_number, configError);
    return NextResponse.json(
      {
        error: "paytr_unavailable",
        message: "Kartla ödeme şu an kullanılamıyor. Havale/EFT ile ödeyebilir ya da bizimle iletişime geçebilirsiniz.",
      },
      { status: 503, headers },
    );
  }

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
