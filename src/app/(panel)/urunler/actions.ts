"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { backUrl } from "@/lib/back-url";

const MANAGERS = ["owner", "admin", "manager"];
const STATUSES = ["active", "draft", "archived"];

function slugify(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createProduct(formData: FormData) {
  const { supabase, user, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) redirect("/urunler?error=forbidden");

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const priceInput = Number(formData.get("price") ?? 0);
  const compareAtPriceInput = Number(formData.get("compare_at_price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";

  if (!name || !sku || !Number.isFinite(priceInput) || priceInput < 0 || !Number.isFinite(compareAtPriceInput) || compareAtPriceInput < 0 || !Number.isInteger(stock)) redirect("/urunler?error=invalid-product&yeni=1#yeni-urun");

  const slug = `${slugify(name)}-${Date.now().toString(36)}`;
  const price = Math.round(priceInput * 100);
  const compareAtPrice = compareAtPriceInput > priceInput ? Math.round(compareAtPriceInput * 100) : null;
  const { data: product, error: productError } = await supabase.from("arc_products").insert({ organization_id: organization.id, name, slug, description, status: status === "active" ? "active" : "draft", source: "native", created_by: user.id }).select("id").single();
  if (productError) redirect(`/urunler?error=${encodeURIComponent(productError.code ?? "product-create")}&yeni=1#yeni-urun`);

  const { error: variantError } = await supabase.from("arc_product_variants").insert({ organization_id: organization.id, product_id: product.id, sku, price, compare_at_price: compareAtPrice, currency: "TRY", stock, allow_backorder: allowBackorder, attributes: {} });
  if (variantError) {
    await supabase.from("arc_products").delete().eq("id", product.id).eq("organization_id", organization.id);
    redirect(`/urunler?error=${encodeURIComponent(variantError.code ?? "variant-create")}&yeni=1#yeni-urun`);
  }

  revalidatePath("/");
  revalidatePath("/urunler");
  /* Yeni ürün doğrudan düzenleyicide açılır: görsel, açıklama ve
     SEO bir sonraki adım. */
  redirect(`/urunler/${product.id}?saved=created`);
}

/**
 * Seçilen ürünlerin durumu (listede işaretlenenler).
 *
 * Yalnızca durumu farklı olanlar güncellenir; aynı durumdakiler
 * atlanır ve sayısı bildirilir.
 */
export async function bulkSetStatus(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const back = (result: Record<string, string>) => backUrl(formData.get("back"), "/urunler", result);
  if (!MANAGERS.includes(membership.role)) redirect(back({ error: "forbidden" }));

  const status = String(formData.get("status") ?? "");
  const ids = [...new Set(formData.getAll("product_id").map(String).filter(Boolean))].slice(0, 100);
  if (!STATUSES.includes(status)) redirect(back({ error: "invalid-status" }));
  if (!ids.length) redirect(back({ error: "bulk-empty" }));

  const { data, error } = await supabase
    .from("arc_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id)
    .in("id", ids)
    .neq("status", status)
    .select("id");
  if (error) redirect(back({ error: "bulk-failed" }));

  const updated = data?.length ?? 0;
  revalidatePath("/");
  revalidatePath("/urunler");
  redirect(back({ ok: "bulk-selected", updated: String(updated), skipped: String(ids.length - updated) }));
}

/**
 * Toplu durum değişikliği (filtreye uyan tüm ürünler).
 *
 * 3.264 tedarikçi ürününü tek tek yayınlamak makul değil.
 * Bu eylem bir filtreye uyan tüm ürünlerin durumunu değiştirir.
 *
 * Filtre zorunlu: filtresiz çalıştırmak tüm katalogu tek
 * hamlede değiştirir ve geri alması zordur.
 */
export async function bulkUpdateStatus(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!MANAGERS.includes(membership.role)) {
    redirect("/urunler?error=forbidden");
  }

  const status = String(formData.get("status") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const collectionSlug = String(formData.get("collection") ?? "").trim();
  const currentStatus = String(formData.get("current_status") ?? "").trim();

  if (!STATUSES.includes(status)) {
    redirect("/urunler?error=invalid-status");
  }

  // En az bir daraltıcı koşul olmalı.
  if (!supplier && !collectionSlug) {
    redirect("/urunler?error=bulk-needs-filter");
  }

  let query = supabase
    .from("arc_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id);

  if (supplier) query = query.eq("supplier", supplier);
  if (currentStatus) query = query.eq("status", currentStatus);

  if (collectionSlug) {
    const { data: collection } = await supabase
      .from("arc_collections")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("slug", collectionSlug)
      .maybeSingle();

    if (!collection) redirect("/urunler?error=collection-not-found");

    const { data: members } = await supabase
      .from("arc_collection_products")
      .select("product_id")
      .eq("collection_id", collection.id);

    const ids = (members ?? []).map((row) => row.product_id);
    if (ids.length === 0) redirect("/urunler?error=empty-collection");

    query = query.in("id", ids);
  }

  const { data, error } = await query.select("id");
  if (error) redirect("/urunler?error=bulk-failed");

  revalidatePath("/");
  revalidatePath("/urunler");
  redirect(`/urunler?ok=bulk&updated=${data?.length ?? 0}`);
}
