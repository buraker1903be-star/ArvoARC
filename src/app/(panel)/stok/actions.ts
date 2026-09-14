"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

export async function adjustInventory(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) redirect("/stok?error=forbidden");

  const variantId = String(formData.get("variant_id") ?? "");
  const direction = String(formData.get("direction") ?? "in");
  const amount = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  if (!variantId || !Number.isInteger(amount) || amount <= 0 || !["in", "out", "adjustment"].includes(direction)) {
    redirect("/stok?error=invalid-movement");
  }

  const quantity = direction === "out" ? -amount : amount;
  const { error } = await supabase.rpc("arc_adjust_inventory", {
    p_variant_id: variantId,
    p_quantity: quantity,
    p_kind: direction,
    p_reference_type: "manual",
    p_reference_id: null,
    p_note: note || null,
  });

  if (error) redirect(`/stok?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath("/stok");
  redirect("/stok?updated=1");
}
