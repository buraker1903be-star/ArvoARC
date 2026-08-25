import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createDiscount,deleteDiscount,toggleDiscount } from "./actions";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
const dateTime=new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"});
type Meta={vendor?:string;badge?:string;badge_tone?:string};

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
    supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id",organization.id),
    supabase.from("arc_product_variants").select("id,product_id,title,sku,price,compare_at_price,currency,stock").eq("organization_id",organization.id).order("updated_at",{ascending:false}),
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
  }).filter(item=>item.product);
  const activeRules=(rules??[]).filter(rule=>rule.status==="active");
  const couponCount=activeRules.filter(rule=>rule.code).length;
  const automaticCount=activeRules.filter(rule=>!rule.code).length;

  return <Shell active="discounts" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>KAMPANYA MOTORU · CANLI</small><h2>İndirimler</h2><p>Ürün indirimi, kupon kodu, sepet tutarı kampanyası ve ücretsiz kargo kurallarını tek merkezden yönetin.</p></div></section>

    {(params.created||params.saved||params.deleted)&&<section className="card discount-flash"><strong>{params.created?"İndirim paketi oluşturuldu.":params.deleted?"İndirim paketi silindi.":"İndirim durumu güncellendi."}</strong></section>}
    {params.error&&<section className="card discount-flash error"><strong>İşlem tamamlanamadı: {params.error}</strong></section>}

    <section className="discount-metrics">
      <article><span>AKTİF KURAL</span><strong>{activeRules.length}</strong><small>Sepet ve kargo</small></article>
      <article><span>KUPON KODU</span><strong>{couponCount}</strong><small>Müşteri tarafından girilir</small></article>
      <article><span>OTOMATİK KAMPANYA</span><strong>{automaticCount}</strong><small>Koşul sağlanınca uygulanır</small></article>
      <article><span>ÜRÜN İNDİRİMİ</span><strong>{productDiscounts.length}</strong><small>Karşılaştırma fiyatından</small></article>
    </section>

    {canManage&&<details className="card discount-builder">
      <summary>+ Yeni indirim paketi oluştur</summary>
      <form action={createDiscount}>
        <div className="discount-builder-head"><div><small>KURAL OLUŞTURUCU</small><h3>Kampanya koşullarını belirleyin</h3></div><span>Kupon kodunu boş bırakırsanız kural otomatik uygulanır.</span></div>
        <div className="discount-form-grid">
          <label className="wide">Kampanya adı<input name="name" required maxLength={160} placeholder="Örn. 2.000 TL Üzeri Ücretsiz Kargo"/></label>
          <label>İndirim türü<select name="discount_type" defaultValue="percentage"><option value="percentage">Sepette yüzde indirim</option><option value="fixed_amount">Sepette sabit tutar indirimi</option><option value="free_shipping">Ücretsiz kargo</option></select></label>
          <label>İndirim değeri<input name="value" type="number" min="0" step="0.01" defaultValue="10"/><small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small></label>
          <label>Minimum sepet tutarı (₺)<input name="minimum_subtotal" type="number" min="0" step="0.01" defaultValue="0"/></label>
          <label>Kupon kodu<input name="code" maxLength={40} placeholder="Örn. ARVO10"/></label>
          <label>Toplam kullanım limiti<input name="usage_limit" type="number" min="1" step="1" placeholder="Limitsiz"/></label>
          <label>Kişi başı kullanım<input name="per_customer_limit" type="number" min="1" step="1" placeholder="Limitsiz"/></label>
          <label>Başlangıç<input name="starts_at" type="datetime-local"/></label>
          <label>Bitiş<input name="ends_at" type="datetime-local"/></label>
          <label className="check"><input name="active" type="checkbox" defaultChecked/> Hemen aktif et</label>
          <label className="check"><input name="combinable" type="checkbox"/> Diğer indirimlerle birleştirilebilir</label>
        </div>
        <div className="product-editor-actions"><span>Kural sepet hesaplama motorunda güvenli şekilde saklanır.</span><button type="submit">İndirim paketini oluştur</button></div>
      </form>
    </details>}

    <section className="discount-packages">
      <div className="product-catalog-head"><div><small>SEPET VE KARGO KURALLARI</small><h3>{rules?.length??0} indirim paketi</h3></div><span>Kuponlu ve otomatik kampanyalar</span></div>
      <div className="discount-package-grid">{(rules??[]).map(rule=><article className={`discount-package ${rule.status}`} key={rule.id}>
        <div className="discount-package-top"><span>{rule.code?<b>{rule.code}</b>:<b>OTOMATİK</b>}<small>{ruleType(rule.discount_type)}</small></span><em>{rule.status==="active"?"Aktif":rule.status==="paused"?"Duraklatıldı":"Taslak"}</em></div>
        <div className="discount-package-value"><strong>{ruleValue(rule)}</strong><span>{rule.minimum_subtotal>0?`${money.format(rule.minimum_subtotal/100)} üzeri`:"Alt limitsiz"}</span></div>
        <h3>{rule.name}</h3>
        <ul>
          <li>{rule.combinable?"Diğer indirimlerle birleşebilir":"Tek başına uygulanır"}</li>
          <li>{rule.usage_limit?`${rule.usage_count}/${rule.usage_limit} kullanım`:"Toplam kullanım limitsiz"}</li>
          <li>{rule.per_customer_limit?`Müşteri başına ${rule.per_customer_limit} kez`:"Müşteri limiti yok"}</li>
          <li>{rule.ends_at?`${dateTime.format(new Date(rule.ends_at))} tarihinde biter`:"Süresiz kampanya"}</li>
        </ul>
        {canManage&&<div className="discount-package-actions">
          <form action={toggleDiscount}><input type="hidden" name="id" value={rule.id}/><input type="hidden" name="next_status" value={rule.status==="active"?"paused":"active"}/><button type="submit">{rule.status==="active"?"Duraklat":"Aktif et"}</button></form>
          <form action={deleteDiscount}><input type="hidden" name="id" value={rule.id}/><button className="danger-button" type="submit">Sil</button></form>
        </div>}
      </article>)}</div>
    </section>

    <section className="discount-list">
      <div className="product-catalog-head"><div><small>ÜRÜN BAZLI İNDİRİMLER</small><h3>{productDiscounts.length} varyant</h3></div><Link href="/urunler">Ürünleri yönet →</Link></div>
      {productDiscounts.length?<div className="discount-table">
        <div className="discount-row discount-row-head"><span>ÜRÜN / VARYANT</span><span>ESKİ FİYAT</span><span>YENİ FİYAT</span><span>İNDİRİM</span><span>ROZET</span><span></span></div>
        {productDiscounts.sort((a,b)=>b.discountRate-a.discountRate).map(item=>{
          const meta=(item.product?.metadata??{}) as Meta;
          return <div className="discount-row" key={item.id}>
            <span><b>{item.product?.name}</b><small>{item.title||"Default"} · {item.sku}</small></span>
            <span><s>{money.format((item.compare_at_price??0)/100)}</s></span>
            <span><strong>{money.format(item.price/100)}</strong><small>{money.format(item.discountAmount/100)} avantaj</small></span>
            <span><em>-%{item.discountRate}</em></span>
            <span>{meta.badge?<i className={meta.badge_tone??"green"}>{meta.badge}</i>:<i>Otomatik</i>}</span>
            <span><Link href={`/urunler/${item.product_id}`}>Düzenle →</Link></span>
          </div>;
        })}
      </div>:<div className="card product-empty"><strong>Aktif ürün indirimi bulunmuyor.</strong><p>Ürün varyantına satış fiyatından yüksek karşılaştırma fiyatı girerek ürün indirimi oluşturabilirsiniz.</p></div>}
    </section>
  </Shell>;
}
