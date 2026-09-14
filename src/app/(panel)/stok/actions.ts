"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { backUrl } from "@/lib/back-url";

/**
 * Stok hareketi. Listedeki satır içi "+ Giriş / − Çıkış" (varyant
 * kimliğiyle) ve detaylı form (SKU ile) aynı işlemi kullanır.
 *
 * Öncesinde form yalnızca listenin ilk 100 varyantını açılır
 * listede sunuyordu: kalan varyantların stoğu panelden
 * değiştirilemiyordu.
 */
export async function adjustInventory(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const back = (result: Record<string, string>) => backUrl(formData.get("back"), "/stok", result);
  if (!["owner", "admin", "manager"].includes(membership.role)) redirect(back({ error: "forbidden" }));

  const direction = String(formData.get("direction") ?? "in");
  const amount = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const variantInput = String(formData.get("variant_id") ?? "");
  const skuInput = String(formData.get("sku") ?? "").trim().toUpperCase();

  if ((!variantInput && !skuInput) || !Number.isInteger(amount) || amount <= 0 || !["in", "out", "adjustment"].includes(direction)) {
    redirect(back({ error: "invalid-movement" }));
  }

  /* Varyant bu mağazaya ait olmalı; SKU ile gelen istek kimliğe çevrilir. */
  const lookup = supabase.from("arc_product_variants").select("id,sku").eq("organization_id", organization.id);
  const { data: variant } = await (variantInput ? lookup.eq("id", variantInput) : lookup.eq("sku", skuInput)).maybeSingle();
  if (!variant) redirect(back({ error: "variant-not-found" }));

  const quantity = direction === "out" ? -amount : amount;
  const { error } = await supabase.rpc("arc_adjust_inventory", {
    p_variant_id: variant.id,
    p_quantity: quantity,
    p_kind: direction,
    p_reference_type: "manual",
    p_reference_id: null,
    p_note: note || null,
  });

  if (error) redirect(back({ error: error.message }));
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath("/stok");
  redirect(back({ updated: `${variant.sku} ${quantity > 0 ? "+" : ""}${quantity}` }));
}
