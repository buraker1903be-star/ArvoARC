"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { maliyetleriAyristir } from "@/lib/maliyet-aktarimi";
import { fiyatKarari, maliyetUyarisi, skuAdaylari, skuYinelemesi } from "@/lib/fiyat-aktarimi";
import { gecerliFiyat, saklananSatirlar, kaynaklarIcin, KAYNAK_ADI, type FiyatKaynagi } from "@/lib/fiyat-toplayici";
import { jetonAnahtariVar, toplayiciJetonu } from "@/lib/fiyat-toplayici-jeton";
import { lrTaramasiniKaydet } from "@/lib/lr/kaydet";
import { createServiceClient } from "@/lib/paytr/service-client";
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
    /*
      Satır SKU'ya değil VARYANTA ait. Aynı SKU birden çok varyantta
      olabiliyor (benzersizlik kısıtı yok) ve eskiden önizleme onları tek
      satıra indirip yazmayı eq("sku", …) ile bütün kopyalara yapıyordu:
      görünen ile yazılan farklıydı.
    */
    varyantId: string;
    sku: string;
    ad: string;
    eski: number | null;
    yeni: number;
    /** Müşteri geçişinde hesaplanan satış fiyatı ve üstü çizili değer. */
    satis?: number;
    ustuCizili?: number | null;
    /** Satır UYGULANMIYOR; sebebi burada. */
    sorun?: string;
    /*
      Satır uygulanıyor ama şüpheli. "sorun" ile aynı şey değil: sorunlu
      satır atlanıyor, uyarılı satır yazılıyor. Ayrım şart, çünkü LR
      gerçekten zararına kampanya yapabiliyor ve o satırı yazmamak
      vitrini LR'ın fiyatının gerisinde bırakırdı.
    */
    uyarilar?: string[];
  }[];
  eslesmeyen: string[];
  atlanan: string[];
  /* Sorgu düştüyse sebebi; boş liste "eşleşme yok" gibi okunuyordu. */
  hata?: string | null;
};

const SORUN_METNI: Record<string, string> = {
  "tavan-yok": "LR fiyatı okunamadı",
  "indirim-fiyati-asiyor": "indirim fiyatı sıfıra indiriyor",
  "maliyetin-altinda": "satış fiyatı maliyetin altına düşüyor",
  "urun-arsivde": "ürün arşivde",
};

