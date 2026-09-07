"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

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
