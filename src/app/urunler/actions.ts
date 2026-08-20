"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createProduct(formData: FormData) {
  const { supabase, user, organization, membership } = await requireTenant();

  if (!["owner", "admin", "manager"].includes(membership.role)) {
    redirect("/urunler?error=forbidden");
  }

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const priceInput = Number(formData.get("price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);

  if (!name || !sku || !Number.isFinite(priceInput) || priceInput < 0 || !Number.isInteger(stock) || stock < 0) {
    redirect("/urunler?error=invalid-product");
  }

  const slug = `${slugify(name)}-${Date.now().toString(36)}`;
  const price = Math.round(priceInput * 100);

  const { data: product, error: productError } = await supabase
    .from("arc_products")
    .insert({
      organization_id: organization.id,
      name,
      slug,
      description,
      status: status === "active" ? "active" : "draft",
      source: "native",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (productError) redirect(`/urunler?error=${encodeURIComponent(productError.code ?? "product-create")}`);

  const { error: variantError } = await supabase.from("arc_product_variants").insert({
    organization_id: organization.id,
    product_id: product.id,
    sku,
    price,
    currency: "TRY",
    stock,
    attributes: {},
  });

  if (variantError) {
    await supabase.from("arc_products").delete().eq("id", product.id).eq("organization_id", organization.id);
    redirect(`/urunler?error=${encodeURIComponent(variantError.code ?? "variant-create")}`);
  }

  revalidatePath("/");
  revalidatePath("/urunler");
  redirect("/urunler?created=1");
}
