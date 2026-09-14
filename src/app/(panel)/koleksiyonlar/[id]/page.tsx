import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { Notice } from "@/components/panel/notice";
import { updateCollection } from "../actions";
import "../../catalog.css";
import "../../modules.css";

type Membership={product_id:string;position:number|null};
type ProductRow={id:string;name:string;status:string;source:string|null;metadata:unknown};

const ERRORS:Record<string,string>={
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-collection":"Koleksiyon adı ve bağlantısı zorunlu.",
  "23505":"Bu bağlantı başka bir koleksiyonda kullanılıyor.",
  "not-found":"Koleksiyon bulunamadı.",
};

function PickerRow({product,checked}:{product:ProductRow;checked:boolean}){
  const meta=(product.metadata??{}) as {vendor?:string;type?:string};
  return <label className={checked?"selected":""}>
    <input type="checkbox" name="product_ids" value={product.id} defaultChecked={checked}/>
    <i>{product.name.slice(0,2).toLocaleUpperCase("tr-TR")}</i>
    <span><b>{product.name}</b><small>{meta.vendor||"ARVO ARC"} · {meta.type||"Katalog ürünü"}</small></span>
    <em>{product.status==="active"?"Aktif":product.status==="draft"?"Taslak":"Arşiv"}</em>
  </label>;
}

