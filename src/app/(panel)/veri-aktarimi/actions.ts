"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { maliyetleriAyristir } from "@/lib/maliyet-aktarimi";
import { fiyatKarari, skuAdaylari } from "@/lib/fiyat-aktarimi";
import { copyShopifyImages } from "@/lib/product-images";
import { fetchAllRows } from "@/lib/fetch-all";
import { parseMoneyToCents } from "@/lib/money";

type Row = Record<string,string>;

const clean=(value:string|undefined,max=500)=>String(value??"").trim().slice(0,max);
function parseCsv(text:string):Row[]{
  const matrix:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i]; if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))matrix.push(row);row=[];cell="";}else cell+=c;}
  if(cell||row.length){row.push(cell);matrix.push(row);} const headers=(matrix.shift()??[]).map(x=>x.replace(/^\uFEFF/,''));
  return matrix.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??""])));
}

export async function importActiveProducts(formData:FormData){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!["owner","admin","manager"].includes(membership.role)) return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni("forbidden")});
  const file=formData.get("file"); if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".csv")) return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni("csv-required")});
  const rows=parseCsv(await file.text()); const groups=new Map<string,Row[]>();
  for(const r of rows){const h=(r.Handle??"").trim();if(h){if(!groups.has(h))groups.set(h,[]);groups.get(h)!.push(r);}}
  const active=[...groups.entries()].filter(([,g])=>g.find(r=>r.Status?.trim())?.Status.trim().toLowerCase()==="active");
  const {data:batch,error:batchError}=await supabase.from("arc_import_batches").insert({organization_id:organization.id,source:"shopify",kind:"products",file_name:file.name,status:"processing",total_rows:active.length,created_by:user.id}).select("id").single();
  if(batchError) return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni(batchError.message)});
  let imported=0,errors=0;
  for(const [handle,g] of active){try{
    const first=g.find(r=>r.Title?.trim())??g[0]; const description=(first["Body (HTML)"]??"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").trim();
    const shopifyImageSources=[...new Set(g.map(r=>r["Image Src"]?.trim()).filter((value):value is string=>Boolean(value)))];
    const plainDescription=description.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
    const shopifyMetadata={
      shopify_handle:handle,
      vendor:clean(first.Vendor,120),
      type:clean(first.Type,120),
      tags:clean(first.Tags,500),
      subtitle:clean(first["SEO Description"],240)||plainDescription.slice(0,140),
      seo_title:clean(first["SEO Title"],70)||clean(first.Title,70),
      seo_description:clean(first["SEO Description"],180)||plainDescription.slice(0,180),
      google_product_category:clean(first["Google Shopping / Google Product Category"],240),
      gender:clean(first["Google Shopping / Gender"],30),
      age_group:clean(first["Google Shopping / Age Group"],30),
      mpn:clean(first["Google Shopping / MPN"],80),
      condition:clean(first["Google Shopping / Condition"],20)||"new",
      gtin:clean(g.find(row=>row["Variant Barcode"]?.trim())?.["Variant Barcode"],32),
      images:[],
      shopify_image_sources:shopifyImageSources,
      images_migrated:false
    };
    const optionNames:Record<number,string>={};
    for(const i of [1,2,3]) optionNames[i]=g.find(r=>r[`Option${i} Name`]?.trim())?.[`Option${i} Name`]?.trim()??"";
    const {data:product,error:pe}=await supabase.from("arc_products").upsert({organization_id:organization.id,name:first.Title?.trim()||handle,slug:handle,description,status:"active",source:"shopify",external_id:handle,metadata:shopifyMetadata},{onConflict:"organization_id,source,external_id"}).select("id").single(); if(pe)throw pe;
    const copiedImages=await copyShopifyImages(supabase,organization.id,product.id,shopifyImageSources);
    const {error:imageMetadataError}=await supabase.from("arc_products").update({metadata:{...shopifyMetadata,image_paths:copiedImages.paths,images_migrated:copiedImages.errors.length===0,image_migration_errors:copiedImages.errors}}).eq("organization_id",organization.id).eq("id",product.id);
    if(imageMetadataError)throw imageMetadataError;
    /*
      Varyantlar toplu yazılır. Öncesinde her varyant için ayrı bir
      okuma ve yazma yapılıyordu (ürün başına 2 × varyant ağ turu);
      büyük CSV'ler süre sınırına takılıp yarıda kesiliyordu. Mevcut
      stok tek sorguda okunup korunur, tüm satırlar tek upsert'le yazılır.
    */
    const variants=g.filter(r=>r["Variant Price"]?.trim()||r["Variant SKU"]?.trim()||r["Option1 Value"]?.trim()); const seen=new Set<string>(); let n=0;
    const variantRows:{organization_id:string;product_id:string;sku:string;title:string;price:number;compare_at_price:number|null;currency:string;stock:number;attributes:Record<string,string>;external_id:string;allow_backorder:boolean}[]=[];
    for(const r of variants){const key=[r["Option1 Value"],r["Option2 Value"],r["Option3 Value"],r["Variant SKU"],r["Variant Price"]].join("|");if(seen.has(key))continue;seen.add(key);n++;
      const attrs:Record<string,string>={};for(const i of [1,2,3]){const name=optionNames[i],value=r[`Option${i} Value`]?.trim();if(name&&value)attrs[name]=value;}
      const sku=r["Variant SKU"]?.trim()||`ArvoARC-${handle.slice(0,35).toUpperCase()}-${String(n).padStart(3,"0")}`; const price=moneyToCents(r["Variant Price"]); const rawCompareAtPrice=moneyToCents(r["Variant Compare At Price"]); const compareAtPrice=rawCompareAtPrice>price?rawCompareAtPrice:null;
      variantRows.push({organization_id:organization.id,product_id:product.id,sku,title:Object.values(attrs).join(" / ")||"Default",price,compare_at_price:compareAtPrice,currency:"TRY",stock:0,attributes:attrs,external_id:`${handle}:${n}`,allow_backorder:true});
    }
    if(variantRows.length){
      const {data:existing,error:existingError}=await supabase.from("arc_product_variants").select("external_id,stock").eq("organization_id",organization.id).in("external_id",variantRows.map(row=>row.external_id));
      if(existingError)throw existingError;
      const stockByExternalId=new Map((existing??[]).map(row=>[row.external_id,row.stock]));
      const {error:ve}=await supabase.from("arc_product_variants").upsert(variantRows.map(row=>({...row,stock:stockByExternalId.get(row.external_id)??0})),{onConflict:"organization_id,external_id"});
      if(ve)throw ve;
    }
    imported++;
  }catch(e){errors++;await supabase.from("arc_import_errors").insert({batch_id:batch.id,organization_id:organization.id,row_key:handle,message:e instanceof Error?e.message:"Import error"});}}
  await supabase.from("arc_import_batches").update({status:errors?"failed":"completed",imported_rows:imported,error_rows:errors,completed_at:new Date().toISOString()}).eq("id",batch.id);
  revalidatePath("/urunler");revalidatePath("/koleksiyonlar");revalidatePath("/veri-aktarimi");return await bildirimliDonus("/veri-aktarimi",
    errors
      ? {uyari:`${imported} aktif ürün aktarıldı. ${errors} satır hatalı olduğu için aktarılamadı.`}
      : {basari:`${imported} aktif ürün aktarıldı.`});
}

