import crypto from "node:crypto";
import { storePaytrConfig } from "@/lib/paytr/config";
import { sendEmail } from "@/lib/email/resend";
import { orderConfirmationHtml } from "@/lib/email/order-confirmation";
import { createServiceClient } from "@/lib/paytr/service-client";
import { getStoreBrand } from "@/lib/store-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayTR bildirim (callback) servisi.
 *
 * PayTR ödeme sonucunu buraya sunucudan sunucuya bildirir. Bu adres
 * PayTR panelinde "Bildirim URL" olarak tanımlanmalıdır.
 *
 * İki kural:
 *
 *   1. İmza doğrulanmadan hiçbir şey yapılmaz. Aksi hâlde herkes
 *      bu adrese istek atıp siparişleri "ödendi" yapabilir.
 *
 *   2. Her durumda gövdede yalnızca "OK" döndürülür. PayTR bunu
 *      görmezse bildirimi saatlerce tekrarlar. Hata olsa bile OK
 *      dönülür; sorun loglanır ve panelden takip edilir.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const hash = String(form.get("hash") ?? "");
  const failedReason = String(form.get("failed_reason_msg") ?? "");

  // merchant_oid yalnızca harf ve rakamdan oluşur (odeme/route.ts).
  if (!/^[A-Za-z0-9]{1,64}$/.test(merchantOid)) {
    console.error("PayTR bildirimi: geçersiz merchant_oid", { merchantOid });
    return new Response("OK");
  }

  // --- 1. Siparişi bul --------------------------------------
  /*
    İmza doğrulaması siparişten SONRA yapılır: anahtarlar artık mağaza
    başına, yani hangi anahtarla doğrulayacağımızı bilmek için önce
    siparişin hangi mağazaya ait olduğunu bulmamız gerekiyor. Sipariş
    araması yalnızca okumadır; doğrulanmamış bildirimle hiçbir kayıt
    değişmez, karar hâlâ imzaya bağlıdır.

    merchant_oid, sipariş numarasındaki harf ve rakamlar. Önceden
    sırasız 200 sipariş çekilip içinde aranıyordu: mağaza 200
    siparişi geçince ödemesi alınmış sipariş bulunamıyor ve
    "bekliyor"da kalıyordu. Artık karakterlerin arasına joker
    konarak doğrudan aranıyor; eşleşme normalleştirilmiş numarayla
    kesinleşiyor.
  */
  /*
    merchant_oid, sipariş numarasındaki harf ve rakamlar. Önceden
    sırasız 200 sipariş çekilip içinde aranıyordu: mağaza 200
    siparişi geçince ödemesi alınmış sipariş bulunamıyor ve
    "bekliyor"da kalıyordu. Artık karakterlerin arasına joker
    konarak doğrudan aranıyor; eşleşme normalleştirilmiş numarayla
    kesinleşiyor.
  */
  // catch içinden de erişilebilsin: bildirim işlenemediğinde mağazaya
  // görünür bir olay yazmak için sipariş kimliği gerekiyor.
  let found: OrderRow | undefined;
  const supabase = createServiceClient();

  try {

    /*
      Önce ödeme başlatılırken siparişe kaydedilen PayTR kimliğiyle
      birebir aranır. Eski siparişlerde bu alan yok; o zaman numara
      deseniyle aranır. Birebir sorgu hata verse bile desene düşülür:
      bildirim hiçbir koşulda boşa gitmemeli.
    */
    const exact = await supabase
      .from("arc_orders")
      .select("id, order_number, payment_status, organization_id, total")
      .eq("source", "native")
      .eq("metadata->>paytr_merchant_oid", merchantOid)
      // Sıralama yoksa .limit(1) hangi satırın geleceğini belirsiz bırakır;
      // sorgu kurum kapsamsız olduğu için bu belirsizlik mağazalar arasında
      // da geçerli. En yenisi alınır.
      .order("created_at", { ascending: false })
      .limit(1);
    if (exact.error) console.error("PayTR bildirimi: birebir arama başarısız, desene düşülüyor", exact.error.message);

    let order = exact.error ? undefined : exact.data?.[0];
    if (!order) {
      const { data: orders, error: findError } = await supabase
        .from("arc_orders")
        .select("id, order_number, payment_status, organization_id, total")
        .eq("source", "native")
        .ilike("order_number", `%${merchantOid.split("").join("%")}%`)
        .order("created_at", { ascending: false })
        .limit(200);

      if (findError) throw findError;

      order = orders?.find(
        (row) => row.order_number.replace(/[^A-Za-z0-9]/g, "") === merchantOid,
      );
    }

    if (!order) {
      console.error("PayTR bildirimi: sipariş bulunamadı", { merchantOid });
      return new Response("OK");
    }
    found = order;

    // --- 2. İmza doğrulaması (siparişin mağazasının anahtarıyla) ---
    const config = await storePaytrConfig(supabase, order.organization_id);
    const expected = crypto
      .createHmac("sha256", config.merchantKey)
      .update(merchantOid + config.merchantSalt + status + totalAmount)
      .digest("base64");

    // Zamanlama saldırısına kapalı karşılaştırma.
    const valid =
      hash.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));

    if (!valid) {
      console.error("PayTR bildirimi: imza doğrulanamadı", { merchantOid });
      return new Response("PAYTR notification failed: bad hash", { status: 400 });
    }

    /*
      PayTR aynı bildirimi yineleyebilir. Yalnızca ödemesi beklenen
      sipariş işlenir: onay e-postası ikinci kez gitmez, ödenmiş ya da
      (kısmen) iade edilmiş sipariş sonradan gelen bildirimle bozulmaz.
    */
    if (!["pending", "authorized", "failed"].includes(order.payment_status)) {
      console.info("PayTR bildirimi: sipariş zaten sonuçlanmış", { merchantOid, paymentStatus: order.payment_status });
      return new Response("OK");
    }

    /*
      Tutar doğrulaması. total_amount imzanın içinde, yani PayTR'ın beyanı;
      ama siparişin kendi tutarıyla HİÇ karşılaştırılmıyordu. Farklıysa
      sipariş yine "ödendi" oluyordu.

      Fark varsa sipariş ödendi YAPILMAZ ve mağazaya görünür bir olay
      yazılır: bir insan bakmalı. Sessizce ödendi saymak, eksik tahsilatı
      tamamlanmış göstermek demek.
    */
    if (status === "success" && Number(totalAmount) !== Number(order.total)) {
      console.error("PayTR bildirimi: tutar uyuşmuyor", {
        merchantOid, bildirilen: totalAmount, siparis: order.total,
      });
      await recordOrderEvent(supabase, order, "payment_amount_mismatch", {
        reported_amount: Number(totalAmount),
        expected_amount: Number(order.total),
        merchant_oid: merchantOid,
      });
      return new Response("OK");
    }

    /*
      Eski adı settle_arvoculture_storefront_order idi ve gövdesi
      organizations.slug = 'arvoculture' ile SABİTLENMİŞTİ: başka bir
      mağazanın siparişi için "Sipariş bulunamadı" fırlatıyor, bildirim
      yutuluyor, ödeme alınmış sipariş sonsuza kadar "ödeme bekliyor"da
      kalıyordu. 20260917180000 kurumu siparişten türetiyor.
    */
    const { error: settleError } = await supabase.rpc(
      "arc_settle_storefront_order",
      {
        p_order_id: order.id,
        p_paid: status === "success",
        p_payment_reference: merchantOid,
        p_failure_reason: status === "success" ? null : failedReason,
      },
    );

    if (settleError) throw settleError;

    /*
      Sipariş onay e-postası. Yalnızca başarılı ödemede gönderilir.

      Gönderim hatası bildirimi başarısız saymamalı: PayTR "OK"
      almazsa bildirimi tekrarlar, sipariş ikinci kez işlenmeye
      çalışılır. E-posta ikincil bir iş; kendi içinde yutulur.
    */
    if (status === "success") {
      try {
        await sendOrderConfirmation(supabase, order.id);
      } catch (mailError) {
        console.error("Sipariş e-postası gönderilemedi:", mailError);
      }
    }
  } catch (error) {
    /*
      OK dönmezsek PayTR bildirimi tekrarlar ve kuyruk şişer, o yüzden yine
      OK dönüyoruz. Ama eskiden hata YALNIZCA sunucu günlüğüne yazılıyordu:
      ödeme alınmış sipariş sonsuza kadar "ödeme bekliyor"da kalıyor, mağaza
      sahibi hiçbir şey görmüyordu. Tetikleyen durum, mağazanın PayTR
      anahtarını temizlemesi ya da PAYMENT_CREDENTIALS_KEY'in değişmesi:
      storePaytrConfig fırlatır, bildirim sessizce düşerdi.

      Artık siparişe görünür bir olay yazılıyor; panelde hem genel akışta
      hem sipariş detayında çıkıyor.
    */
    console.error("PayTR bildirimi işlenemedi:", error);
    if (found) {
      await recordOrderEvent(supabase, found, "payment_settle_failed", {
        reason: error instanceof Error ? error.message : "Bilinmeyen hata",
        merchant_oid: merchantOid,
        status,
      });
    }
  }

  return new Response("OK");
}

