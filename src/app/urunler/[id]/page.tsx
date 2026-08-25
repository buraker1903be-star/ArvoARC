import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { removeProductImage, updateProduct, updateVariant, uploadProductImages } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";

type Meta={images?:string[];image_paths?:string[];vendor?:string;type?:string;tags?:string};

export default async function ProductDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {id}=await params; const query=await searchParams; const {supabase,organization,membership}=await requireTenant();
  const [{data:product,error},{data:variants,error:variantError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,description,status,source,metadata,created_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,currency,stock,allow_backorder,attributes").eq("organization_id",organization.id).eq("product_id",id).order("title")
  ]);
  if(error)throw new Error(error.message);if(variantError)throw new Error(variantError.message);if(!product)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role); const meta=(product.metadata??{}) as Meta; const imagePaths=meta.image_paths??[]; const signedImages=await createProductImageUrls(supabase,imagePaths); const imageEntries=signedImages.length?signedImages.map((url,index)=>({url,path:imagePaths[index]})):(meta.images??[]).map(url=>({url,path:""}));
  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/urunler">ÜRÜNLER</Link> · {product.source.toUpperCase()}</small><h2>{product.name}</h2><p>{meta.vendor||"ARVO ARC"}{meta.type?` · ${meta.type}`:""} · {variants?.length??0} varyant</p></div></section>
    {query.saved&&<section className="card" style={{padding:14,marginBottom:18}}><strong>{query.saved==="variant"?"Varyant":query.saved?.startsWith("image")?"Görseller":"Ürün"} bilgileri kaydedildi.</strong></section>}
    {query.error&&<section className="card" style={{padding:14,marginBottom:18}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>}
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.8fr) minmax(0,1.4fr)",gap:24}}>
      <section className="card" style={{padding:20}}>
        {imageEntries.length?<div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>{imageEntries.map((image,index)=><div key={image.url} style={{position:"relative",gridColumn:index===0?"1 / -1":undefined}}><Image src={image.url} alt={index===0?product.name:""} width={800} height={800} sizes="(max-width:900px) 100vw, 40vw" style={{width:"100%",height:"auto",aspectRatio:"1",objectFit:"cover",borderRadius:14}}/>{canManage&&image.path?<form action={removeProductImage} style={{position:"absolute",right:8,top:8}}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="path" value={image.path}/><button type="submit" aria-label="Görseli sil" style={{padding:"8px 10px"}}>Sil</button></form>:null}</div>)}</div>:<div style={{aspectRatio:"1",display:"grid",placeItems:"center"}}>Görsel yok</div>}
        {canManage&&<form action={uploadProductImages} style={{marginTop:16,display:"grid",gap:10}}><input type="hidden" name="product_id" value={product.id}/><label>Ürün görselleri<input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple required style={{display:"block",width:"100%",padding:10,marginTop:6}}/></label><small>En fazla 5 dosya birden, ürün başına 8 görsel ve dosya başına 10 MB.</small><button type="submit" style={{padding:12}}>Görselleri yükle</button></form>}
      </section>
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
