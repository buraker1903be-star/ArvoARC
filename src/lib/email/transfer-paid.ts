import "server-only";
import { sendEmail } from "./resend";
import { paymentReceivedEmail } from "./order-confirmation";

/**
 * Havale ödemesi onaylandığında müşteriye "ödemeniz alındı" gönderir.
 * Sipariş detayı ve Operasyon'daki tek tık onayı aynı yolu kullanır.
 * Gönderim hatası onayı geçersiz kılmaz; yalnızca günlüğe yazılır.
 */
export async function notifyTransferPaid(order: { order_number: string; customer_name: string | null; customer_email: string | null; total: number }) {
  if (!order.customer_email) return;
  try {
    await sendEmail({ to: order.customer_email, ...paymentReceivedEmail(order.order_number, order.customer_name || "değerli müşterimiz", order.total) });
  } catch (mailError) {
    console.error("Ödeme bildirimi gönderilemedi:", order.order_number, mailError);
  }
}