type ProductMetadata={
  images?:string[];
  image_paths?:string[];
  shopify_image_sources?:string[];
  images_migrated?:boolean;
  image_migration_errors?:string[];
  [key:string]:unknown;
};

/*
  Taşınmamış ürünler veritabanında süzülür. Öncesinde sırasız ilk
  250 Shopify ürünü çekilip içinde aranıyordu: bu 250'si taşınınca
  kalanlar hiç işlenmiyor, ekranda "kalan 0" yazıyordu.

  Denenen ürüne deneme zamanı yazılır ve sıralama ona göre yapılır;
  hata veren ürün her turda başa gelip ilerlemeyi kilitlemez.
*/
const UNMIGRATED="metadata->>images_migrated.is.null,metadata->>images_migrated.neq.true";

export async function migrateShopifyImages(){
  const {supabase,organization,membership}=await requireTenant();
  if(!["owner","admin","manager"].includes(membership.role)) return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni("forbidden")});

  const [{data:products,error},{count:pendingCount,error:countError}]=await Promise.all([
    supabase.from("arc_products").select("id,metadata").eq("organization_id",organization.id).eq("source","shopify").or(UNMIGRATED)
      .order("metadata->>image_migration_attempted_at",{ascending:true,nullsFirst:true}).order("id").limit(5),
    supabase.from("arc_products").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("source","shopify").or(UNMIGRATED),
  ]);
  if(error||countError)return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni((error??countError)?.message??"images")});

  const pending=products??[];
  let migrated=0,failed=0;
  for(const product of pending){
    const metadata={...((product.metadata??{}) as ProductMetadata),image_migration_attempted_at:new Date().toISOString()};
    const sources=metadata.shopify_image_sources?.length
      ? metadata.shopify_image_sources
      : (metadata.images??[]).filter(source=>{try{return new URL(source).hostname==="cdn.shopify.com";}catch{return false;}});
    if(!sources.length){
      const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,images:[],image_paths:[],images_migrated:true,image_migration_errors:[]}}).eq("organization_id",organization.id).eq("id",product.id);
      if(updateError)failed++;else migrated++;
      continue;
    }
    const result=await copyShopifyImages(supabase,organization.id,product.id,sources);
    const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,images:[],image_paths:result.paths,shopify_image_sources:sources,images_migrated:result.errors.length===0,image_migration_errors:result.errors}}).eq("organization_id",organization.id).eq("id",product.id);
    if(updateError||result.errors.length)failed++;else migrated++;
  }

  revalidatePath("/urunler");revalidatePath("/veri-aktarimi");
  const kalan=Math.max(0,(pendingCount??0)-migrated);
  const ozet=`${migrated} ürünün görselleri ArvoARC depolamasına taşındı. Hata: ${failed} · Kalan ürün: ${kalan}`;
  return await bildirimliDonus("/veri-aktarimi", failed?{uyari:ozet}:{basari:ozet});
}