/*
  EŞLEŞTİRME iki yerden çağrılıyor: yapıştırılan metin ve tarayıcı
  toplayıcısının bıraktığı liste. Kural tek yerde — ikisini ayrı ayrı
  yazmak, birinde düzeltilen bir eşleştirme hatasının ötekinde kalması
  demekti.
*/
async function eslestir(
  supabase: Awaited<ReturnType<typeof requireTenant>>["supabase"],
  organizationId: string,
  satirlar: { sku: string; kurus: number }[],
  gecis: FiyatGecisi,
  indirimKurus: number,
): Promise<{ eslesen: MaliyetOnizleme["eslesen"]; eslesmeyen: string[]; hata: string | null }> {
  /*
    LR'ın kimliği "20604-201" biçiminde, bizim SKU "20604": iki aday da
    sorgulanıyor ve birebir eşleşme öncelikli.
  */
  const adaylar = [...new Set(satirlar.flatMap((s) => skuAdaylari(s.sku)))];

  type Varyant = { id: string; sku: string; product_id: string; cost_price: number | null; price: number; compare_at_price: number | null; title: string | null; arc_products: { name: string; status: string } | { name: string; status: string }[] | null };
  /*
    SKU başına TEK varyant değil, LİSTE. Benzersizlik kısıtı yok ve
    sonuncuyu tutan bir harita, geri kalan varyantları önizlemeden
    gizlerken yazmayı yine hepsine yapıyordu.
  */
  const bySku = new Map<string, Varyant[]>();

  /*
    SKU'lar ÖBEK ÖBEK soruluyor. Adaylar adres satırına yazılıyor
    (`in.(…)`) ve yüzlerce satırlık bir toplamada adres sunucunun
    sınırını aşabiliyor; sonuç "hiçbir ürün eşleşmedi" olurdu.

    Sorgunun hatası da artık YUTULMUYOR. Yutulduğunda tek belirti
    bütün satırların "katalogda bulunamadı" görünmesiydi — yani
    gerçek bir arıza, veri sorunu gibi okunuyordu.
  */
  const OBEK = 150;
  for (let i = 0; i < adaylar.length; i += OBEK) {
    const { data, error } = await supabase
      .from("arc_product_variants")
      .select("id,sku,product_id,cost_price,price,compare_at_price,title,arc_products(name,status)")
      .eq("organization_id", organizationId)
      .in("sku", adaylar.slice(i, i + OBEK));
    if (error) return { eslesen: [], eslesmeyen: [], hata: `Ürünler okunamadı: ${error.message}` };
    for (const varyant of (data ?? []) as unknown as Varyant[]) {
      const liste = bySku.get(varyant.sku) ?? [];
      liste.push(varyant);
      bySku.set(varyant.sku, liste);
    }
  }

  /*
    Varyant kimliğiyle anahtarlanıyor: aynı varyant iki satırdan
    eşleşirse SONUNCU kazanıyor (toplayıcıda da kural bu).
  */
  const eslesen = new Map<string, MaliyetOnizleme["eslesen"][number]>();
  const eslesmeyen: string[] = [];
  for (const satir of satirlar) {
    const liste = skuAdaylari(satir.sku)
      .map((aday) => bySku.get(aday))
      .find((bulunan) => bulunan?.length);
    if (!liste?.length) { eslesmeyen.push(satir.sku); continue; }

    /*
      SKU birden çok varyanta dağılmışsa HER BİRİ ayrı satır. Eskiden
      tek satır görünüp hepsine yazılıyordu; artık kullanıcı ne
      yazılacağını olduğu gibi görüyor.
    */
    /*
      Yineleme sayımı ARŞİVDEKİLERİ SAYMIYOR: fiyat onlara zaten
      yazılmayacak. Saysaydı, tek canlı varyantı olan bir SKU için
      "4 ayrı üründe" denip kullanıcı olmayan bir riski araştırırdı.
    */
    const canli = liste.filter((v) => {
      const u = Array.isArray(v.arc_products) ? v.arc_products[0] : v.arc_products;
      return u?.status !== "archived";
    });
    const yinelemeUyarisi = skuYinelemesi(
      canli.length,
      new Set(canli.map((v) => v.product_id)).size,
    );

    for (const varyant of liste) {
      const urun = Array.isArray(varyant.arc_products) ? varyant.arc_products[0] : varyant.arc_products;
      const ad = [urun?.name, varyant.title].filter(Boolean).join(" · ") || varyant.sku;

      /*
        ARŞİVDEKİ ÜRÜNE FİYAT YAZILMIYOR. Vitrin yalnızca status='active'
        olanı basıyor, yani arşivdeki ürünün fiyatını güncellemenin bir
        karşılığı yok; üstelik arşivlenen ürünler genellikle bir içe
        aktarma hatasının kalıntısı ve SKU'ları yaşayan ürünlerinkiyle
        çakışabiliyor (28.09.2026'da "The Society Collection" ürünleri
        TR-8409-* SKU'larını dört ayrı ürüne dağıtmış halde arşivlendi).

        Gizlenmiyor, İŞARETLENİYOR: listeden sessizce düşen bir satır,
        kullanıcının yazıldığını sandığı fiyatın yazılmaması demekti.
      */
      if (urun?.status === "archived") {
        eslesen.set(varyant.id, {
          varyantId: varyant.id, sku: varyant.sku, ad,
          eski: gecis === "alis" ? varyant.cost_price : varyant.price,
          yeni: satir.kurus,
          sorun: SORUN_METNI["urun-arsivde"],
        });
        continue;
      }

      if (gecis === "alis") {
        /* Kurallar lib/fiyat-aktarimi.ts'te: engellemiyor, işaretliyor. */
        const uyarilar = [maliyetUyarisi(satir.kurus, varyant.price), yinelemeUyarisi].filter(
          (u): u is string => Boolean(u),
        );
        eslesen.set(varyant.id, {
          varyantId: varyant.id, sku: varyant.sku, ad,
          eski: varyant.cost_price, yeni: satir.kurus,
          uyarilar: uyarilar.length ? uyarilar : undefined,
        });
        continue;
      }

      const sonuc = fiyatKarari(satir.kurus, indirimKurus, varyant.cost_price);
      if ("sorun" in sonuc) {
        eslesen.set(varyant.id, {
          varyantId: varyant.id, sku: varyant.sku, ad,
          eski: varyant.price, yeni: satir.kurus,
          sorun: SORUN_METNI[sonuc.sorun] ?? sonuc.sorun,
        });
        continue;
      }
      eslesen.set(varyant.id, {
        varyantId: varyant.id, sku: varyant.sku, ad,
        eski: varyant.price, yeni: satir.kurus,
        satis: sonuc.karar.satis, ustuCizili: sonuc.karar.ustuCizili,
        uyarilar: yinelemeUyarisi ? [yinelemeUyarisi] : undefined,
      });
    }
  }
  return { eslesen: [...eslesen.values()], eslesmeyen, hata: null };
}

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

  return { ...(await eslestir(supabase, organization.id, satirlar, gecis, indirimKurus)), atlanan };
}

