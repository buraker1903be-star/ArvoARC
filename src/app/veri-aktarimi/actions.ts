"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { copyShopifyImages } from "@/lib/product-images";

type Row = Record<string,string>;

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
    const optionNames:Record<number,string>={};
    for(const i of [1,2,3]) optionNames[i]=g.find(r=>r[`Option${i} Name`]?.trim())?.[`Option${i} Name`]?.trim()??"";
    const {data:product,error:pe}=await supabase.from("arc_products").upsert({organization_id:organization.id,name:first.Title?.trim()||handle,slug:handle,description,status:"active",source:"shopify",external_id:handle,metadata:{shopify_handle:handle,vendor:first.Vendor??"",type:first.Type??"",tags:first.Tags??"",images:[],shopify_image_sources:shopifyImageSources,images_migrated:false}},{onConflict:"organization_id,source,external_id"}).select("id").single(); if(pe)throw pe;
    const copiedImages=await copyShopifyImages(supabase,organization.id,product.id,shopifyImageSources);
    const {error:imageMetadataError}=await supabase.from("arc_products").update({metadata:{shopify_handle:handle,vendor:first.Vendor??"",type:first.Type??"",tags:first.Tags??"",images:[],image_paths:copiedImages.paths,shopify_image_sources:shopifyImageSources,images_migrated:copiedImages.errors.length===0,image_migration_errors:copiedImages.errors}}).eq("organization_id",organization.id).eq("id",product.id);
    if(imageMetadataError)throw imageMetadataError;
    const variants=g.filter(r=>r["Variant Price"]?.trim()||r["Variant SKU"]?.trim()||r["Option1 Value"]?.trim()); const seen=new Set<string>(); let n=0;
    for(const r of variants){const key=[r["Option1 Value"],r["Option2 Value"],r["Option3 Value"],r["Variant SKU"],r["Variant Price"]].join("|");if(seen.has(key))continue;seen.add(key);n++;
      const attrs:Record<string,string>={};for(const i of [1,2,3]){const name=optionNames[i],value=r[`Option${i} Value`]?.trim();if(name&&value)attrs[name]=value;}
      const sku=r["Variant SKU"]?.trim()||`ARC-${handle.slice(0,35).toUpperCase()}-${String(n).padStart(3,"0")}`; const price=Math.round(Number((r["Variant Price"]||"0").replace(",","."))*100);
      const externalId=`${handle}:${n}`;
      const {data:existing}=await supabase.from("arc_product_variants").select("stock").eq("organization_id",organization.id).eq("external_id",externalId).maybeSingle();
      const {error:ve}=await supabase.from("arc_product_variants").upsert({organization_id:organization.id,product_id:product.id,sku,title:Object.values(attrs).join(" / ")||"Default",price,currency:"TRY",stock:existing?.stock??0,attributes:attrs,external_id:externalId,allow_backorder:true},{onConflict:"organization_id,external_id"});if(ve)throw ve;
    } imported++;
  }catch(e){errors++;await supabase.from("arc_import_errors").insert({batch_id:batch.id,organization_id:organization.id,row_key:handle,message:e instanceof Error?e.message:"Import error"});}}
  await supabase.from("arc_import_batches").update({status:errors?"failed":"completed",imported_rows:imported,error_rows:errors,completed_at:new Date().toISOString()}).eq("id",batch.id);
  revalidatePath("/urunler");revalidatePath("/veri-aktarimi");redirect(`/veri-aktarimi?imported=${imported}&errors=${errors}`);
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
