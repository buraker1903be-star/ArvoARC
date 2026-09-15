"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { sendEmail } from "@/lib/email/resend";
import { statusUpdateEmail } from "@/lib/email/order-confirmation";
import { isOrderClosed } from "@/lib/commerce-labels";
import { nextOrderStep } from "@/lib/order-flow";
import { backUrl } from "@/lib/back-url";
import { isBankTransfer } from "@/lib/payment-method";
import { notifyTransferPaid } from "@/lib/email/transfer-paid";

const MANAGERS = ["owner", "admin", "manager"];

/* İşlemden sonra kullanıcı geldiği yere döner: listeden "Onayla →"
   demek filtreyi sıfırlayıp ilk sayfaya atıyordu. */
const backTo = (formData: FormData, result: Record<string, string>) => backUrl(formData.get("back"), "/siparisler", result);

const fromDetail = (formData: FormData) =>
  /^\/siparisler\/(?!iadeler$)[A-Za-z0-9-]+$/.test(String(formData.get("back") ?? "").split("?")[0]);

export async function createOrder(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) redirect("/siparisler?error=forbidden");

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

/* Müşteri bildirimi; gönderim hatası durum güncellemesini geçersiz kılmaz. */
async function notifyStatus(order: { order_number: string; customer_name: string | null; customer_email: string | null; metadata?: unknown }, status: string) {
  if (!order.customer_email) return;
  try {
    /* Takip numarası girildiyse takip bilgili kargo e-postası zaten gitti. */
    const trackingSent = Boolean((order.metadata as { tracking_number?: string } | null)?.tracking_number);
    const mail = statusUpdateEmail(status, order.order_number, order.customer_name || "değerli müşterimiz", { trackingSent });
    if (mail) await sendEmail({ to: order.customer_email, ...mail });
  } catch (mailError) {
    console.error("Durum bildirimi gönderilemedi:", order.order_number, mailError);
  }
}

/**
 * Listeden (veya detay başlığından) hızlı durum değişikliği.
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

  if (!MANAGERS.includes(membership.role)) redirect(backTo(formData, { error: "forbidden" }));

  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowed = new Set(["confirmed", "processing", "fulfilled", "cancelled"]);

  if (!orderId || !allowed.has(status)) redirect(backTo(formData, { error: "invalid-status" }));

  const { data: order } = await supabase
    .from("arc_orders")
    .select("status,payment_status,order_number,customer_name,customer_email,metadata")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  /*
    Kayıt okunamadıysa devam edilmiyor. Öncesinde `order` null
    olsa bile RPC çağrılıyor ve ödeme durumu `?? "pending"` ile
    geçiliyordu: ödenmiş siparişin ödeme durumu sessizce
    "Ödeme bekliyor"a düşebiliyordu.
  */
  if (!order) redirect(backTo(formData, { error: "order-not-found" }));

  /* Kapanmış sipariş akışta ilerletilemez. Düğme zaten gizli;
     bu kontrol elle gönderilen isteğe karşı. */
  if (isOrderClosed(order.status, order.payment_status)) redirect(backTo(formData, { error: "order-closed" }));

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: status,
    // Ödeme durumu değiştirilmiyor.
    p_payment_status: order.payment_status,
  });

  if (error) redirect(backTo(formData, { error: "save-failed" }));

  await notifyStatus(order, status);

  revalidatePath("/");
  revalidatePath("/siparisler");
  revalidatePath(`/siparisler/${orderId}`);
  redirect(backTo(formData, fromDetail(formData) ? { saved: "1" } : { ok: "status" }));
}

/**
 * Havale ödemesini tek tıkla onaylar (Operasyon Merkezi).
 *
 * Öncesinde sipariş detayına girip ödeme ve durum listelerini
 * değiştirmek gerekiyordu. Yalnızca havale siparişinde ve ödeme
 * beklerken çalışır; sipariş "onaylandı + ödendi" olur ve müşteriye
 * "ödemeniz alındı" gider. Kart ödemesi PayTR bildirimiyle kapanır.
 */
export async function confirmTransferPayment(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const back = (result: Record<string, string>) => backUrl(formData.get("back"), "/operasyon", result);
  if (!MANAGERS.includes(membership.role)) redirect(back({ error: "forbidden" }));

  const orderId = String(formData.get("order_id") ?? "");
  const { data: order } = await supabase
    .from("arc_orders")
    .select("status,payment_status,metadata,order_number,customer_name,customer_email,total")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) redirect(back({ error: "order-not-found" }));
  if (!isBankTransfer(order.metadata)) redirect(back({ error: "not-transfer" }));
  if (order.payment_status === "paid") redirect(back({ error: "already-paid" }));
  if (!["pending", "authorized"].includes(order.payment_status) || isOrderClosed(order.status, order.payment_status)) redirect(back({ error: "order-closed" }));

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: order.status === "pending" ? "confirmed" : order.status,
    p_payment_status: "paid",
  });
  if (error) redirect(back({ error: "save-failed" }));

  await notifyTransferPaid(order);

  revalidatePath("/");
  revalidatePath("/operasyon");
  revalidatePath("/siparisler");
  revalidatePath(`/siparisler/${orderId}`);
  redirect(back({ ok: "payment", order: order.order_number }));
}

/**
 * Toplu durum değişikliği.
 *
 * Yalnızca akıştaki bir sonraki adım uygulanır: "Kargoya ver"
 * seçildiğinde yalnızca hazırlanan siparişler kargoya geçer,
 * henüz onaylanmamış olanlar atlanır. Kapanmış (iptal / iade)
 * siparişler hiçbir adıma geçmez. Kurallar hızlı işlemle aynı;
 * uygunluk sunucuda yeniden hesaplanıyor, formdaki listeye
 * güvenilmiyor.
 */
export async function bulkStatus(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) redirect(backTo(formData, { error: "forbidden" }));

  const status = String(formData.get("status") ?? "");
  const ids = [...new Set(formData.getAll("order_id").map(String).filter(Boolean))].slice(0, 100);

  if (!["confirmed", "processing", "fulfilled"].includes(status)) redirect(backTo(formData, { error: "invalid-status" }));
  if (!ids.length) redirect(backTo(formData, { error: "bulk-empty" }));

  const { data: orders, error } = await supabase
    .from("arc_orders")
    .select("id,status,payment_status,order_number,customer_name,customer_email,metadata")
    .eq("organization_id", organization.id)
    .in("id", ids);
  if (error) redirect(backTo(formData, { error: "save-failed" }));

  const eligible = (orders ?? []).filter((order) => nextOrderStep(order.status, order.payment_status)?.key === status);
  const updated: typeof eligible = [];
  for (const order of eligible) {
    const { error: rpcError } = await supabase.rpc("arc_update_order_status", {
      p_order_id: order.id,
      p_status: status,
      p_payment_status: order.payment_status,
    });
    if (rpcError) console.error("Toplu durum güncellenemedi:", order.order_number, rpcError.message);
    else updated.push(order);
  }

  await Promise.all(updated.map((order) => notifyStatus(order, status)));

  revalidatePath("/");
  revalidatePath("/siparisler");
  redirect(backTo(formData, { ok: "bulk", updated: String(updated.length), skipped: String(ids.length - updated.length) }));
}
