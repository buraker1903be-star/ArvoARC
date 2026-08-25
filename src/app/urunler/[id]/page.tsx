import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createVariant, removeProductImage, updateProduct, updateVariant, uploadProductImages } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";
import { sourceLabel } from "@/lib/commerce-labels";
import { SeoFields } from "./seo-fields";

type Meta={
  images?:string[];image_paths?:string[];vendor?:string;type?:string;tags?:string;
  subtitle?:string;seo_title?:string;seo_description?:string;google_product_category?:string;
  gtin?:string;mpn?:string;condition?:string;material?:string;color?:string;gender?:string;age_group?:string;badge?:string;badge_tone?:string;
};

export default async function ProductDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {id}=await params; const query=await searchParams; const {supabase,organization,membership}=await requireTenant();
  const [{data:product,error},{data:variants,error:variantError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,slug,description,status,source,metadata,created_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,compare_at_price,currency,stock,allow_backorder,attributes").eq("organization_id",organization.id).eq("product_id",id).order("title")
  ]);
  if(error)throw new Error(error.message);if(variantError)throw new Error(variantError.message);if(!product)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role); const meta=(product.metadata??{}) as Meta; const imagePaths=meta.image_paths??[]; const signedImages=await createProductImageUrls(supabase,imagePaths); const imageEntries=signedImages.length?signedImages.map((url,index)=>({url,path:imagePaths[index]})):(meta.images??[]).map(url=>({url,path:""}));
  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/urunler">ÜRÜNLER</Link> · {sourceLabel(product.source)}</small><h2>{product.name}</h2>{meta.subtitle?<p className="product-subtitle">{meta.subtitle}</p>:null}<p>{meta.vendor||"ARVO ARC"}{meta.type?` · ${meta.type}`:""} · {variants?.length??0} varyant</p></div></section>
    {query.saved&&<section className="card" style={{padding:14,marginBottom:18}}><strong>{query.saved?.startsWith("variant")?"Varyant":query.saved?.startsWith("image")?"Görseller":"Ürün"} bilgileri kaydedildi.</strong></section>}
    {query.error&&<section className="card" style={{padding:14,marginBottom:18}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>}
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.8fr) minmax(0,1.4fr)",gap:24}}>
      <section className="card" style={{padding:20}}>
        {imageEntries.length?<div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>{imageEntries.map((image,index)=><div key={image.url} style={{position:"relative",gridColumn:index===0?"1 / -1":undefined}}><Image src={image.url} alt={index===0?product.name:""} width={800} height={800} sizes="(max-width:900px) 100vw, 40vw" style={{width:"100%",height:"auto",aspectRatio:"1",objectFit:"cover",borderRadius:14}}/>{canManage&&image.path?<form action={removeProductImage} style={{position:"absolute",right:8,top:8}}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="path" value={image.path}/><button type="submit" aria-label="Görseli sil" style={{padding:"8px 10px"}}>Sil</button></form>:null}</div>)}</div>:<div style={{aspectRatio:"1",display:"grid",placeItems:"center"}}>Görsel yok</div>}
        {canManage&&<form action={uploadProductImages} style={{marginTop:16,display:"grid",gap:10}}><input type="hidden" name="product_id" value={product.id}/><label>Ürün görselleri<input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple required style={{display:"block",width:"100%",padding:10,marginTop:6}}/></label><small>En fazla 5 dosya birden, ürün başına 8 görsel ve dosya başına 10 MB.</small><button type="submit" style={{padding:12}}>Görselleri yükle</button></form>}
      </section>
      <section className="card product-editor"><div className="head"><div><small>ÜRÜN YAYIN MERKEZİ</small><h3>Ürün bilgilerini yönet</h3></div><span>{sourceLabel(product.source)}</span></div>
        {canManage?<form action={updateProduct} className="product-editor-form"><input type="hidden" name="id" value={product.id}/>
          <section className="product-editor-section">
            <div className="product-editor-heading"><div><small>TEMEL BİLGİLER</small><h4>Ürün içeriği</h4></div><span>Müşterinin göreceği alanlar</span></div>
            <div className="editor-field-grid">
              <label className="full-field">Ürün adı<input name="name" defaultValue={product.name} required maxLength={200}/></label>
              <label className="full-field">Ürün alt başlığı<input name="subtitle" defaultValue={meta.subtitle??""} maxLength={240} placeholder="Ürünün temel faydasını tek cümlede anlatın"/></label>
              <label>Marka<input name="vendor" defaultValue={meta.vendor??""} maxLength={120} placeholder="Örn. ARVOCULTURE"/></label>
              <label>Ürün türü<input name="type" defaultValue={meta.type??""} maxLength={120} placeholder="Örn. Kişisel bakım"/></label>
              <label>Durum<select name="status" defaultValue={product.status}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşivlenmiş</option></select></label>
              <label>Etiketler<input name="tags" defaultValue={meta.tags??""} maxLength={500} placeholder="bakım, premium, yeni"/></label>
              <label>Ürün rozeti<input name="badge" defaultValue={meta.badge??""} maxLength={40} placeholder="Örn. Yeni, Çok Satan, Özel Seri"/></label>
              <label>Rozet rengi<select name="badge_tone" defaultValue={meta.badge_tone??"green"}><option value="green">ARVO Yeşili</option><option value="navy">Lacivert</option><option value="gold">Altın</option><option value="red">Kırmızı</option></select></label>
              <label className="full-field">Ürün açıklaması<textarea name="description" defaultValue={product.description??""} rows={12} maxLength={20000} placeholder="Ürünün özelliklerini, faydalarını ve kullanım bilgisini detaylandırın."/></label>
            </div>
          </section>

          <SeoFields defaultTitle={meta.seo_title??product.name} defaultDescription={meta.seo_description??""} defaultSlug={product.slug??""} productName={product.name}/>

          <section className="product-editor-section">
            <div className="product-editor-heading"><div><small>EK META BİLGİLERİ</small><h4>Google Merchant ve katalog verileri</h4></div><span>İsteğe bağlı</span></div>
            <div className="editor-field-grid">
              <label className="full-field">Google ürün kategorisi<input name="google_product_category" defaultValue={meta.google_product_category??""} maxLength={240} placeholder="Örn. Sağlık ve Güzellik > Kişisel Bakım"/></label>
              <label>GTIN / Barkod<input name="gtin" defaultValue={meta.gtin??""} maxLength={32} inputMode="numeric" placeholder="EAN / UPC / ISBN"/></label>
              <label>MPN / Üretici kodu<input name="mpn" defaultValue={meta.mpn??""} maxLength={80}/></label>
              <label>Ürün durumu<select name="condition" defaultValue={meta.condition??"new"}><option value="new">Yeni</option><option value="refurbished">Yenilenmiş</option><option value="used">Kullanılmış</option></select></label>
              <label>Malzeme<input name="material" defaultValue={meta.material??""} maxLength={120}/></label>
              <label>Renk<input name="color" defaultValue={meta.color??""} maxLength={120}/></label>
              <label>Hedef cinsiyet<select name="gender" defaultValue={meta.gender??""}><option value="">Belirtilmemiş</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="unisex">Unisex</option></select></label>
              <label>Yaş grubu<select name="age_group" defaultValue={meta.age_group??""}><option value="">Belirtilmemiş</option><option value="newborn">Yenidoğan</option><option value="infant">Bebek</option><option value="toddler">Küçük çocuk</option><option value="kids">Çocuk</option><option value="adult">Yetişkin</option></select></label>
            </div>
          </section>
          <div className="product-editor-actions"><span>Değişiklikler ürün ve SEO bilgilerinde birlikte saklanır.</span><button type="submit">Tüm ürün bilgilerini kaydet</button></div>
        </form>:<div className="product-readonly"><h4>{meta.subtitle||product.name}</h4><div dangerouslySetInnerHTML={{__html:product.description||"Açıklama bulunmuyor."}}/>{meta.tags?<p><b>Etiketler:</b> {meta.tags}</p>:null}</div>}
      </section>
    </div>
    <section className="card" style={{marginTop:24,padding:24}}><div className="head"><div><small>VARYANTLAR</small><h3>{variants?.length??0} varyant</h3></div><span>Stok değişikliği Stok Yönetimi ekranından yapılır</span></div>
      {canManage&&<details style={{marginTop:18,padding:16,border:"1px solid rgba(0,0,0,.08)",borderRadius:12}}><summary style={{cursor:"pointer",fontWeight:800}}>+ Yeni varyant ekle</summary><form action={createVariant} style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10,alignItems:"end",marginTop:14}}><input type="hidden" name="product_id" value={product.id}/><label>Varyant adı<input name="title" placeholder="Örn. Siyah / M" required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>SKU<input name="sku" required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Satış fiyatı ₺<input name="price" type="number" min="0" step="0.01" required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Karşılaştırma fiyatı ₺<input name="compare_at_price" type="number" min="0" step="0.01" placeholder="İndirim yoksa boş" style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Başlangıç stoku<input name="stock" type="number" step="1" defaultValue="0" required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label style={{paddingBottom:10}}><input name="allow_backorder" type="checkbox" defaultChecked/> Stoksuz satış</label><button type="submit" style={{padding:10}}>Varyant oluştur</button></form></details>}
      <div style={{display:"grid",gap:12,marginTop:18}}>{variants?.map(v=>canManage?<form action={updateVariant} key={v.id} style={{display:"grid",gridTemplateColumns:"minmax(150px,1fr) minmax(130px,1fr) 120px 150px 145px auto",gap:10,alignItems:"end",padding:14,border:"1px solid rgba(0,0,0,.08)",borderRadius:12}}><input type="hidden" name="product_id" value={product.id}/><input type="hidden" name="variant_id" value={v.id}/><label>Varyant<input value={v.title||"Default"} readOnly style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>SKU<input name="sku" defaultValue={v.sku??""} required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Satış fiyatı ₺<input name="price" type="number" min="0" step="0.01" defaultValue={(v.price/100).toFixed(2)} required style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Karşılaştırma fiyatı ₺<input name="compare_at_price" type="number" min="0" step="0.01" defaultValue={v.compare_at_price?(v.compare_at_price/100).toFixed(2):""} placeholder="İndirim yok" style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label style={{paddingBottom:10}}><input name="allow_backorder" type="checkbox" defaultChecked={v.allow_backorder}/> Stoksuz satış</label><button type="submit" style={{padding:10}}>Kaydet</button></form>:<div key={v.id}>{v.title} · {v.sku} · {v.compare_at_price>v.price?<><s>{(v.compare_at_price/100).toFixed(2)} ₺</s> </>:null}{(v.price/100).toFixed(2)} ₺</div>)}</div>
    </section>
  </Shell>;
}
