"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { copyShopifyImages } from "@/lib/product-images";

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
  if(!["owner","admin","manager"].includes(membership.role)) redirect("/veri-aktarimi?error=forbidden");
  const file=formData.get("file"); if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".csv")) redirect("/veri-aktarimi?error=csv-required");
  const rows=parseCsv(await file.text()); const groups=new Map<string,Row[]>();
  for(const r of rows){const h=(r.Handle??"").trim();if(h){if(!groups.has(h))groups.set(h,[]);groups.get(h)!.push(r);}}
  const active=[...groups.entries()].filter(([,g])=>g.find(r=>r.Status?.trim())?.Status.trim().toLowerCase()==="active");
  const {data:batch,error:batchError}=await supabase.from("arc_import_batches").insert({organization_id:organization.id,source:"shopify",kind:"products",file_name:file.name,status:"processing",total_rows:active.length,created_by:user.id}).select("id").single();
  if(batchError) redirect(`/veri-aktarimi?error=${encodeURIComponent(batchError.message)}`);
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
    const variants=g.filter(r=>r["Variant Price"]?.trim()||r["Variant SKU"]?.trim()||r["Option1 Value"]?.trim()); const seen=new Set<string>(); let n=0;
    for(const r of variants){const key=[r["Option1 Value"],r["Option2 Value"],r["Option3 Value"],r["Variant SKU"],r["Variant Price"]].join("|");if(seen.has(key))continue;seen.add(key);n++;
      const attrs:Record<string,string>={};for(const i of [1,2,3]){const name=optionNames[i],value=r[`Option${i} Value`]?.trim();if(name&&value)attrs[name]=value;}
      const sku=r["Variant SKU"]?.trim()||`ARC-${handle.slice(0,35).toUpperCase()}-${String(n).padStart(3,"0")}`; const price=moneyToCents(r["Variant Price"]); const rawCompareAtPrice=moneyToCents(r["Variant Compare At Price"]); const compareAtPrice=rawCompareAtPrice>price?rawCompareAtPrice:null;
      const externalId=`${handle}:${n}`;
      const {data:existing}=await supabase.from("arc_product_variants").select("stock").eq("organization_id",organization.id).eq("external_id",externalId).maybeSingle();
      const {error:ve}=await supabase.from("arc_product_variants").upsert({organization_id:organization.id,product_id:product.id,sku,title:Object.values(attrs).join(" / ")||"Default",price,compare_at_price:compareAtPrice,currency:"TRY",stock:existing?.stock??0,attributes:attrs,external_id:externalId,allow_backorder:true},{onConflict:"organization_id,external_id"});if(ve)throw ve;
    } imported++;
  }catch(e){errors++;await supabase.from("arc_import_errors").insert({batch_id:batch.id,organization_id:organization.id,row_key:handle,message:e instanceof Error?e.message:"Import error"});}}
  await supabase.from("arc_import_batches").update({status:errors?"failed":"completed",imported_rows:imported,error_rows:errors,completed_at:new Date().toISOString()}).eq("id",batch.id);
  revalidatePath("/urunler");revalidatePath("/koleksiyonlar");revalidatePath("/veri-aktarimi");redirect(`/veri-aktarimi?imported=${imported}&errors=${errors}`);
}

type ProductMetadata={
  images?:string[];
  image_paths?:string[];
  shopify_image_sources?:string[];
  images_migrated?:boolean;
  image_migration_errors?:string[];
  [key:string]:unknown;
};

export async function migrateShopifyImages(){
  const {supabase,organization,membership}=await requireTenant();
  if(!["owner","admin","manager"].includes(membership.role)) redirect("/veri-aktarimi?error=forbidden");

  const {data:products,error}=await supabase.from("arc_products").select("id,metadata").eq("organization_id",organization.id).eq("source","shopify").limit(250);
  if(error)redirect(`/veri-aktarimi?error=${encodeURIComponent(error.message)}`);

  const pending=(products??[]).filter(product=>!((product.metadata??{}) as ProductMetadata).images_migrated).slice(0,5);
  let migrated=0,failed=0;
  for(const product of pending){
    const metadata=(product.metadata??{}) as ProductMetadata;
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
  redirect(`/veri-aktarimi?images=${migrated}&imageErrors=${failed}&remaining=${Math.max(0,(products?.filter(product=>!((product.metadata??{}) as ProductMetadata).images_migrated).length??0)-pending.length)}`);
}


function moneyToCents(value:string|undefined){
  const raw=(value??"").trim().replace(/\s/g,"");
  if(!raw)return 0;
  const normalized=raw.includes(",")&&raw.includes(".")?raw.replace(/,/g,""):raw.replace(",",".");
  const amount=Number(normalized.replace(/[^0-9.-]/g,""));
  return Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0;
}

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
  if(!["owner","admin","manager"].includes(membership.role))redirect("/veri-aktarimi?error=forbidden");
  const file=formData.get("file");
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".csv"))redirect("/veri-aktarimi?error=orders-csv-required");

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
  if(batchError)redirect(`/veri-aktarimi?error=${encodeURIComponent(batchError.message)}`);

  const {data:variants}=await supabase.from("arc_product_variants").select("id,sku").eq("organization_id",organization.id);
  const variantBySku=new Map((variants??[]).filter(v=>v.sku).map(v=>[v.sku.trim().toLowerCase(),v.id]));
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
  redirect(`/veri-aktarimi?orders=${imported}&orderErrors=${errors}&orderSkipped=${skipped}`);
}
