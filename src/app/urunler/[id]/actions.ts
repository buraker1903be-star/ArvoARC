"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const allowedRoles = new Set(["owner", "admin", "manager"]);

const field = (formData: FormData, name: string, maxLength: number) =>
  String(formData.get(name) ?? "").trim().slice(0, maxLength);

const slugify = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

type EditableProductMetadata = {
  subtitle?: string;
  vendor?: string;
  type?: string;
  tags?: string;
  seo_title?: string;
  seo_description?: string;
  google_product_category?: string;
  gtin?: string;
  mpn?: string;
  condition?: string;
  material?: string;
  color?: string;
  gender?: string;
  age_group?: string;
  [key: string]: unknown;
};

export async function updateProduct(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!allowedRoles.has(membership.role)) redirect(`/urunler/${id}?error=forbidden`);

  const name = field(formData, "name", 200);
  const description = field(formData, "description", 20000);
  const requestedStatus = field(formData, "status", 20);
  const status = ["active", "draft", "archived"].includes(requestedStatus) ? requestedStatus : "draft";
  const slug = slugify(field(formData, "slug", 180) || name);
  if (!id || !name || !slug) redirect(`/urunler/${id}?error=invalid-product`);

  const { data: currentProduct, error: currentProductError } = await supabase
    .from("arc_products")
    .select("metadata")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (currentProductError || !currentProduct) redirect(`/urunler/${id}?error=product-not-found`);
  const currentMetadata = (currentProduct.metadata ?? {}) as EditableProductMetadata;
  const metadata: EditableProductMetadata = {
    ...currentMetadata,
    subtitle: field(formData, "subtitle", 240),
    vendor: field(formData, "vendor", 120),
    type: field(formData, "type", 120),
    tags: field(formData, "tags", 500),
    seo_title: field(formData, "seo_title", 70),
    seo_description: field(formData, "seo_description", 180),
    google_product_category: field(formData, "google_product_category", 240),
    gtin: field(formData, "gtin", 32),
    mpn: field(formData, "mpn", 80),
    condition: field(formData, "condition", 20) || "new",
    material: field(formData, "material", 120),
    color: field(formData, "color", 120),
    gender: field(formData, "gender", 30),
    age_group: field(formData, "age_group", 30),
  };

  const { error } = await supabase
    .from("arc_products")
    .update({ name, slug, description, status, metadata, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) redirect(`/urunler/${id}?error=${encodeURIComponent(error.code ?? error.message)}`);
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${id}`);
  redirect(`/urunler/${id}?saved=product`);
}

export async function createVariant(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))redirect(`/urunler/${productId}?error=forbidden`);
  const title=String(formData.get("title")??"").trim()||"Default";
  const sku=String(formData.get("sku")??"").trim().toUpperCase();
  const priceInput=Number(formData.get("price")??0);
  const stock=Number(formData.get("stock")??0);
  const allowBackorder=formData.get("allow_backorder")==="on";
  if(!productId||!sku||!Number.isFinite(priceInput)||priceInput<0||!Number.isInteger(stock))redirect(`/urunler/${productId}?error=invalid-variant`);

  const {data:product}=await supabase.from("arc_products").select("id").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(!product)redirect(`/urunler/${productId}?error=product-not-found`);
  const {error}=await supabase.from("arc_product_variants").insert({organization_id:organization.id,product_id:productId,title,sku,price:Math.round(priceInput*100),currency:"TRY",stock,allow_backorder:allowBackorder,attributes:{},external_id:null});
  if(error)redirect(`/urunler/${productId}?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/");revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);revalidatePath("/stok");
  redirect(`/urunler/${productId}?saved=variant-created`);
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


const imageTypes:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
const maxImageBytes=10*1024*1024;
type ProductMetadata={image_paths?:string[];images?:string[];[key:string]:unknown};

export async function uploadProductImages(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))redirect(`/urunler/${productId}?error=forbidden`);
  const files=formData.getAll("images").filter((value):value is File=>value instanceof File&&value.size>0);
  if(!productId||!files.length||files.length>5)redirect(`/urunler/${productId}?error=invalid-images`);

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)redirect(`/urunler/${productId}?error=product-not-found`);
  const metadata=(product.metadata??{}) as ProductMetadata;
  const existing=metadata.image_paths??[];
  if(existing.length+files.length>8)redirect(`/urunler/${productId}?error=max-8-images`);

  const uploaded:string[]=[];
  for(const [index,file] of files.entries()){
    const extension=imageTypes[file.type.toLowerCase()];
    if(!extension||file.size>maxImageBytes){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      redirect(`/urunler/${productId}?error=invalid-image-file`);
    }
    const path=`${organization.id}/${productId}/manual-${Date.now()}-${index+1}.${extension}`;
    const {error}=await supabase.storage.from("arc-product-images").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
    if(error){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      redirect(`/urunler/${productId}?error=${encodeURIComponent(error.message)}`);
    }
    uploaded.push(path);
  }

  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:[...existing,...uploaded],images:[]}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError){
    await supabase.storage.from("arc-product-images").remove(uploaded);
    redirect(`/urunler/${productId}?error=${encodeURIComponent(updateError.message)}`);
  }
  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  redirect(`/urunler/${productId}?saved=images`);
}

export async function removeProductImage(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  const path=String(formData.get("path")??"");
  if(!allowedRoles.has(membership.role))redirect(`/urunler/${productId}?error=forbidden`);
  const prefix=`${organization.id}/${productId}/`;
  if(!productId||!path.startsWith(prefix))redirect(`/urunler/${productId}?error=invalid-image-path`);

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)redirect(`/urunler/${productId}?error=product-not-found`);
  const metadata=(product.metadata??{}) as ProductMetadata;
  const paths=metadata.image_paths??[];
  if(!paths.includes(path))redirect(`/urunler/${productId}?error=image-not-found`);

  const {error:storageError}=await supabase.storage.from("arc-product-images").remove([path]);
  if(storageError)redirect(`/urunler/${productId}?error=${encodeURIComponent(storageError.message)}`);
  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:paths.filter(item=>item!==path)}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError)redirect(`/urunler/${productId}?error=${encodeURIComponent(updateError.message)}`);
  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  redirect(`/urunler/${productId}?saved=image-removed`);
}
