import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
type Meta={images?:string[];vendor?:string;type?:string;tags?:string};

export default async function ProductDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const {supabase,organization}=await requireTenant();
  const [{data:product,error},{data:variants,error:variantError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,description,status,source,metadata,created_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,currency,stock,allow_backorder,attributes").eq("organization_id",organization.id).eq("product_id",id).order("title")
  ]);
  if(error)throw new Error(error.message);if(variantError)throw new Error(variantError.message);if(!product)notFound();
  const meta=(product.metadata??{}) as Meta; const images=meta.images??[];
  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/urunler">ÜRÜNLER</Link> · {product.source.toUpperCase()}</small><h2>{product.name}</h2><p>{meta.vendor||"ARVO ARC"}{meta.type?` · ${meta.type}`:""} · {variants?.length??0} varyant</p></div></section>
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.8fr) minmax(0,1.4fr)",gap:24}}>
      <section className="card" style={{padding:20}}>{images[0]?<Image src={images[0]} alt={product.name} width={800} height={800} sizes="(max-width:900px) 100vw, 40vw" style={{width:"100%",height:"auto",aspectRatio:"1",objectFit:"cover",borderRadius:14}}/>:<div style={{aspectRatio:"1",display:"grid",placeItems:"center"}}>Görsel yok</div>}{images.length>1&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>{images.slice(1,5).map(src=><Image key={src} src={src} alt="" width={160} height={160} sizes="120px" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:8}}/>)}</div>}</section>
      <section className="card" style={{padding:24}}><div className="head"><div><small>ÜRÜN BİLGİLERİ</small><h3>{product.status}</h3></div><span>{product.source}</span></div>{product.description?<div style={{marginTop:18,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:product.description}}/>:<p>Açıklama bulunmuyor.</p>}{meta.tags&&<p><b>Etiketler:</b> {meta.tags}</p>}</section>
    </div>
    <section className="card table" style={{marginTop:24}}><div className="head"><div><small>VARYANTLAR</small><h3>{variants?.length??0} varyant</h3></div></div><div className="row th"><span>VARYANT</span><span>SKU</span><span>STOK</span><span>FİYAT</span><span>POLİTİKA</span></div>{variants?.map(v=><div className="row" key={v.id}><span><b>{v.title||"Default"}</b></span><span>{v.sku||"—"}</span><span>{v.stock}</span><span>{money.format(v.price/100)}</span><span><em>{v.allow_backorder?"Stoksuz satış açık":"Stok gerekli"}</em></span></div>)}</section>
  </Shell>;
}
