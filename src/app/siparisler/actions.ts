"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { sendEmail } from "@/lib/email/resend";
import { statusUpdateEmail } from "@/lib/email/order-confirmation";

export async function createOrder(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) redirect("/siparisler?error=forbidden");

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const variantIds = formData.getAll("variant_id").map(String);
  const quantities = formData.getAll("quantity").map((value) => Number(value));

  if (!variantIds.length || variantIds.length !== quantities.length) redirect("/siparisler?error=invalid-order");

  const items = variantIds.map((variantId, index) => ({ variant_id: variantId, quantity: quantities[index] }));
  if (items.some((item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) redirect("/siparisler?error=invalid-order");

  const { data, error } = await supabase.rpc("arc_create_order", {
    p_customer_name: customerName,
    p_customer_email: customerEmail,
    p_items: items,
    p_source: "native",
  });

  if (error) redirect(`/siparisler?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/siparisler");
  const orderNumber = data?.[0]?.order_number ?? "created";
  redirect(`/siparisler?created=${encodeURIComponent(orderNumber)}`);
}

/**
 * Listeden hızlı durum değişikliği.
 *
 * Sipariş detayına girmeden bir sonraki adıma geçirmek için.
 * Günde on sipariş geldiğinde her birini açıp kapatmak otuz
 * tıklama demekti.
 *
 * Ödeme durumuna dokunulmuyor: o PayTR bildirimiyle geliyor ve
 * elle değiştirmek muhasebeyle uyumsuzluk yaratır.
 */
export async function quickStatus(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin", "manager"].includes(membership.role)) {
    redirect("/siparisler?error=forbidden");
  }

  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");

  const allowed = new Set([
    "confirmed",
    "processing",
    "fulfilled",
    "cancelled",
  ]);

  if (!orderId || !allowed.has(status)) {
    redirect("/siparisler?error=invalid-status");
  }

  const { data: order } = await supabase
    .from("arc_orders")
    .select("payment_status,order_number,customer_name,customer_email")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: status,
    // Ödeme durumu değiştirilmiyor.
    p_payment_status: order?.payment_status ?? "pending",
  });

  if (error) redirect("/siparisler?error=save-failed");

  /* Müşteri bildirimi; hata siparişi etkilemez. */
  if (order?.customer_email) {
    try {
      const mail = statusUpdateEmail(
        status,
        order.order_number,
        order.customer_name || "değerli müşterimiz",
      );
      if (mail) await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("Durum bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath("/siparisler");
  redirect("/siparisler?ok=status");
}
