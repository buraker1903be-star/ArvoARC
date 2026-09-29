import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoreBrand } from "@/lib/store-brand";
import { orderConfirmationHtml } from "@/lib/email/order-confirmation";
import { sendEmail } from "@/lib/email/resend";

/*
  SİPARİŞ ONAY E-POSTASI. PayTR bildirim ucunun içinden çıkarıldı:
  Tami dönüşü de aynı postayı gönderiyor ve ikinci bir kopya yazmak,
  birinde düzeltilen bir eksiğin ötekinde kalması demekti (bu depoda
  aynı kusuru fiyat doğrulamasında ve arama sorgusunda iki kez
  temizledik).

  Gönderim hatası çağıranın işini bozmamalı: posta ikincil bir iş,
  ödeme kesinleşmesi birincil.
*/
export async function sendOrderConfirmation(
  supabase: SupabaseClient,
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

