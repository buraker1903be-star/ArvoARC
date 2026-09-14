import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Notice } from "@/components/panel/notice";
import { createDiscount,deleteDiscount,toggleDiscount } from "./actions";
import "../catalog.css";
import "../modules.css";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
const dateTime=new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"});
type Meta={vendor?:string;badge?:string;badge_tone?:string};

const ERRORS:Record<string,string>={
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-discount":"Kampanya adı, türü ve geçerli bir indirim değeri gerekli.",
  "23505":"Bu kupon kodu başka bir kampanyada kullanılıyor.",
  "invalid-date":"Başlangıç veya bitiş tarihi geçersiz.",
  "invalid-range":"Bitiş tarihi başlangıçtan sonra olmalı.",
};

function ruleValue(rule:{discount_type:string;value:number}){
  if(rule.discount_type==="percentage")return `%${rule.value}`;
  if(rule.discount_type==="fixed_amount")return money.format(rule.value/100);
  return "Ücretsiz";
}
function ruleType(type:string){
  return type==="percentage"?"Sepette yüzde indirim":type==="fixed_amount"?"Sepette tutar indirimi":"Ücretsiz kargo";
}

export default async function DiscountsPage({searchParams}:{searchParams:Promise<{created?:string;saved?:string;deleted?:string;error?:string}>}){
  const params=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:products,error:productError},{data:variants,error:variantError},{data:rules,error:rulesError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,status,metadata").is("supplier",null).limit(500).eq("organization_id",organization.id),
    /*
      Ürün indirimleri yalnızca kendi ürünlerimizde: tedarikçi
      ürünlerinin fiyatı kuraldan hesaplanıyor.
    */
    supabase.from("arc_product_variants").select("id,product_id,title,sku,price,compare_at_price,currency,stock").is("supplier",null).limit(500).eq("organization_id",organization.id).order("updated_at",{ascending:false}),
    supabase.from("arc_discounts").select("id,name,code,discount_type,value,minimum_subtotal,usage_limit,usage_count,per_customer_limit,starts_at,ends_at,status,combinable,metadata,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false})
  ]);
  if(productError)throw new Error(productError.message);
  if(variantError)throw new Error(variantError.message);
  if(rulesError)throw new Error(rulesError.message);

  const canManage=["owner","admin","manager"].includes(membership.role);
  const productById=new Map((products??[]).map(product=>[product.id,product]));
  const productDiscounts=(variants??[]).filter(variant=>(variant.compare_at_price??0)>variant.price).map(variant=>{
    const product=productById.get(variant.product_id);
    const compare=variant.compare_at_price??variant.price;
    return {...variant,product,discountAmount:compare-variant.price,discountRate:Math.round((1-variant.price/compare)*100)};
  }).filter(item=>item.product).sort((a,b)=>b.discountRate-a.discountRate);
  const allRules=rules??[];
  const activeRules=allRules.filter(rule=>rule.status==="active");

  return <>
    <section className="ac-bar">
      <div>
        <h1>İndirimler</h1>
        <p>Ürün indirimi, kupon ve kargo kuralları.</p>
      </div>
      {canManage?<div className="ac-bar-actions"><a className="ac-btn ac-btn-primary" href="#yeni-indirim">+ Yeni indirim paketi</a></div>:null}
    </section>

    <div className="ac-stack">
      {params.created?<Notice title="İndirim paketi oluşturuldu."/>:null}
      {params.saved?<Notice title="İndirim durumu güncellendi."/>:null}
      {params.deleted?<Notice title="İndirim paketi silindi."/>:null}
      {params.error?<Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[params.error]??params.error}</Notice>:null}

      <section className="ac-metrics" aria-label="İndirim özeti">
        <article className="ac-metric"><span>Aktif kural</span><strong>{activeRules.length}</strong><small>Sepet ve kargo</small></article>
        <article className="ac-metric"><span>Kupon kodu</span><strong>{activeRules.filter(rule=>rule.code).length}</strong><small>Müşteri tarafından girilir</small></article>
        <article className="ac-metric"><span>Otomatik kampanya</span><strong>{activeRules.filter(rule=>!rule.code).length}</strong><small>Koşul sağlanınca uygulanır</small></article>
        <article className="ac-metric"><span>Ürün indirimi</span><strong>{productDiscounts.length}</strong><small>Karşılaştırma fiyatından</small></article>
      </section>

      {canManage?(
        <details className="ac ac-pad catalog-details" id="yeni-indirim">
          <summary><span><b>Yeni indirim paketi oluştur</b><small>Kupon kodunu boş bırakırsanız kural sepette otomatik uygulanır</small></span></summary>
          <form action={createDiscount}>
            <div className="discount-form-grid">
              <label className="wide">Kampanya adı<input name="name" required maxLength={160} placeholder="Örn. 2.000 TL Üzeri Ücretsiz Kargo"/></label>
              <label>İndirim türü<select name="discount_type" defaultValue="percentage"><option value="percentage">Sepette yüzde indirim</option><option value="fixed_amount">Sepette sabit tutar indirimi</option><option value="free_shipping">Ücretsiz kargo</option></select></label>
              <label>İndirim değeri<input name="value" type="number" min="0" step="0.01" defaultValue="10"/><small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small></label>
              <label>Minimum sepet tutarı (₺)<input name="minimum_subtotal" type="number" min="0" step="0.01" defaultValue="0"/></label>
              <label>Kupon kodu<input name="code" maxLength={40} placeholder="Örn. ARVO10"/></label>
              <label>Toplam kullanım limiti<input name="usage_limit" type="number" min="1" step="1" placeholder="Limitsiz"/></label>
              <label>Kişi başı kullanım<input name="per_customer_limit" type="number" min="1" step="1" placeholder="Limitsiz"/></label>
              <label>Başlangıç (Türkiye saati)<input name="starts_at" type="datetime-local"/></label>
              <label>Bitiş (Türkiye saati)<input name="ends_at" type="datetime-local"/></label>
              <label className="check-inline"><input name="active" type="checkbox" defaultChecked/> Hemen aktif et</label>
              <label className="check-inline"><input name="combinable" type="checkbox"/> Diğer indirimlerle birleştirilebilir</label>
            </div>
            <div className="product-editor-actions"><span>Kural sepet hesaplama motorunda saklanır; vitrin ve ödeme aynı kuralı uygular.</span><button className="ac-btn ac-btn-primary" type="submit">İndirim paketini oluştur</button></div>
          </form>
        </details>
      ):null}

      <section>
        <div className="section-title"><div><small>SEPET VE KARGO KURALLARI</small><h3>{allRules.length} indirim paketi</h3></div></div>
        {allRules.length?<div className="discount-package-grid">{allRules.map(rule=><article className={`discount-package ${rule.status}`} key={rule.id}>
          <div className="discount-package-top"><span>{rule.code?<b>{rule.code}</b>:<b>OTOMATİK</b>}<small>{ruleType(rule.discount_type)}</small></span><em>{rule.status==="active"?"Aktif":rule.status==="paused"?"Duraklatıldı":"Taslak"}</em></div>
          <div className="discount-package-value"><strong>{ruleValue(rule)}</strong><span>{rule.minimum_subtotal>0?`${money.format(rule.minimum_subtotal/100)} üzeri`:"Alt limitsiz"}</span></div>
          <h3>{rule.name}</h3>
          <ul>
            <li>{rule.combinable?"Diğer indirimlerle birleşebilir":"Tek başına uygulanır"}</li>
            <li>{rule.usage_limit?`${rule.usage_count}/${rule.usage_limit} kullanım`:`${rule.usage_count??0} kullanım · limitsiz`}</li>
            <li>{rule.per_customer_limit?`Müşteri başına ${rule.per_customer_limit} kez`:"Müşteri limiti yok"}</li>
            <li>{rule.ends_at?`${dateTime.format(new Date(rule.ends_at))} tarihinde biter`:"Süresiz kampanya"}</li>
          </ul>
          {canManage?<div className="discount-package-actions">
            <form action={toggleDiscount}><input type="hidden" name="id" value={rule.id}/><input type="hidden" name="next_status" value={rule.status==="active"?"paused":"active"}/><button className="ac-btn" type="submit">{rule.status==="active"?"Duraklat":"Aktif et"}</button></form>
            {/* Silme geri alınamaz: tek tıkla değil, satır içi onayla. */}
            <details className="confirm-inline">
              <summary className="ac-btn ac-btn-danger">Sil</summary>
              <form action={deleteDiscount} className="confirm-inline-body">
                <input type="hidden" name="id" value={rule.id}/>
                <span>“{rule.name}” kalıcı olarak silinsin mi?</span>
                <button className="ac-btn ac-btn-danger" type="submit">Evet, sil</button>
              </form>
            </details>
          </div>:null}
        </article>)}</div>:<section className="ac list-empty"><b>Henüz indirim paketi yok.</b><p>Kupon kodlu ya da sepette otomatik uygulanan bir kampanya oluşturun.</p></section>}
      </section>

      <section className="ac table list-table discount-product-list">
        <div className="ac-head ac-pad-sm list-table-head"><div><h3>Ürün bazlı indirimler</h3><p>{productDiscounts.length} varyant · karşılaştırma fiyatı satış fiyatından yüksek olanlar</p></div><Link prefetch={false} href="/urunler">Ürünleri yönet →</Link></div>
        {productDiscounts.length?<>
          <div className="list-row th"><span className="dl-name">ÜRÜN / VARYANT</span><span className="dl-old">ESKİ FİYAT</span><span className="dl-new">YENİ FİYAT</span><span className="dl-rate">İNDİRİM</span><span className="dl-badge">ROZET</span><span className="dl-edit"/></div>
          {productDiscounts.map(item=>{
            const meta=(item.product?.metadata??{}) as Meta;
            return <div className="list-row" key={item.id}>
              <span className="dl-name"><b>{item.product?.name}</b><small>{item.title||"Default"} · {item.sku}</small></span>
              <span className="dl-old"><s>{money.format((item.compare_at_price??0)/100)}</s></span>
              <span className="dl-new"><b>{money.format(item.price/100)}</b><small>{money.format(item.discountAmount/100)} avantaj</small></span>
              <span className="dl-rate"><em>−%{item.discountRate}</em></span>
              <span className="dl-badge"><em className="ac-tag" data-tone={meta.badge?undefined:"muted"}>{meta.badge||"Otomatik"}</em></span>
              <span className="dl-edit"><Link prefetch={false} href={`/urunler/${item.product_id}`}>Düzenle →</Link></span>
            </div>;
          })}
        </>:<div className="list-empty"><b>Aktif ürün indirimi bulunmuyor.</b><p>Ürün varyantına satış fiyatından yüksek karşılaştırma fiyatı girerek ürün indirimi oluşturabilirsiniz.</p></div>}
      </section>
    </div>
  </>;
}