/* Türkçe ve İngilizce biçimli tutarlar (bkz. lib/money). */
const moneyToCents=parseMoneyToCents;

function historicalOrderStatus(row:Row){
  const financial=(row["Financial Status"]??"").trim().toLowerCase();
  const fulfillment=(row["Fulfillment Status"]??"").trim().toLowerCase();
  if((row["Cancelled at"]??"").trim())return "cancelled";
  if(financial==="refunded")return "refunded";
  if(fulfillment==="fulfilled")return "fulfilled";
  if(fulfillment==="partial")return "processing";
  if(["paid","partially_refunded"].includes(financial))return "confirmed";
  return "pending";
}

function historicalPaymentStatus(row:Row){
  const value=(row["Financial Status"]??"").trim().toLowerCase();
  if(value==="paid")return "paid";
  if(value==="authorized")return "authorized";
  if(value==="partially_refunded")return "partially_refunded";
  if(value==="refunded")return "refunded";
  if(["voided","failed"].includes(value))return "failed";
  return "pending";
}

export async function importHistoricalOrders(formData:FormData){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!["owner","admin","manager"].includes(membership.role))return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni("forbidden")});
  const file=formData.get("file");
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".csv"))return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni("orders-csv-required")});

  const rows=parseCsv(await file.text());
  const groups=new Map<string,Row[]>();
  let skipped=0;
  for(const row of rows){
    const key=(row.Name??row.Id??"").trim();
    if(!key){skipped++;continue;}
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(row);
  }

  const {data:batch,error:batchError}=await supabase.from("arc_import_batches").insert({
    organization_id:organization.id,source:"shopify",kind:"orders",file_name:file.name,status:"processing",
    total_rows:groups.size,skipped_rows:skipped,created_by:user.id
  }).select("id").single();
  if(batchError)return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni(batchError.message)});

  /*
    SKU eşlemesi için tüm varyantlar sayfalanarak okunur. Tek istekte
    Supabase 1000 satırda kesiyordu; kataloğun geri kalanındaki
    SKU'lar geçmiş siparişlere bağlanmıyordu.
  */
  let variants:{id:string;sku:string|null}[]=[];
  try{
    ({rows:variants}=await fetchAllRows<{id:string;sku:string|null}>((from,to)=>supabase.from("arc_product_variants").select("id,sku").eq("organization_id",organization.id).order("id").range(from,to) as unknown as PromiseLike<{data:{id:string;sku:string|null}[]|null;error:{message:string}|null}>,100_000));
  }catch(error){return await bildirimliDonus("/veri-aktarimi",{hata:hataMetni(error instanceof Error?error.message:"variants")});}
  const variantBySku=new Map(variants.filter((v):v is {id:string;sku:string}=>Boolean(v.sku)).map(v=>[v.sku.trim().toLowerCase(),v.id]));
  let imported=0,errors=0;

  for(const [key,group] of groups){
    try{
      const first=group[0];
      const subtotal=moneyToCents(first.Subtotal);
      const tax=moneyToCents(first.Taxes);
      const shipping=moneyToCents(first.Shipping);
      const total=moneyToCents(first.Total)||(subtotal+tax+shipping);
      const createdAt=(first["Created at"]??"").trim();
      const parsedCreatedAt=createdAt&&!Number.isNaN(Date.parse(createdAt))?new Date(createdAt).toISOString():new Date().toISOString();
      const externalId=(first.Id??key).trim();
      const customerName=(first["Billing Name"]??first["Shipping Name"]??"").trim();

      const {data:order,error:orderError}=await supabase.from("arc_orders").upsert({
        organization_id:organization.id,order_number:key,source:"shopify",external_id:externalId,
        status:historicalOrderStatus(first),payment_status:historicalPaymentStatus(first),
        customer_email:(first.Email??"").trim()||null,customer_name:customerName||null,
        currency:(first.Currency??"TRY").trim()||"TRY",subtotal,tax,shipping,total,created_at:parsedCreatedAt,
        metadata:{historical_import:true,shopify_created_at:createdAt||null,financial_status:first["Financial Status"]??null,fulfillment_status:first["Fulfillment Status"]??null}
      },{onConflict:"organization_id,source,external_id"}).select("id").single();
      if(orderError)throw orderError;

      const {error:deleteError}=await supabase.from("arc_order_items").delete().eq("organization_id",organization.id).eq("order_id",order.id);
      if(deleteError)throw deleteError;
      const items=group.map(row=>{
        const quantity=Math.max(0,Number.parseInt(row["Lineitem quantity"]??"0",10)||0);
        const unitPrice=moneyToCents(row["Lineitem price"]);
        const sku=(row["Lineitem sku"]??"").trim();
        return {organization_id:organization.id,order_id:order.id,variant_id:sku?variantBySku.get(sku.toLowerCase())??null:null,
          product_name:(row["Lineitem name"]??"Ürün").trim()||"Ürün",sku:sku||"SHOPIFY-HISTORICAL",
          quantity,unit_price:unitPrice,total:unitPrice*quantity};
      }).filter(item=>item.quantity>0);
      if(items.length){
        const {error:itemError}=await supabase.from("arc_order_items").insert(items);
        if(itemError)throw itemError;
      }
      imported++;
    }catch(error){
      errors++;
      await supabase.from("arc_import_errors").insert({batch_id:batch.id,organization_id:organization.id,row_key:key,message:error instanceof Error?error.message:"Order import error"});
    }
  }

  await supabase.from("arc_import_batches").update({status:errors?"failed":"completed",imported_rows:imported,error_rows:errors,completed_at:new Date().toISOString()}).eq("id",batch.id);
  revalidatePath("/siparisler");revalidatePath("/veri-aktarimi");
  const siparisOzeti=`${imported} eski sipariş aktarıldı. Hata: ${errors} · Atlanan satır: ${skipped}`;
  return await bildirimliDonus("/veri-aktarimi", errors?{uyari:siparisOzeti}:{basari:siparisOzeti});
}


