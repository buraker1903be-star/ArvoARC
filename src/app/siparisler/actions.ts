"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

export async function createOrder(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) redirect("/siparisler?error=forbidden");

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const variantId = String(formData.get("variant_id") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 0);

  if (!variantId || !Number.isInteger(quantity) || quantity <= 0) redirect("/siparisler?error=invalid-order");

  const { data, error } = await supabase.rpc("arc_create_order", {
    p_customer_name: customerName,
    p_customer_email: customerEmail,
    p_items: [{ variant_id: variantId, quantity }],
    p_source: "native",
  });

  if (error) redirect(`/siparisler?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/siparisler");
  const orderNumber = data?.[0]?.order_number ?? "created";
  redirect(`/siparisler?created=${encodeURIComponent(orderNumber)}`);
}
