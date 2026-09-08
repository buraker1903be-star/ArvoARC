import crypto from "node:crypto";
import { paytrConfig } from "@/lib/paytr/config";
import { sendEmail } from "@/lib/email/resend";
import { orderConfirmationHtml } from "@/lib/email/order-confirmation";
import { createServiceClient } from "@/lib/paytr/service-client";

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
  const config = paytrConfig();

  const form = await request.formData();
  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const hash = String(form.get("hash") ?? "");
  const failedReason = String(form.get("failed_reason_msg") ?? "");

  // --- 1. İmza doğrulaması ----------------------------------
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

  // --- 2. Siparişi bul --------------------------------------
  // merchant_oid gönderilirken alfanümerik olmayan karakterler
  // temizlendiği için burada aynı normalleştirmeyle aranır.
  try {
    const supabase = createServiceClient();

    const { data: orders, error: findError } = await supabase
      .from("arc_orders")
      .select("id, order_number")
      .eq("source", "native")
      .limit(200);

    if (findError) throw findError;

    const order = orders?.find(
      (row) => row.order_number.replace(/[^A-Za-z0-9]/g, "") === merchantOid,
    );

    if (!order) {
      console.error("PayTR bildirimi: sipariş bulunamadı", { merchantOid });
      return new Response("OK");
    }

    const { error: settleError } = await supabase.rpc(
      "settle_arvoculture_storefront_order",
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
    // OK dönmezsek PayTR bildirimi tekrarlar ve kuyruk şişer.
    // Hata loglanır, sipariş panelden manuel kapatılır.
    console.error("PayTR bildirimi işlenemedi:", error);
  }

  return new Response("OK");
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
      "order_number, customer_name, customer_email, subtotal, shipping, total, metadata",
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

  const html = orderConfirmationHtml({
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
    to: order.customer_email,
    subject: `Siparişiniz alındı · ${order.order_number}`,
    html,
  });
}