type OrderRow = { id: string; organization_id: string; total: number | null };

/**
 * Siparişe görünür bir olay yazar. Olay yazılamazsa akış kesilmez —
 * bildirim yanıtı zaten OK olmalı — ama sessiz de kalınmaz.
 */
async function recordOrderEvent(
  supabase: ReturnType<typeof createServiceClient>,
  order: OrderRow,
  eventType: string,
  eventData: Record<string, string | number | null>,
) {
  const { error } = await supabase.from("arc_order_events").insert({
    organization_id: order.organization_id,
    order_id: order.id,
    event_type: eventType,
    event_data: eventData,
  });
  if (error) console.error("PayTR bildirimi: sipariş olayı yazılamadı", { eventType, message: error.message });
}

/**
 * Sipariş onay e-postasını hazırlayıp gönderir.
 *
 * Kalemler ve tutarlar veritabanından okunur; PayTR
 * bildiriminden gelen değerlere güvenilmez.
 */
async function sendOrderConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
) {
  const { data: order } = await supabase
    .from("arc_orders")
    .select(
      "order_number, customer_name, customer_email, subtotal, shipping, total, metadata, organization_id",
    )
    .eq("id", orderId)
    .single();

  if (!order?.customer_email) return;

  const { data: items } = await supabase
    .from("arc_order_items")
    .select("product_name, quantity, total")
    .eq("order_id", orderId);

  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const rawAddress = (meta.shipping_address ?? meta.address ?? {}) as Record<
    string,
    string | null
  >;

  const brand = await getStoreBrand(supabase, order.organization_id);
  const html = orderConfirmationHtml({
    brand,
    orderNumber: order.order_number,
    customerName: order.customer_name || "değerli müşterimiz",
    items: (items ?? []).map((item: {
      product_name: string;
      quantity: number;
      total: number;
    }) => ({
      name: item.product_name,
      quantity: item.quantity,
      total: item.total,
    })),
    subtotal: order.subtotal ?? 0,
    discount: Number(meta.discount ?? 0),
    shipping: order.shipping ?? 0,
    total: order.total ?? 0,
    address: {
      line: rawAddress.line ?? rawAddress.address1 ?? undefined,
      district: rawAddress.district ?? rawAddress.province ?? undefined,
      city: rawAddress.city ?? undefined,
      postal: rawAddress.postal ?? rawAddress.zip ?? undefined,
    },
  });

  await sendEmail({
    from: brand.from,
    replyTo: brand.replyTo,
    to: order.customer_email,
    subject: `${brand.name} · siparişiniz alındı · ${order.order_number}`,
    html,
  });
}
