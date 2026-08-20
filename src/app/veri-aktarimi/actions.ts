"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

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
    const images=[...new Set(g.map(r=>r["Image Src"]?.trim()).filter(Boolean))];
    const {data:product,error:pe}=await supabase.from("arc_products").upsert({organization_id:organization.id,name:first.Title?.trim()||handle,slug:handle,description,status:"active",source:"shopify",external_id:handle,metadata:{shopify_handle:handle,vendor:first.Vendor??"",type:first.Type??"",tags:first.Tags??"",images}},{onConflict:"organization_id,source,external_id"}).select("id").single(); if(pe)throw pe;
    const variants=g.filter(r=>r["Variant Price"]?.trim()||r["Variant SKU"]?.trim()||r["Option1 Value"]?.trim()); const seen=new Set<string>(); let n=0;
    for(const r of variants){const key=[r["Option1 Value"],r["Option2 Value"],r["Option3 Value"],r["Variant SKU"],r["Variant Price"]].join("|");if(seen.has(key))continue;seen.add(key);n++;
      const attrs:Record<string,string>={};for(const i of [1,2,3]){const name=r[`Option${i} Name`]?.trim(),value=r[`Option${i} Value`]?.trim();if(name&&value)attrs[name]=value;}
      const sku=r["Variant SKU"]?.trim()||`ARC-${handle.slice(0,35).toUpperCase()}-${String(n).padStart(3,"0")}`; const price=Math.round(Number((r["Variant Price"]||"0").replace(",","."))*100);
      const {error:ve}=await supabase.from("arc_product_variants").upsert({organization_id:organization.id,product_id:product.id,sku,title:Object.values(attrs).join(" / ")||"Default",price,currency:"TRY",stock:0,attributes:attrs,external_id:`${handle}:${n}`,allow_backorder:true},{onConflict:"organization_id,external_id"});if(ve)throw ve;
    } imported++;
  }catch(e){errors++;await supabase.from("arc_import_errors").insert({batch_id:batch.id,organization_id:organization.id,row_key:handle,message:e instanceof Error?e.message:"Import error"});}}
  await supabase.from("arc_import_batches").update({status:errors?"failed":"completed",imported_rows:imported,error_rows:errors,completed_at:new Date().toISOString()}).eq("id",batch.id);
  revalidatePath("/urunler");revalidatePath("/veri-aktarimi");redirect(`/veri-aktarimi?imported=${imported}&errors=${errors}`);
}