/*
  FİYATI YAZ.

  Yazma VARYANT KİMLİĞİYLE yapılıyor, SKU ile değil. Eskiden
  `eq("sku", …)` kullanılıyordu ve SKU benzersiz olmadığı için tek
  satırlık bir önizleme altı kayda yazabiliyordu — kullanıcının gördüğü
  ile yazılan farklıydı. Kimlik önizlemede hangi varyantın görüldüğünü
  de sabitliyor.
*/
export async function maliyetUygula(
  satirlar: { varyantId: string; kurus: number; satis?: number; ustuCizili?: number | null }[],
  gecis: FiyatGecisi = "alis",
  toplamaIdleri: string[] = [],
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
      /* organization_id şart: kimlik istemciden geliyor ve RLS'e ek olarak burada da sınırlanıyor. */
      .eq("organization_id", organization.id)
      .eq("id", satir.varyantId);
    if (error) return { yazilan, hata: error.message };
    yazilan += count ?? 0;
  }

  /*
    Uygulanan toplama İŞARETLENİYOR: aynı liste ikinci kez getirildiğinde
    ekranda "uygulandı" yazıyor. İşareti atmak, kullanıcının aynı
    fiyatları ikinci kez yazdığını fark etmemesi demekti.
  */
  if (toplamaIdleri.length) {
    await supabase
      .from("arc_price_collections")
      .update({ uygulandi_at: new Date().toISOString() })
      .eq("organization_id", organization.id)
      .in("id", toplamaIdleri);
  }

  revalidatePath("/urunler");
  revalidatePath("/siparisler");
  return { yazilan, hata: null };
}

/*
  TARAYICI TOPLAYICISI.

  Yapıştırma yolu duruyor; toplayıcı onun yerine geçmiyor, önüne
  geçiyor: kullanıcı LR sayfasında yer imine basıyor, betik SKU ve
  fiyatları okuyup panele bırakıyor (api/fiyat-toplayici), burada
  önizleniyor. Fiyat yine tek tıkla yazılmıyor — sayfa tasarımı
  değişince yanlış sütun okunabilir.

  Yer imi kodu her açılışta yeniden ÜRETİLİYOR, saklanmıyor
  (lib/fiyat-toplayici-jeton.ts).
*/
export async function toplayiciKodu(): Promise<{ kod: string; bitis: string } | { hata: string }> {
  const { organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) return { hata: "Bu işlem için yetkiniz yok." };
  if (!jetonAnahtariVar()) {
    return { hata: "PAYMENT_CREDENTIALS_KEY tanımlı değil; toplayıcı jetonu imzalanamıyor." };
  }

  /*
    Adres istekten okunuyor: panel kendi alan adında da, vercel.app
    adresinde de açılabiliyor ve yer imi hangisinden alındıysa onu
    çağırmalı. Sabit bir adres yazmak, alan adı bağlanmamış mağazada
    çalışmayan bir yer imi demekti.
  */
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return { hata: "Panel adresi okunamadı." };
  const koken = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const { jeton, bitis } = toplayiciJetonu(organization.id);
  const ayar = JSON.stringify({
    uc: `${koken}/api/fiyat-toplayici`,
    betik: `${koken}/fiyat-toplayici.js`,
    jeton,
  });
  /* Sürüm sorgusu önbelleği atlıyor: toplama kuralı sunucudan güncelleniyor. */
  const kod =
    `javascript:(function(){window.ARC_FIYAT=${ayar};` +
    `var s=document.createElement('script');s.src=window.ARC_FIYAT.betik+'?v='+Date.now();` +
    `s.onerror=function(){alert('ArvoARC toplayıcısı yüklenemedi.')};document.body.appendChild(s);})();`;
  return { kod, bitis: bitis.toISOString() };
}

