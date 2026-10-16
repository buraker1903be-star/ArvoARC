import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { KListe, KOge } from "@/components/arvo-ui/k-ui";
import { Pencere } from "@/components/os/pencere";
import { createCollection } from "./actions";
// Yeni koleksiyon formunun biçimi (catalog-form) hâlâ orada.
import "../catalog.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./koleksiyon-listesi.css";

const STATUS_TABS=[["all","Tümü"],["active","Aktif"],["draft","Taslak"],["archived","Arşiv"]] as const;
type StatusKey=(typeof STATUS_TABS)[number][0];
const statusLabels:Record<string,string>={draft:"Taslak",active:"Aktif",archived:"Arşivlenmiş"};

type Membership={collection_id:string;product_id:string};

export default async function Collections({searchParams}:{searchParams:Promise<{q?:string;filter?:string;pencere?:string}>}){
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

  /* ArvoOS kalıbı (16.10.2026): başlık, durum şeridi, iOS listesi; yeni koleksiyon pencerede. */
  const pencere=canManage&&query.pencere==="yeni";
  const yeniAdres=`${href({})}${href({}).includes("?")?"&":"?"}pencere=yeni`;
  const DURUM_TONU:Record<string,string>={active:"success",draft:"warning",archived:"neutral"};
  return (
    <main className="talep liste-sayfa koleksiyon-listesi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Katalog</small>
          <h1>Koleksiyonlar</h1>
          <p className="talep-bas-alt">{all.length.toLocaleString("tr-TR")} koleksiyon · {mappedProducts.toLocaleString("tr-TR")} eşlenen ürün · {all.filter(item=>item.source==="shopify").length.toLocaleString("tr-TR")}’ü Shopify kaynaklı</p>
        </div>
        {canManage?<div className="talep-bas-eylem"><Link prefetch={false} scroll={false} className="panel-primary" href={yeniAdres}>+ Yeni koleksiyon</Link></div>:null}
      </header>

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {STATUS_TABS.map(([key,label])=>(
            <div key={key} className={filter===key?"is-active":undefined}>
              <dt>{label}</dt>
              <dd><Link prefetch={false} href={href({filter:key})} aria-current={filter===key?"page":undefined}>{tabCounts[key]}</Link></dd>
            </div>
          ))}
        </dl>
      </nav>

      <section className="panel-card talep-bilgi" aria-label="Koleksiyon listesi">
        <div className="ekip-suzgec talep-suzgec">
          <form className="talep-ara" role="search">
            {filter!=="all"?<input type="hidden" name="filter" value={filter}/>:null}
            <input name="q" defaultValue={search} placeholder="Koleksiyon adı veya bağlantı" aria-label="Koleksiyonlarda ara"/>
          </form>
        </div>
        {visible.length?(
          /* Kart ızgarası yerine liste: 122 koleksiyon kart düzeninde çok uzun bir sayfa yapıyordu. */
          <KListe>
            {visible.map(collection=>{
              const adet=counts.get(collection.id)??0;
              return (
                <KOge
                  key={collection.id}
                  href={`/koleksiyonlar/${collection.id}`}
                  simge={collection.title}
                  baslik={collection.title}
                  alt={`/${collection.slug} · ${collection.source==="shopify"?"Shopify":"ArvoARC"}`}
                  durum={{etiket:statusLabels[collection.status]??collection.status,ton:DURUM_TONU[collection.status]??"neutral"}}
                  deger={`${adet.toLocaleString("tr-TR")} ürün`}
                  degerAlt={adet===0?"boş raf":undefined}
                />
              );
            })}
          </KListe>
        ):(
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{all.length?"Bu ölçütlere uygun koleksiyon yok":"Henüz koleksiyon yok"}</h2>
            <p>{all.length?"Koleksiyon adında arama yapılır. Aramayı veya durumu değiştirin.":"Koleksiyon, vitrinde ürünleri gruplayan raftır — “Yeni Gelenler”, “Çok Satanlar” gibi."}</p>
            <div className="crm-empty-actions">
              {all.length?<Link prefetch={false} className="panel-secondary" href="/koleksiyonlar">Süzgeci temizle</Link>:null}
              {!all.length&&canManage?<Link prefetch={false} className="panel-primary" href={yeniAdres}>İlk koleksiyonu oluştur</Link>:null}
            </div>
          </div>
        )}
      </section>

      {pencere?(
        <Pencere key="yeni" ust="Katalog" baslik="Yeni koleksiyon" kapatAdresi={href({})} genis={false}>
          <p className="koleksiyon-pencere-alt">Oluşturduktan sonra ürünleri ve SEO bilgilerini düzenleyicide eklersiniz.</p>
          <form action={createCollection} className="catalog-form">
            <label>Koleksiyon adı<input name="title" required maxLength={160} placeholder="Örn. En Çok Satanlar" className="ac-input"/></label>
            <label>Bağlantı adı<input name="slug" maxLength={160} placeholder="en-cok-satanlar" className="ac-input"/></label>
            <div className="catalog-form-actions"><button className="ac-btn ac-btn-primary" type="submit">Koleksiyon oluştur</button></div>
          </form>
        </Pencere>
      ):null}
    </main>
  );
}
