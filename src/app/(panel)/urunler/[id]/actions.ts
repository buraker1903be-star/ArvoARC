"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { matrisiKur, seceneginDegerleri } from "@/lib/varyant-matrisi";

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
  badge?: string;
  badge_tone?: string;
  panelden_yonetiliyor?: boolean;
  [key: string]: unknown;
};

export async function updateProduct(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("forbidden")});

  const name = field(formData, "name", 200);
  const description = field(formData, "description", 20000);
  const requestedStatus = field(formData, "status", 20);
  const status = ["active", "draft", "archived"].includes(requestedStatus) ? requestedStatus : "draft";
  const slug = slugify(field(formData, "slug", 180) || name);
  if (!id || !name || !slug) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("invalid-product")});

  const { data: currentProduct, error: currentProductError } = await supabase
    .from("arc_products")
    .select("metadata")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (currentProductError || !currentProduct) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("product-not-found")});
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
    badge: field(formData, "badge", 40),
    badge_tone: ["green", "navy", "gold", "red"].includes(field(formData, "badge_tone", 20)) ? field(formData, "badge_tone", 20) : "green",
    /*
      İşaretliyken Shopify CSV içe aktarımı bu ürüne HİÇ dokunmuyor
      (bkz. lib/shopify-varyant.ts: panelYonetiminde). SKU'su CSV'de
      olmayan ürünlerde gerekli: içe aktarım kimliği yeniden üretip
      elle düzeltilmiş kaydın yanına ikinci bir varyant eklerdi.
    */
    panelden_yonetiliyor: formData.get("panelden_yonetiliyor") === "on",
  };

  const { error } = await supabase
    .from("arc_products")
    .update({ name, slug, description, status, metadata, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni(error.code ?? error.message)});
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${id}`);
  return await bildirimliDonus(`/urunler/${id}`,{basari:basariMetni("product")});
}

export async function createVariant(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const sku=String(formData.get("sku")??"").trim().toUpperCase();
  /*
    Başlık boşsa SKU yazılıyor, "Default" değil. Aynı üründe birkaç
    "Default" görününce hangi varyantın hangisi olduğu ne ekranda ne
    veride okunabiliyordu (28.09.2026'da canlıda tam bu oldu).
  */
  const title=String(formData.get("title")??"").trim()||sku;
  const priceInput=Number(formData.get("price")??0);
  const compareAtPriceInput=Number(formData.get("compare_at_price")??0);
  const stock=Number(formData.get("stock")??0);
  const allowBackorder=formData.get("allow_backorder")==="on";
  if(!productId||!sku||!Number.isFinite(priceInput)||priceInput<0||!Number.isFinite(compareAtPriceInput)||compareAtPriceInput<0||!Number.isInteger(stock)||stock<0)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-variant")});

  const {data:product}=await supabase.from("arc_products").select("id").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const {error}=await supabase.from("arc_product_variants").insert({organization_id:organization.id,product_id:productId,title,sku,price:Math.round(priceInput*100),compare_at_price:compareAtPriceInput>priceInput?Math.round(compareAtPriceInput*100):null,currency:"TRY",stock,allow_backorder:allowBackorder,attributes:{},external_id:null});
  if(error)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.code??error.message)});
  revalidatePath("/");revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);revalidatePath("/stok");
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("variant-created")});
}

export async function updateVariant(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});

  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const priceInput = Number(formData.get("price") ?? 0);
  const compareAtPriceInput = Number(formData.get("compare_at_price") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";
  if (!productId || !variantId || !sku || !Number.isFinite(priceInput) || priceInput < 0 || !Number.isFinite(compareAtPriceInput) || compareAtPriceInput < 0) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-variant")});

  const { error } = await supabase
    .from("arc_product_variants")
    .update({ sku, price: Math.round(priceInput * 100), compare_at_price: compareAtPriceInput > priceInput ? Math.round(compareAtPriceInput * 100) : null, allow_backorder: allowBackorder, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .eq("product_id", productId)
    .eq("organization_id", organization.id);

  if (error) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.message)});
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/stok");
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("variant")});
}


const imageTypes:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
const maxImageBytes=4*1024*1024;
type ProductMetadata={image_paths?:string[];images?:string[];[key:string]:unknown};

export async function uploadProductImages(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const files=formData.getAll("images").filter((value):value is File=>value instanceof File&&value.size>0);
  if(!productId||!files.length||files.length>5)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-images")});

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const metadata=(product.metadata??{}) as ProductMetadata;
  const existing=metadata.image_paths??[];
  if(existing.length+files.length>8)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("max-8-images")});

  const uploaded:string[]=[];
  for(const [index,file] of files.entries()){
    const extension=imageTypes[file.type.toLowerCase()];
    if(!extension||file.size>maxImageBytes){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-image-file")});
    }
    const path=`${organization.id}/${productId}/manual-${Date.now()}-${index+1}.${extension}`;
    const {error}=await supabase.storage.from("arc-product-images").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
    if(error){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.message)});
    }
    uploaded.push(path);
  }

  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:[...existing,...uploaded],images:[]}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError){
    await supabase.storage.from("arc-product-images").remove(uploaded);
    return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(updateError.message)});
  }
  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("images")});
}

export async function removeProductImage(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  const path=String(formData.get("path")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const prefix=`${organization.id}/${productId}/`;
  if(!productId||!path.startsWith(prefix))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-image-path")});

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const metadata=(product.metadata??{}) as ProductMetadata;
  const paths=metadata.image_paths??[];
  if(!paths.includes(path))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("image-not-found")});

  const {error:storageError}=await supabase.storage.from("arc-product-images").remove([path]);
  if(storageError)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(storageError.message)});
  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:paths.filter(item=>item!==path)}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(updateError.message)});
  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("image-removed")});
}

/*
  VARYANT MATRİSİ — seçeneklerin çarpımından toplu ekleme.

  Varyant tek tek ekleniyordu ve her biri tam bir gezinme: dört renk ×
  beş bedenlik bir tişört yirmi gönderim demekti. Matris aynı işi tek
  gönderimde yapıyor.

  TEK INSERT. Satır satır yazmak, ortada düşen bir kayıttan sonra
  ürünü yarım bırakırdı; tek çağrı ya hepsini yazıyor ya hiçbirini.
  Çakışmalar zaten önceden çözülüyor (lib/varyant-matrisi.ts), yani
  23505 buraya gelmiyor — gelirse gerçekten beklenmedik bir şey var.
*/
export async function varyantMatrisi(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const productId = String(formData.get("product_id") ?? "");
  const donus = `/urunler/${productId}`;
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(donus, { hata: hataMetni("forbidden") });

  const priceInput = Number(formData.get("price") ?? 0);
  const compareInput = Number(formData.get("compare_at_price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";
  if (!productId || !Number.isFinite(priceInput) || priceInput <= 0 || !Number.isFinite(compareInput) || compareInput < 0 || !Number.isInteger(stock) || stock < 0) {
    return await bildirimliDonus(donus, { hata: hataMetni("invalid-variant") });
  }

  const { data: product, error: productError } = await supabase
    .from("arc_products").select("id,name,slug").eq("organization_id", organization.id).eq("id", productId).maybeSingle();
  if (productError || !product) return await bildirimliDonus(donus, { hata: hataMetni("product-not-found") });

  /*
    Var olan varyantlar çakışma denetimi için okunuyor. Hata
    YUTULMUYOR: boş liste saymak, üründe zaten duran bir birleşimi
    ikinci kez eklemeye çalışmak demekti.
  */
  const { data: mevcut, error: mevcutHatasi } = await supabase
    .from("arc_product_variants").select("sku,title").eq("organization_id", organization.id).eq("product_id", productId);
  if (mevcutHatasi) return await bildirimliDonus(donus, { hata: hataMetni(mevcutHatasi.message) });
  const mevcutVaryantlar = mevcut ?? [];

  const secenekler = [1, 2, 3].map((sira) => ({
    ad: field(formData, `secenek_ad_${sira}`, 40),
    degerler: seceneginDegerleri(field(formData, `secenek_deger_${sira}`, 600)),
  }));

  /* Önek boşsa üründen türüyor: kullanıcı kod düşünmek zorunda kalmasın. */
  const onek = field(formData, "sku_oneki", 16) || product.slug || product.name;
  const { satirlar, atlanan, hata } = matrisiKur(secenekler, {
    skuOneki: onek,
    mevcutSkular: mevcutVaryantlar.map((varyant) => String(varyant.sku ?? "")),
    mevcutBasliklar: mevcutVaryantlar.map((varyant) => String(varyant.title ?? "")),
  });
  if (hata) return await bildirimliDonus(donus, { hata });

  const compareAt = compareInput > priceInput ? Math.round(compareInput * 100) : null;
  const { error } = await supabase.from("arc_product_variants").insert(
    satirlar.map((satir) => ({
      organization_id: organization.id,
      product_id: productId,
      title: satir.baslik,
      sku: satir.sku,
      price: Math.round(priceInput * 100),
      compare_at_price: compareAt,
      currency: "TRY",
      stock,
      allow_backorder: allowBackorder,
      attributes: satir.nitelikler,
      external_id: null,
    })),
  );
  if (error) return await bildirimliDonus(donus, { hata: hataMetni(error.code ?? error.message) });

  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath(donus);
  revalidatePath("/stok");
  /* Atlananlar SAYILIYOR: "12 eklendi" deyip 3'ünü sessizce düşürmek,
     kullanıcıya eksik bir kataloğu tam gibi gösterirdi. */
  return await bildirimliDonus(donus, {
    basari: `${satirlar.length} varyant eklendi${atlanan ? `; ${atlanan} birleşim üründe zaten vardı` : ""}.`,
  });
}