export type ToplananListe = {
  /** Birleştirilen toplamalar; uygulandığında hepsi işaretleniyor. */
  toplamaIdleri: string[];
  toplandi: string;
  uygulandi: string | null;
  sayfa: string | null;
  okunan: number;
  /** Kaç ayrı toplamadan geldi (LR'da kategori kategori gezilince artıyor). */
  toplamaSayisi: number;
  /** Listenin hangi kaynaklardan geldiği ("yer imi", "günlük tarama"). */
  kaynaklar: string[];
  onizleme: MaliyetOnizleme;
};

export async function sonToplananListe(
  gecis: FiyatGecisi = "alis",
  indirimKurus = 0,
): Promise<ToplananListe | { hata: string }> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) return { hata: "Bu işlem için yetkiniz yok." };

  /*
    UYGULANMAMIŞ TOPLAMALAR BİRLEŞTİRİLİYOR. LR'ın tek sayfasında bütün
    katalog yok: kullanıcı kategori kategori gezip her sayfada "Panele
    gönder" diyor. Yalnızca sonuncuyu getirmek, her sayfadan sonra ayrı
    ayrı uygulamak demekti.

    Hepsi uygulanmışsa sonuncusu yine gösteriliyor: "getir" düğmesinin
    sessizce hiçbir şey yapmaması, bir şeyin bozulduğu izlenimi verirdi.
  */
  /*
    KAYNAK SÜZÜLÜYOR. Süzülmediğinde her gece 06:00'da çalışan tarama
    (kaynak 'lr-genel', GİRİŞSİZ okunan MÜŞTERİ fiyatı) uygulanmamış
    olarak duruyor ve bu birleştirmeye karışıyordu: kullanıcı girişli
    oturumda yer imiyle alış fiyatı toplasa bile, cron'un müşteri
    fiyatları alış alanına yazılıyordu. Üstelik uygulama sırasında
    cron'un listeleri de "uygulandı" işaretlenip sessizce tükeniyordu.

    Ayrım kaydeden tarafta zaten kurulmuştu (lib/lr/kaydet.ts); eksik
    olan okuyan tarafın sütuna bakmasıydı.
  */
  const kaynaklar = kaynaklarIcin(gecis);
  const sorgu = () =>
    supabase
      .from("arc_price_collections")
      .select("id,satirlar,sayfa,created_at,uygulandi_at,kaynak")
      .eq("organization_id", organization.id)
      .in("kaynak", kaynaklar)
      .order("created_at", { ascending: false })
      .limit(20);

  const { data: bekleyen, error } = await sorgu().is("uygulandi_at", null);
  if (error) return { hata: error.message };

  type Kayit = { id: string; satirlar: unknown; sayfa: string | null; created_at: string; uygulandi_at: string | null; kaynak: string };
  let kayitlar = (bekleyen ?? []) as Kayit[];
  if (!kayitlar.length) {
    const { data: sonuncu, error: sonHata } = await sorgu().limit(1);
    if (sonHata) return { hata: sonHata.message };
    kayitlar = (sonuncu ?? []) as Kayit[];
  }
  if (!kayitlar.length) {
    // Hangi kaynağın arandığı söyleniyor: "liste yok" demek, kullanıcı
    // az önce toplama yaptıysa bir şeyin bozulduğu izlenimi verirdi.
    return {
      hata: gecis === "alis"
        ? "Girişli oturumda yer imiyle toplanmış bir liste yok. LR'a giriş yapıp ürün sayfasında yer imine basın. (Günlük tarama müşteri fiyatı topluyor; alış geçişine karışmıyor.)"
        : "Henüz toplanmış liste yok. LR sayfasında yer imine basın ya da “LR'dan fiyatları çek” deyin.",
    };
  }

  /*
    Eskiden yeniye: aynı ürün iki sayfada görünürse EN YENİ okuma
    kazanıyor (kayıtlar tarihe göre tersten geliyor).
  */
  const birlesik = new Map<string, { sku: string; ad: string; fiyatlar: number[] }>();
  for (const kayit of [...kayitlar].reverse()) {
    /*
      saklananSatirlar, satirlariDogrula DEĞİL: doğrulama gelen gövdeye
      uygulanıyor ve fiyatın metin olmasını şart koşuyor. Saklanan satırda
      fiyat zaten kuruş sayısı; aynı kuralı burada ikinci kez uygulamak
      yer imiyle toplanan bütün satırları sessizce düşürüyordu.
    */
    for (const satir of saklananSatirlar(kayit.satirlar)) birlesik.set(satir.sku, satir);
  }
  const satirlar = [...birlesik.values()];
  const kayit = kayitlar[0];

  /*
    Kartta iki fiyat varsa GEÇERLİ olan alınıyor (en düşük): LR kampanya
    yaptığında eski fiyat üstü çizili duruyor ve yükseği almak indirimi
    görmezden gelmek olurdu.
  */
  const fiyatli = satirlar
    .map((satir) => ({ sku: satir.sku, kurus: gecerliFiyat(satir.fiyatlar) }))
    .filter((satir): satir is { sku: string; kurus: number } => satir.kurus !== null);

  const eslestirme = await eslestir(supabase, organization.id, fiyatli, gecis, indirimKurus);
  if (eslestirme.hata) return { hata: eslestirme.hata };
  const onizleme: MaliyetOnizleme = { ...eslestirme, atlanan: [] };
  return {
    toplamaIdleri: kayitlar.map((k) => k.id),
    toplandi: kayit.created_at,
    uygulandi: kayit.uygulandi_at,
    sayfa: kayit.sayfa,
    okunan: satirlar.length,
    toplamaSayisi: kayitlar.length,
    kaynaklar: [...new Set(kayitlar.map((k) => KAYNAK_ADI[k.kaynak as FiyatKaynagi] ?? k.kaynak))],
    onizleme,
  };
}