export default async function CollectionDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;created?:string;error?:string;q?:string;added?:string;removed?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const search=(query.q??"").replace(/[,()*\\"%_]/g," ").trim().slice(0,80);

  /*
    Üyelikler 1000'lik sayfalarla okunur (Supabase max_rows). Mevcut
    üyelerin tamamı seçicide gösterilir: kaydetme yalnızca formda
    gösterilen üyelikleri değiştirir.
  */
  const [{data:collection,error},{rows:memberships}]=await Promise.all([
    supabase.from("arc_collections").select("id,title,slug,description,status,source,seo_title,seo_description,metadata").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    fetchAllRows<Membership>((from,to)=>supabase.from("arc_collection_products").select("product_id,position").eq("organization_id",organization.id).eq("collection_id",id).order("position").order("product_id").range(from,to) as unknown as PromiseLike<{data:Membership[]|null;error:{message:string}|null}>,20_000),
  ]);
  if(error)throw new Error(error.message);if(!collection)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role);

  const memberIds=memberships.map(item=>item.product_id);
  const chunks=Array.from({length:Math.ceil(memberIds.length/150)},(_,index)=>memberIds.slice(index*150,index*150+150));
  let candidateQuery=supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).neq("status","archived");
  candidateQuery=search?candidateQuery.ilike("name",`%${search}%`).order("name"):candidateQuery.order("updated_at",{ascending:false});
  const [memberResults,candidateResult]=await Promise.all([
    Promise.all(chunks.map(chunk=>supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).in("id",chunk))),
    candidateQuery.limit(80),
  ]);
  for(const result of memberResults)if(result.error)throw new Error(result.error.message);
  if(candidateResult.error)throw new Error(candidateResult.error.message);

  const productById=new Map(memberResults.flatMap(result=>(result.data??[]) as ProductRow[]).map(product=>[product.id,product]));
  const members=memberIds.map(productId=>productById.get(productId)).filter((product):product is ProductRow=>Boolean(product));
  const memberSet=new Set(memberIds);
  const candidates=((candidateResult.data??[]) as ProductRow[]).filter(product=>!memberSet.has(product.id));
  const added=Number(query.added??0),removed=Number(query.removed??0);

  return <>
    <section className="ac-bar">
      <div>
        <Link prefetch={false} className="product-back" href="/koleksiyonlar">← Koleksiyonlar</Link>
        <h1>{collection.title}</h1>
        <p>/koleksiyon/{collection.slug} · {members.length.toLocaleString("tr-TR")} ürün · {collection.source==="shopify"?"Shopify eşlemesi":"ARVO ARC"}</p>
      </div>
      <div className="product-head-actions"><em className="ac-tag" data-tone={collection.status==="active"?undefined:collection.status==="draft"?"warn":"muted"}>{collection.status==="active"?"Aktif":collection.status==="draft"?"Taslak":"Arşivlenmiş"}</em></div>
    </section>

    <div className="ac-stack">
      {query.created?<Notice title="Koleksiyon oluşturuldu.">Ürünleri seçip SEO bilgilerini ekledikten sonra durumunu Aktif yapın.</Notice>:null}
      {query.saved?<Notice title="Koleksiyon kaydedildi.">{added||removed?`${added} ürün eklendi, ${removed} ürün çıkarıldı.`:null}</Notice>:null}
      {query.error?<Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[query.error]??query.error}</Notice>:null}

      {canManage?<>
        {/* Ayrı form: kaydetme formunun içine yerleştirilemez (iç içe form). */}
        <section className="ac ac-pad-sm module-toolbar">
          <form className="ac-filter module-search" role="search">
            <input name="q" defaultValue={search} placeholder="Koleksiyona eklenecek ürünü adıyla ara" aria-label="Eklenecek ürünü ara"/>
            <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
            {search?<Link prefetch={false} className="ac-btn" href={`/koleksiyonlar/${collection.id}`}>Temizle</Link>:null}
          </form>
        </section>

        <form action={updateCollection} className="collection-editor">
          <input type="hidden" name="id" value={collection.id}/>
          {members.map(product=><input key={product.id} type="hidden" name="member_ids" value={product.id}/>)}
          <section className="ac ac-pad collection-editor-info">
            <div className="ac-head"><div><h3>Yayın ve SEO</h3><p>{members.length.toLocaleString("tr-TR")} ürün seçili</p></div></div>
            <div className="editor-field-grid">
              <label>Koleksiyon adı<input name="title" defaultValue={collection.title} required maxLength={160}/></label>
              <label>Durum<select name="status" defaultValue={collection.status}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşivlenmiş</option></select></label>
              <label className="full-field">Bağlantı<input name="slug" defaultValue={collection.slug} required maxLength={160}/></label>
              <label className="full-field">Açıklama<textarea name="description" defaultValue={collection.description} rows={6} maxLength={10000}/></label>
              <label className="full-field">SEO başlığı<input name="seo_title" defaultValue={collection.seo_title} maxLength={70}/></label>
              <label className="full-field">Meta açıklaması<textarea name="seo_description" defaultValue={collection.seo_description} rows={3} maxLength={180}/></label>
            </div>
          </section>
          <section className="ac ac-pad collection-products">
            <div className="ac-head"><div><h3>Ürünler</h3><p>İşareti kaldırılan ürün koleksiyondan çıkar; işaretlenen yeni ürün sona eklenir.</p></div></div>
            <div className="collection-product-picker">
              <p className="picker-group">KOLEKSİYONDAKİ ÜRÜNLER · {members.length.toLocaleString("tr-TR")}</p>
              {members.length?members.map(product=><PickerRow key={product.id} product={product} checked/>):<p className="module-hint">Henüz ürün yok. Aşağıdan ekleyin.</p>}
              <p className="picker-group">{search?`“${search}” İÇİN SONUÇLAR`:"SON GÜNCELLENEN ÜRÜNLER"} · {candidates.length}</p>
              {candidates.length?candidates.map(product=><PickerRow key={product.id} product={product} checked={false}/>):<p className="module-hint">{search?"Eşleşen ve koleksiyonda olmayan ürün yok.":"Eklenebilecek ürün yok."}</p>}
            </div>
          </section>
          <div className="product-editor-actions"><span>Koleksiyon ve ürün sıralaması mağaza kataloğuna yansır.</span><button className="ac-btn ac-btn-primary" type="submit">Koleksiyonu kaydet</button></div>
        </form>
      </>:<p className="module-hint">Bu koleksiyonu düzenleme yetkiniz bulunmuyor.</p>}
    </div>
  </>;
}
