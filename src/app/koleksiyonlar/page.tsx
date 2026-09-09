import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createCollection } from "./actions";

const statusLabels:Record<string,string>={draft:"Taslak",active:"Aktif",archived:"Arşivlenmiş"};

export default async function Collections({searchParams}:{searchParams:Promise<{error?:string}>}){
  const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:collections,error},{data:memberships,error:membershipError}]=await Promise.all([
    supabase.from("arc_collections").select("id,title,slug,description,status,source,seo_title,metadata,created_at").eq("organization_id",organization.id).order("title"),
    supabase./*
      Koleksiyon-ürün bağlantıları. Otomatik kategorilemeden
      sonra 6.500'ü aştı ve Supabase 1000 satırda kesiyordu:
      koleksiyonların ürün sayıları eksik görünüyordu.
    */
    from("arc_collection_products").select("collection_id,product_id").limit(20000).eq("organization_id",organization.id)
  ]);
  if(error)throw new Error(error.message);if(membershipError)throw new Error(membershipError.message);
  const canManage=["owner","admin","manager"].includes(membership.role);
  const counts=new Map<string,number>();
  for(const item of memberships??[])counts.set(item.collection_id,(counts.get(item.collection_id)??0)+1);
  const activeCount=(collections??[]).filter(collection=>collection.status==="active").length;
  const mappedProducts=new Set((memberships??[]).map(item=>item.product_id)).size;

  return <Shell active="collections" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>KATALOG YAPISI · CANLI</small><h2>Koleksiyonlar</h2><p>Ürünleri mağazada birlikte sergilemek, SEO bağlantıları oluşturmak ve kampanya grupları hazırlamak için koleksiyonları yönetin.</p></div></section>
    <section className="metrics"><article><span>TOPLAM KOLEKSİYON</span><strong>{collections?.length??0}</strong><small>Tüm durumlar</small></article><article><span>AKTİF</span><strong>{activeCount}</strong><small>Mağazada yayınlanabilir</small></article><article><span>EŞLENEN ÜRÜN</span><strong>{mappedProducts}</strong><small>En az bir koleksiyonda</small></article><article><span>SHOPIFY KAYNAKLI</span><strong>{collections?.filter(item=>item.source==="shopify").length??0}</strong><small>Ürün türünden eşlendi</small></article></section>
    {query.error?<section className="card" style={{padding:16,marginBottom:20}}><strong>Koleksiyon işlemi tamamlanamadı: {query.error}</strong></section>:null}
    {/*
      Kart ızgarası yerine tablo: 122 koleksiyon kart düzeninde
      çok uzun bir sayfa yapıyor ve karşılaştırma zorlaşıyordu.
    */}
    <section className="card table">
      <div className="head"><div><small>KOLEKSİYONLAR</small><h3>{collections?.length??0} koleksiyon</h3></div><span>{organization.name}</span></div>
      <div className="row collection-row th"><span>KOLEKSİYON</span><span>BAĞLANTI</span><span>KAYNAK</span><span>ÜRÜN</span><span>DURUM</span></div>
      {(collections??[]).map((collection)=><Link href={`/koleksiyonlar/${collection.id}`} className="row collection-row" key={collection.id} style={{textDecoration:"none",color:"inherit"}}>
        <span><b>{collection.title}</b></span>
        <span className="muted">/{collection.slug}</span>
        <span className="muted">{collection.source==="shopify"?"Shopify":"ARC"}</span>
        <span><b>{counts.get(collection.id)??0}</b></span>
        <span><em data-tone={collection.status==="active"?undefined:"muted"}>{statusLabels[collection.status]??collection.status}</em></span>
      </Link>)}
      {!collections?.length?<div style={{padding:24}}><strong>Henüz koleksiyon bulunmuyor.</strong><p>İlk koleksiyonunuzu oluşturarak ürünleri gruplandırmaya başlayın.</p></div>:null}
    </section>

    {canManage?<details className="card collection-create"><summary>+ Yeni koleksiyon oluştur</summary><form action={createCollection}><label>Koleksiyon adı<input name="title" required maxLength={160} placeholder="Örn. En Çok Satanlar"/></label><label>Bağlantı adı<input name="slug" maxLength={160} placeholder="en-cok-satanlar"/></label><button type="submit">Koleksiyon oluştur</button></form></details>:null}
  </Shell>;
}