/*
  LR FİYAT AKTARIMI — iki geçiş, iki adım.

  GEÇİŞ, çünkü hangi fiyatın hangisi olduğunu tahmin etmek yerine
  kullanıcı söylüyor: LR'ın sayfasında girişliyken alış, çıkışken
  müşteri fiyatı görünüyor. Aynı listeyi iki kez topluyoruz ve her
  seferinde hangisi olduğunu seçiyoruz. Tahmin etmek, sayfa değişince
  sessizce yanlış fiyat yazmak demekti.

  ADIM, çünkü tek hamlede yazmak tehlikeli: yapıştırılan metin yanlış
  sütundan kopyalanmış olabilir. Kullanıcı ESKİ → YENİ değerleri görüp
  onaylıyor.

  LR kendi de satış yapıyor: müşteri fiyatı TAVAN, satış fiyatı onun
  altında (lib/fiyat-aktarimi.ts). LR kampanya yapınca tavan düşüyor ve
  kampanya kendiliğinden vitrine yansıyor.
*/
export type FiyatGecisi = "alis" | "musteri";

export type MaliyetOnizleme = {
  eslesen: {
    sku: string;
    ad: string;
    eski: number | null;
    yeni: number;
    /** Müşteri geçişinde hesaplanan satış fiyatı ve üstü çizili değer. */
    satis?: number;
    ustuCizili?: number | null;
    sorun?: string;
  }[];
  eslesmeyen: string[];
  atlanan: string[];
};

