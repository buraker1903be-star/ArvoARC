import crypto from "node:crypto";
import { paytrConfig } from "@/lib/paytr/config";
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
  } catch (error) {
    // OK dönmezsek PayTR bildirimi tekrarlar ve kuyruk şişer.
    // Hata loglanır, sipariş panelden manuel kapatılır.
    console.error("PayTR bildirimi işlenemedi:", error);
  }

  return new Response("OK");
}
