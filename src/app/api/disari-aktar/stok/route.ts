import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";

function csvCell(value:unknown){
  let text=String(value??"").replace(/\r?\n/g," ");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

type VariantRow={id:string;product_id:string;sku:string;title:string|null;price:number;currency:string;stock:number;allow_backorder:boolean};
type ProductRow={id:string;name:string;status:string};
type Page<T>=PromiseLike<{data:T[]|null;error:{message:string}|null}>;

/*
  Varyantlar ve ürünler 1000'lik sayfalarla okunur. Öncesinde tek
  istekte çekiliyordu: 15.000+ varyantlık katalogda dosyada yalnızca
  1000 varyant vardı ve ilk 1000 ürünün dışındakiler "Ürün" diye
  adsız yazılıyordu. İkincil sıralama (id) sayfa kaymasını önler.
*/
export async function GET(){
  const {supabase,organization}=await requireTenant();
  let variants:VariantRow[];let products:ProductRow[];
  try{
    const [variantResult,productResult]=await Promise.all([
      fetchAllRows<VariantRow>((from,to)=>supabase.from("arc_product_variants").select("id,product_id,sku,title,price,currency,stock,allow_backorder").eq("organization_id",organization.id).order("sku").order("id").range(from,to) as unknown as Page<VariantRow>,100_000),
      fetchAllRows<ProductRow>((from,to)=>supabase.from("arc_products").select("id,name,status").eq("organization_id",organization.id).order("id").range(from,to) as unknown as Page<ProductRow>,100_000),
    ]);
    variants=variantResult.rows;products=productResult.rows;
  }catch{return new Response("Rapor oluşturulamadı",{status:500});}
  const names=new Map(products.map(product=>[product.id,{name:product.name,status:product.status}]));
  const headers=["Ürün","Ürün Durumu","Varyant","SKU","Fiyat","Para Birimi","Stok","Stoksuz Satış"];
  const rows=variants.map(variant=>{const product=names.get(variant.product_id);return [product?.name??"Ürün",product?.status??"",variant.title??"Default",variant.sku,(variant.price/100).toFixed(2),variant.currency,variant.stock,variant.allow_backorder?"Açık":"Kapalı"];});
  const csv="﻿"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="arvoarc-stok-${new Date().toISOString().slice(0,10)}.csv"`,"cache-control":"private, no-store"}});
}
