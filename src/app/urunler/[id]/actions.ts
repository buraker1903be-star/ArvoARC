"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const allowedRoles = new Set(["owner", "admin", "manager"]);

export async function updateProduct(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!allowedRoles.has(membership.role)) redirect(`/urunler/${id}?error=forbidden`);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "draft") === "active" ? "active" : "draft";
  if (!id || !name) redirect(`/urunler/${id}?error=invalid-product`);

  const { error } = await supabase
    .from("arc_products")
    .update({ name, description, status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) redirect(`/urunler/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${id}`);
  redirect(`/urunler/${id}?saved=product`);
}

export async function updateVariant(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  if (!allowedRoles.has(membership.role)) redirect(`/urunler/${productId}?error=forbidden`);

  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const priceInput = Number(formData.get("price") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";
  if (!productId || !variantId || !sku || !Number.isFinite(priceInput) || priceInput < 0) redirect(`/urunler/${productId}?error=invalid-variant`);

  const { error } = await supabase
    .from("arc_product_variants")
    .update({ sku, price: Math.round(priceInput * 100), allow_backorder: allowBackorder, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .eq("product_id", productId)
    .eq("organization_id", organization.id);

  if (error) redirect(`/urunler/${productId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/stok");
  redirect(`/urunler/${productId}?saved=variant`);
}
