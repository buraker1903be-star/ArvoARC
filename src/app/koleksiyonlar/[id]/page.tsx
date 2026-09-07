import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateCollection } from "../actions";

export default async function CollectionDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;created?:string;error?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:collection,error},{data:products,error:productsError},{data:memberships,error:membershipError}]=await Promise.all([
    supabase.from("arc_collections").select("id,title,slug,description,status,source,seo_title,seo_description,metadata").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).neq("status","archived").order("name"),
    supabase.from("arc_collection_products").select("product_id,position").eq("organization_id",organization.id).eq("collection_id",id).order("position")
  ]);
  if(error)throw new Error(error.message);if(productsError)throw new Error(productsError.message);if(membershipError)throw new Error(membershipError.message);if(!collection)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role);
  const selected=new Set((memberships??[]).map(item=>item.product_id));
  const orderedProducts=[...(products??[])].sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||a.name.localeCompare(b.name,"tr"));
  return <Shell active="collections" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/koleksiyonlar">KOLEKSİYONLAR</Link> · {collection.source==="shopify"?"SHOPIFY EŞLEMESİ":"ARVO ARC"}</small><h2>{collection.title}</h2><p>arvoculture.com/koleksiyon/{collection.slug} · {selected.size} ürün</p></div></section>
    {(query.saved||query.created)?<section className="card" style={{padding:16,marginBottom:20}}><strong>Koleksiyon bilgileri kaydedildi.</strong></section>:null}
    {query.error?<section className="card" style={{padding:16,marginBottom:20}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>:null}
    {canManage?<form action={updateCollection} className="collection-editor"><input type="hidden" name="id" value={collection.id}/>
      <section className="card collection-editor-info"><div className="head"><div><small>KOLEKSİYON BİLGİLERİ</small><h3>Yayın ve SEO</h3></div><span>{selected.size} ürün seçili</span></div>
        <div className="editor-field-grid">
          <label>Koleksiyon adı<input name="title" defaultValue={collection.title} required maxLength={160}/></label>
          <label>Durum<select name="status" defaultValue={collection.status}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşivlenmiş</option></select></label>
          <label className="full-field">Bağlantı<input name="slug" defaultValue={collection.slug} required maxLength={160}/></label>
          <label className="full-field">Açıklama<textarea name="description" defaultValue={collection.description} rows={6} maxLength={10000}/></label>
          <label className="full-field">SEO başlığı<input name="seo_title" defaultValue={collection.seo_title} maxLength={70}/></label>
          <label className="full-field">Meta açıklaması<textarea name="seo_description" defaultValue={collection.seo_description} rows={3} maxLength={180}/></label>
        </div>
      </section>
      <section className="card collection-products"><div className="head"><div><small>ÜRÜN ÜYELİĞİ</small><h3>Koleksiyondaki ürünler</h3></div><span>{products?.length??0} katalog ürünü</span></div>
        <div className="collection-product-picker">{orderedProducts.map(product=>{const meta=(product.metadata??{}) as {vendor?:string;type?:string};return <label className={selected.has(product.id)?"selected":""} key={product.id}><input type="checkbox" name="product_ids" value={product.id} defaultChecked={selected.has(product.id)}/><i>{product.name.slice(0,2).toUpperCase()}</i><span><b>{product.name}</b><small>{meta.vendor||"ARVO ARC"} · {meta.type||"Katalog ürünü"}</small></span><em>{product.status==="active"?"Aktif":"Taslak"}</em></label>})}</div>
      </section>
      <div className="product-editor-actions"><span>Koleksiyon ve ürün sıralaması mağaza kataloğuna yansıtılacaktır.</span><button type="submit">Koleksiyonu kaydet</button></div>
    </form>:<p>Bu koleksiyonu düzenleme yetkiniz bulunmuyor.</p>}
  </Shell>;
}
