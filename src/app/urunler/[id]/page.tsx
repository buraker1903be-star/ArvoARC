import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateProduct, updateVariant } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";

type Meta={images?:string[];image_paths?:string[];vendor?:string;type?:string;tags?:string};

export default async function ProductDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {id}=await params; const query=await searchParams; const {supabase,organization,membership}=await requireTenant();
  const [{data:product,error},{data:variants,error:variantError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,description,status,source,metadata,created_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,currency,stock,allow_backorder,attributes").eq("organization_id",organization.id).eq("product_id",id).order("title")
  ]);
  if(error)throw new Error(error.message);if(variantError)throw new Error(variantError.message);if(!product)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role); const meta=(product.metadata??{}) as Meta; const signedImages=await createProductImageUrls(supabase,meta.image_paths??[]); const images=signedImages.length?signedImages:(meta.images??[]);
  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/urunler">ÜRÜNLER</Link> · {product.source.toUpperCase()}</small><h2>{product.name}</h2><p>{meta.vendor||"ARVO ARC"}{meta.type?` · ${meta.type}`:""} · {variants?.length??0} varyant</p></div></section>
    {query.saved&&<section className="card" style={{padding:14,marginBottom:18}}><strong>{query.saved==="variant"?"Varyant":"Ürün"} bilgileri kaydedildi.</strong></section>}
    {query.error&&<section className="card" style={{padding:14,marginBottom:18}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>}
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.8fr) minmax(0,1.4fr)",gap:24}}>
      <section className="card" style={{padding:20}}>{images[0]?<Image src={images[0]} alt={product.name} width={800} height={800} sizes="(max-width:900px) 100vw, 40vw" style={{width:"100%",height:"auto",aspectRatio:"1",objectFit:"cover",borderRadius:14}}/>:<div style={{aspectRatio:"1",display:"grid",placeItems:"center"}}>Görsel yok</div>}{images.length>1&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>{images.slice(1,5).map(src=><Image key={src} src={src} alt="" width={160} height={160} sizes="120px" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:8}}/>)}</div>}</section>
      <section className="card" style={{padding:24}}><div className="head"><div><small>ÜRÜN BİLGİLERİ</small><h3>Düzenle</h3></div><span>{product.source}</span></div>
        {canManage?<form action={updateProduct} style={{display:"grid",gap:14,marginTop:18}}><input type="hidden" name="id" value={product.id}/><label>Ürün adı<input name="name" defaultValue={product.name} required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label><label>Durum<select name="status" defaultValue={product.status} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="active">Aktif</option><option value="draft">Taslak</option></select></label><label>Açıklama<textarea name="description" defaultValue={product.description??""} rows={10} style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label><button type="submit" style={{padding:12}}>Ürün bilgilerini kaydet</button></form>:<div dangerouslySetInnerHTML={{__html:product.description||"Açıklama bulunmuyor."}}/>}
        {meta.tags&&<p><b>Etiketler:</b> {meta.tags}</p>}
      </section>
    </div>
    <section className="card" style={{marginTop:24,padding:24}}><div className="head"><div><small>VARYANTLAR</small><h3>{variants?.length??0} varyant</h3></div><span>Stok değişikliği Stok Yönetimi ekranından yapılır</span></div>
      <div style={{display:"grid",gap:12,marginTop:18}}>{variants?.map(v=>canManage?<form action={updateVariant} key={v.id} style={{display:"grid",gridTemplateColumns:"minmax(160px,1fr) minmax(150px,1fr) 130px 160px auto",gap:10,alignItems:"end",padding:14,border:"1px solid rgba(0,0,0,.08)",borderRadius:12}}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="variant_id" value={v.id}/><label>Varyant<input value={v.title||"Default"} readOnly style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>SKU<input name="sku" defaultValue={v.sku??""} required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Fiyat ₺<input name="price" type="number" min="0" step="0.01" defaultValue={(v.price/100).toFixed(2)} required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label style={{paddingBottom:10}}><input name="allow_backorder" type="checkbox" defaultChecked={v.allow_backorder}/> Stoksuz satış</label><button type="submit" style={{padding:10}}>Kaydet</button></form>:<div key={v.id}>{v.title} · {v.sku} · {(v.price/100).toFixed(2)} ₺</div>)}</div>
    </section>
  </Shell>;
}
