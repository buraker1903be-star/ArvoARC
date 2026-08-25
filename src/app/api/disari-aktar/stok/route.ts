import { requireTenant } from "@/lib/tenant";

function csvCell(value:unknown){
  let text=String(value??"").replace(/\r?\n/g," ");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

export async function GET(){
  const {supabase,organization}=await requireTenant();
  const [{data:variants,error:variantsError},{data:products,error:productsError}]=await Promise.all([
    supabase.from("arc_product_variants").select("product_id,sku,title,price,currency,stock,allow_backorder").eq("organization_id",organization.id).order("sku"),
    supabase.from("arc_products").select("id,name,status").eq("organization_id",organization.id)
  ]);
  if(variantsError||productsError)return new Response("Rapor oluşturulamadı",{status:500});
  const names=new Map((products??[]).map(product=>[product.id,{name:product.name,status:product.status}]));
  const headers=["Ürün","Ürün Durumu","Varyant","SKU","Fiyat","Para Birimi","Stok","Stoksuz Satış"];
  const rows=(variants??[]).map(variant=>{const product=names.get(variant.product_id);return [product?.name??"Ürün",product?.status??"",variant.title??"Default",variant.sku,(variant.price/100).toFixed(2),variant.currency,variant.stock,variant.allow_backorder?"Açık":"Kapalı"];});
  const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="arvoarc-stok-${new Date().toISOString().slice(0,10)}.csv"`,"cache-control":"private, no-store"}});
}