const SORUN_METNI: Record<string, string> = {
  "tavan-yok": "LR fiyatı okunamadı",
  "indirim-fiyati-asiyor": "indirim fiyatı sıfıra indiriyor",
  "maliyetin-altinda": "satış fiyatı maliyetin altına düşüyor",
};

export async function maliyetOnizle(
  metin: string,
  gecis: FiyatGecisi = "alis",
  indirimKurus = 0,
): Promise<MaliyetOnizleme> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) {
    return { eslesen: [], eslesmeyen: [], atlanan: ["Bu işlem için yetkiniz yok."] };
  }

  const { satirlar, atlanan } = maliyetleriAyristir(metin);
  if (!satirlar.length) return { eslesen: [], eslesmeyen: [], atlanan };

  /*
    LR'ın kimliği "20604-201" biçiminde, bizim SKU "20604": iki aday da
    sorgulanıyor ve birebir eşleşme öncelikli.
  */
  const adaylar = [...new Set(satirlar.flatMap((s) => skuAdaylari(s.sku)))];
  const { data: varyantlar } = await supabase
    .from("arc_product_variants")
    .select("sku,cost_price,price,compare_at_price,title,arc_products(name)")
    .eq("organization_id", organization.id)
    .in("sku", adaylar);

  type Varyant = { sku: string; cost_price: number | null; price: number; compare_at_price: number | null; title: string | null; arc_products: { name: string } | { name: string }[] | null };
  const bySku = new Map(((varyantlar ?? []) as unknown as Varyant[]).map((v) => [v.sku, v]));

  const eslesen: MaliyetOnizleme["eslesen"] = [];
  const eslesmeyen: string[] = [];
  for (const satir of satirlar) {
    const varyant = skuAdaylari(satir.sku).map((aday) => bySku.get(aday)).find(Boolean);
    if (!varyant) { eslesmeyen.push(satir.sku); continue; }
    const urun = Array.isArray(varyant.arc_products) ? varyant.arc_products[0] : varyant.arc_products;
    const ad = [urun?.name, varyant.title].filter(Boolean).join(" · ") || varyant.sku;

    if (gecis === "alis") {
      eslesen.push({ sku: varyant.sku, ad, eski: varyant.cost_price, yeni: satir.kurus });
      continue;
    }

    const sonuc = fiyatKarari(satir.kurus, indirimKurus, varyant.cost_price);
    if ("sorun" in sonuc) {
      eslesen.push({ sku: varyant.sku, ad, eski: varyant.price, yeni: satir.kurus, sorun: SORUN_METNI[sonuc.sorun] ?? sonuc.sorun });
      continue;
    }
    eslesen.push({
      sku: varyant.sku, ad, eski: varyant.price, yeni: satir.kurus,
      satis: sonuc.karar.satis, ustuCizili: sonuc.karar.ustuCizili,
    });
  }
  return { eslesen, eslesmeyen, atlanan };
}

export async function maliyetUygula(
  satirlar: { sku: string; kurus: number; satis?: number; ustuCizili?: number | null }[],
  gecis: FiyatGecisi = "alis",
): Promise<{ yazilan: number; hata: string | null }> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) {
    return { yazilan: 0, hata: "Bu işlem için yetkiniz yok." };
  }
  if (!satirlar.length) return { yazilan: 0, hata: "Uygulanacak satır yok." };

  let yazilan = 0;
  for (const satir of satirlar) {
    /*
      İstemciden gelen listeye güvenilmiyor: önizlemeden sonra
      değiştirilmiş olabilir. Sıfır ve eksi değer yazılmıyor.
    */
    if (!Number.isInteger(satir.kurus) || satir.kurus <= 0) continue;
    const yazilacak =
      gecis === "alis"
        ? { cost_price: satir.kurus }
        : /* Sorunlu satır önizlemede satış fiyatı taşımıyor; atlanıyor. */
          satir.satis && satir.satis > 0
          ? { price: satir.satis, compare_at_price: satir.ustuCizili ?? null }
          : null;
    if (!yazilacak) continue;

    const { error, count } = await supabase
      .from("arc_product_variants")
      .update({ ...yazilacak, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("organization_id", organization.id)
      .eq("sku", satir.sku);
    if (error) return { yazilan, hata: error.message };
    yazilan += count ?? 0;
  }

  revalidatePath("/urunler");
  revalidatePath("/siparisler");
  return { yazilan, hata: null };
}