/*
  LR'I ŞİMDİ TARA.

  Müşteri fiyatı (bizim TAVANIMIZ) LR'ın kategori sayfalarında GİRİŞSİZ
  görünüyor, yani sunucu kendi okuyabiliyor: bu geçiş için yer imi
  gerekmiyor. Yer imi yalnızca girişli sayfadaki ALIŞ fiyatları için
  kaldı — orası CAS SSO'nun arkasında ve şifre saklamak gerekirdi.

  Yazma yine iki adımlı: tarama listeyi bırakıyor, fiyatı kullanıcı
  onaylıyor. Zamanlanmış tarama api/cron/lr-fiyatlari'nda.
*/
export async function lrdanTara(indirimKurus = 0): Promise<ToplananListe | { hata: string }> {
  const { organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) return { hata: "Bu işlem için yetkiniz yok." };

  /*
    Bütün katalog tek turda: 27.09.2026'da 82 sayfa 23,7 saniye sürdü,
    145 ürün çıktı. Süre bütçesi bunun üstünde ama sayfanın 60 sn'lik
    sınırının altında; dolarsa gezilen kadarı kaydediliyor.
  */
  const sonuc = await lrTaramasiniKaydet(createServiceClient(), [organization.id], {
    enFazlaSayfa: 120,
    sureMs: 35_000,
  });
  if (sonuc.hata) return { hata: sonuc.hata };

  /* Bırakılan liste normal yoldan okunuyor; geçiş her zaman müşteri fiyatı. */
  return await sonToplananListe("musteri", indirimKurus);
}
