import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { KKart, KListe, KOge } from "@/components/arvo-ui/k-ui";
import { Pencere } from "@/components/os/pencere";
import { createDiscount,deleteDiscount,toggleDiscount } from "./actions";
import "../catalog.css";
// Satır içi silme onayı (confirm-inline) ve form ızgarası (discount-form-grid) hâlâ orada.
import "../modules.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./indirimler.css";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
const dateTime=new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"});
type Meta={vendor?:string;badge?:string;badge_tone?:string};


function ruleValue(rule:{discount_type:string;value:number}){
  if(rule.discount_type==="percentage")return `%${rule.value}`;
  if(rule.discount_type==="fixed_amount")return money.format(rule.value/100);
  return "Ücretsiz";
}
function ruleType(type:string){
  return type==="percentage"?"Sepette yüzde indirim":type==="fixed_amount"?"Sepette tutar indirimi":"Ücretsiz kargo";
}

export default async function DiscountsPage({searchParams}:{searchParams:Promise<{pencere?:string}>}){
  const {pencere:pencereParametresi}=await searchParams;
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

  const pencere=canManage&&pencereParametresi==="yeni";
  const DURUM:Record<string,{etiket:string;ton:string}>={active:{etiket:"Aktif",ton:"success"},paused:{etiket:"Duraklatıldı",ton:"warning"},draft:{etiket:"Taslak",ton:"neutral"}};

  /* ArvoOS kalıbı (16.10.2026): başlık, özet şeridi, iOS listeleri; yeni indirim pencerede. */
  return (
    <main className="talep liste-sayfa indirim-sayfasi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Katalog</small>
          <h1>İndirimler</h1>
          <p className="talep-bas-alt">Ürün indirimi, kupon ve kargo kuralları.</p>
        </div>
        {canManage?<div className="talep-bas-eylem"><Link prefetch={false} scroll={false} className="panel-primary" href="/indirimler?pencere=yeni">+ Yeni indirim paketi</Link></div>:null}
      </header>

      <nav className="kayit-serit talep-serit" aria-label="İndirim özeti">
        <dl>
          <div><dt>Aktif kural</dt><dd>{activeRules.length}</dd><small>sepet ve kargo</small></div>
          <div><dt>Kupon kodu</dt><dd>{activeRules.filter(rule=>rule.code).length}</dd><small>müşteri girer</small></div>
          <div><dt>Otomatik kampanya</dt><dd>{activeRules.filter(rule=>!rule.code).length}</dd><small>koşul sağlanınca</small></div>
          <div><dt>Ürün indirimi</dt><dd>{productDiscounts.length}</dd><small>karşılaştırma fiyatından</small></div>
        </dl>
      </nav>

      <KKart baslik="Sepet ve kargo kuralları" aciklama={`${allRules.length} indirim paketi`}>
        {allRules.length?(
          <KListe>
            {allRules.map(rule=>(
              <KOge
                key={rule.id}
                simge={rule.code||"Otomatik"}
                baslik={rule.name}
                alt={[rule.code?`Kod: ${rule.code}`:"Otomatik",ruleType(rule.discount_type),rule.minimum_subtotal>0?`${money.format(rule.minimum_subtotal/100)} üzeri`:"alt limitsiz",rule.usage_limit?`${rule.usage_count}/${rule.usage_limit} kullanım`:`${rule.usage_count??0} kullanım`,rule.ends_at?`${dateTime.format(new Date(rule.ends_at))} biter`:null].filter(Boolean).join(" · ")}
                durum={DURUM[rule.status]??{etiket:rule.status,ton:"neutral"}}
                deger={ruleValue(rule)}
                degerAlt={rule.combinable?"birleşebilir":"tek başına"}
                sonu={canManage?(
                  <span className="indirim-eylem">
                    <form action={toggleDiscount}><input type="hidden" name="id" value={rule.id}/><input type="hidden" name="next_status" value={rule.status==="active"?"paused":"active"}/><button className="panel-secondary" type="submit">{rule.status==="active"?"Duraklat":"Etkinleştir"}</button></form>
                    {/* Silme geri alınamaz: tek tıkla değil, satır içi onayla. */}
                    <details className="confirm-inline">
                      <summary className="panel-danger">Sil</summary>
                      <form action={deleteDiscount} className="confirm-inline-body">
                        <input type="hidden" name="id" value={rule.id}/>
                        <span>“{rule.name}” kalıcı olarak silinsin mi?</span>
                        <button className="panel-danger" type="submit">Evet, sil</button>
                      </form>
                    </details>
                  </span>
                ):undefined}
              />
            ))}
          </KListe>
        ):(
          <div className="crm-empty-state talep-bos-kutu">
            <h2>Henüz indirim paketi yok</h2>
            <p>Kupon kodlu ya da sepette kendiliğinden uygulanan bir kampanya oluşturabilirsiniz.</p>
            {canManage?<div className="crm-empty-actions"><Link prefetch={false} className="panel-primary" href="/indirimler?pencere=yeni">İlk indirimi oluştur</Link></div>:null}
          </div>
        )}
      </KKart>

      <KKart baslik="Ürün bazlı indirimler" aciklama={`${productDiscounts.length} varyant · karşılaştırma fiyatı satış fiyatından yüksek olanlar`} sag={<Link prefetch={false} className="panel-secondary" href="/urunler">Ürünler</Link>}>
        {productDiscounts.length?(
          <KListe>
            {productDiscounts.map(item=>{
              const meta=(item.product?.metadata??{}) as Meta;
              return (
                <KOge
                  key={item.id}
                  href={`/urunler/${item.product_id}`}
                  baslik={item.product?.name??"Ürün"}
                  alt={`${item.title||"Tek varyant"} · ${item.sku}`}
                  durum={{etiket:meta.badge||"Otomatik",ton:meta.badge?"success":"neutral"}}
                  deger={money.format(item.price/100)}
                  degerAlt={<><s>{money.format((item.compare_at_price??0)/100)}</s> · −%{item.discountRate}</>}
                />
              );
            })}
          </KListe>
        ):(
          <div className="crm-empty-state talep-bos-kutu">
            <h2>Aktif ürün indirimi yok</h2>
            <p>Bir varyanta satış fiyatından yüksek karşılaştırma fiyatı girdiğinizde vitrinde üstü çizili fiyat ve indirim rozeti görünür.</p>
            <div className="crm-empty-actions"><Link prefetch={false} className="panel-secondary" href="/urunler">Ürünlere git</Link></div>
          </div>
        )}
      </KKart>

      {pencere?(
        <Pencere key="yeni" ust="Katalog" baslik="Yeni indirim paketi" kapatAdresi="/indirimler">
          <p className="indirim-pencere-alt">Kupon kodunu boş bırakırsanız kural sepette otomatik uygulanır.</p>
          <form action={createDiscount}>
            <div className="discount-form-grid">
              <label className="wide">Kampanya adı<input name="name" required maxLength={160} placeholder="Örn. 2.000 TL Üzeri Ücretsiz Kargo"/></label>
              <label>İndirim türü<select name="discount_type" defaultValue="percentage"><option value="percentage">Sepette yüzde indirim</option><option value="fixed_amount">Sepette sabit tutar indirimi</option><option value="free_shipping">Ücretsiz kargo</option></select></label>
              <label>İndirim değeri<input name="value" type="text" inputMode="decimal" autoComplete="off" defaultValue="10"/><small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small></label>
              <label>Minimum sepet tutarı (₺)<input name="minimum_subtotal" type="text" inputMode="decimal" autoComplete="off" defaultValue="0"/></label>
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
        </Pencere>
      ):null}
    </main>
  );
}
