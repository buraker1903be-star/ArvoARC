import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { Notice } from "@/components/panel/notice";
import { createCollection } from "./actions";
import "../catalog.css";
import "../modules.css";

const STATUS_TABS=[["all","Tümü"],["active","Aktif"],["draft","Taslak"],["archived","Arşiv"]] as const;
type StatusKey=(typeof STATUS_TABS)[number][0];
const statusLabels:Record<string,string>={draft:"Taslak",active:"Aktif",archived:"Arşivlenmiş"};
const ERRORS:Record<string,string>={
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-collection":"Koleksiyon adı ve bağlantısı zorunlu.",
  "23505":"Bu bağlantı başka bir koleksiyonda kullanılıyor.",
  "not-found":"Koleksiyon bulunamadı.",
};

type Membership={collection_id:string;product_id:string};

export default async function Collections({searchParams}:{searchParams:Promise<{error?:string;q?:string;filter?:string}>}){
  const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const search=(query.q??"").trim().slice(0,80);
  const needle=search.toLocaleLowerCase("tr-TR");
  const filter:StatusKey=STATUS_TABS.some(([key])=>key===query.filter)?(query.filter as StatusKey):"all";

  /*
    Koleksiyon-ürün bağlantıları 6.500'ü aştı. `.limit(20000)`
    Supabase'in 1000 satır sınırını aşmıyordu: ürün sayıları eksik
    görünüyordu. Bağlantılar 1000'lik sayfalarla okunur.
  */
  const [{data:collections,error},{rows:memberships}]=await Promise.all([
    supabase.from("arc_collections").select("id,title,slug,description,status,source,seo_title,metadata,created_at").eq("organization_id",organization.id).order("title"),
    fetchAllRows<Membership>((from,to)=>supabase.from("arc_collection_products").select("collection_id,product_id").eq("organization_id",organization.id).order("collection_id").order("product_id").range(from,to) as unknown as PromiseLike<{data:Membership[]|null;error:{message:string}|null}>,100_000),
  ]);
  if(error)throw new Error(error.message);
  const canManage=["owner","admin","manager"].includes(membership.role);
  const counts=new Map<string,number>();
  for(const item of memberships)counts.set(item.collection_id,(counts.get(item.collection_id)??0)+1);
  const all=collections??[];
  const mappedProducts=new Set(memberships.map(item=>item.product_id)).size;
  const searched=needle?all.filter(collection=>collection.title.toLocaleLowerCase("tr-TR").includes(needle)||collection.slug.includes(needle)):all;
  const tabCounts=Object.fromEntries(STATUS_TABS.map(([key])=>[key,key==="all"?searched.length:searched.filter(item=>item.status===key).length])) as Record<StatusKey,number>;
  const visible=filter==="all"?searched:searched.filter(item=>item.status===filter);
  const href=(patch:{q?:string;filter?:StatusKey})=>{const next={q:search,filter,...patch};const params=new URLSearchParams();if(next.q)params.set("q",next.q);if(next.filter!=="all")params.set("filter",next.filter);const text=params.toString();return text?`/koleksiyonlar?${text}`:"/koleksiyonlar";};

  return <>
    <section className="ac-bar">
      <div>
        <h1>Koleksiyonlar</h1>
        <p>Ürünleri mağazada birlikte sergilemek için gruplar.</p>
      </div>
      {canManage?<div className="ac-bar-actions"><a className="ac-btn ac-btn-primary" href="#yeni-koleksiyon">+ Yeni koleksiyon</a></div>:null}
    </section>

    <div className="ac-stack">
      {query.error?<Notice tone="error" title="Koleksiyon işlemi tamamlanamadı">{ERRORS[query.error]??query.error}</Notice>:null}

      <section className="ac-metrics" aria-label="Koleksiyon özeti">
        <article className="ac-metric"><span>Koleksiyon</span><strong>{all.length.toLocaleString("tr-TR")}</strong><small>Tüm durumlar</small></article>
        <Link prefetch={false} className="ac-metric ac-lift" href={href({filter:"active"})}><span>Aktif</span><strong>{all.filter(item=>item.status==="active").length.toLocaleString("tr-TR")}</strong><small>Mağazada yayınlanabilir</small></Link>
        <article className="ac-metric"><span>Eşlenen ürün</span><strong>{mappedProducts.toLocaleString("tr-TR")}</strong><small>En az bir koleksiyonda</small></article>
        <article className="ac-metric"><span>Shopify kaynaklı</span><strong>{all.filter(item=>item.source==="shopify").length.toLocaleString("tr-TR")}</strong><small>Ürün türünden eşlendi</small></article>
      </section>

      <section className="ac ac-pad-sm module-toolbar">
        <form className="ac-filter module-search" role="search">
          {filter!=="all"?<input type="hidden" name="filter" value={filter}/>:null}
          <input name="q" defaultValue={search} placeholder="Koleksiyon adı veya bağlantı" aria-label="Koleksiyonlarda ara"/>
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {search?<Link prefetch={false} className="ac-btn" href={href({q:""})}>Temizle</Link>:null}
        </form>
      </section>

      <nav className="ac-filter" aria-label="Koleksiyon durumu">
        {STATUS_TABS.map(([key,label])=>(
          <Link prefetch={false} key={key} className="ac-btn" href={href({filter:key})} aria-current={filter===key?"page":undefined}>{label}<span className="ac-count">{tabCounts[key]}</span></Link>
        ))}
      </nav>

      {/* Kart ızgarası yerine liste: 122 koleksiyon kart düzeninde
          çok uzun bir sayfa yapıyor, karşılaştırma zorlaşıyordu. */}
      <section className="ac table list-table collection-list">
        <div className="ac-head ac-pad-sm list-table-head"><div><h3>{visible.length.toLocaleString("tr-TR")} koleksiyon</h3><p>Satıra tıklayarak ürünlerini ve SEO bilgilerini düzenleyin.</p></div></div>
        {visible.length?<>
          <div className="list-row th"><span className="col-name">KOLEKSİYON</span><span className="col-source">KAYNAK</span><span className="col-count">ÜRÜN</span><span className="col-status">DURUM</span></div>
          {visible.map(collection=>(
            <div className="list-row" key={collection.id}>
              <span className="col-name"><Link prefetch={false} className="list-row-link" href={`/koleksiyonlar/${collection.id}`}><b>{collection.title}</b></Link><small>/{collection.slug}</small></span>
              <span className="col-source">{collection.source==="shopify"?"Shopify":"ARVO ARC"}</span>
              <span className="col-count"><em className="stock-pill" data-tone={(counts.get(collection.id)??0)===0?"warn":undefined}>{(counts.get(collection.id)??0).toLocaleString("tr-TR")} ürün</em></span>
              <span className="col-status"><em className="ac-tag" data-tone={collection.status==="active"?undefined:collection.status==="draft"?"warn":"muted"}>{statusLabels[collection.status]??collection.status}</em></span>
            </div>
          ))}
        </>:<div className="list-empty"><b>{all.length?"Bu ölçütlere uygun koleksiyon yok.":"Henüz koleksiyon bulunmuyor."}</b><p>{all.length?"Aramayı veya durumu değiştirin.":"İlk koleksiyonunuzu oluşturarak ürünleri gruplandırmaya başlayın."}</p></div>}
      </section>

      {canManage?(
        <details className="ac ac-pad catalog-details" id="yeni-koleksiyon">
          <summary><span><b>Yeni koleksiyon oluştur</b><small>Oluşturduktan sonra ürünleri ve SEO bilgilerini düzenleyicide eklersiniz</small></span></summary>
          <form action={createCollection} className="catalog-form">
            <label>Koleksiyon adı<input name="title" required maxLength={160} placeholder="Örn. En Çok Satanlar" className="ac-input"/></label>
            <label>Bağlantı adı<input name="slug" maxLength={160} placeholder="en-cok-satanlar" className="ac-input"/></label>
            <div className="catalog-form-actions"><button className="ac-btn ac-btn-primary" type="submit">Koleksiyon oluştur</button></div>
          </form>
        </details>
      ):null}
    </div>
  </>;
}
