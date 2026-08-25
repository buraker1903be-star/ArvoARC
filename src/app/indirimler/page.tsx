import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
type Meta={vendor?:string;badge?:string;badge_tone?:string};

export default async function DiscountsPage(){
  const {supabase,organization}=await requireTenant();
  const [{data:products,error:productError},{data:variants,error:variantError}]=await Promise.all([
    supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id",organization.id),
    supabase.from("arc_product_variants").select("id,product_id,title,sku,price,compare_at_price,currency,stock").eq("organization_id",organization.id).order("updated_at",{ascending:false})
  ]);
  if(productError)throw new Error(productError.message);
  if(variantError)throw new Error(variantError.message);

  const productById=new Map((products??[]).map(product=>[product.id,product]));
  const discounted=(variants??[]).filter(variant=>(variant.compare_at_price??0)>variant.price).map(variant=>{
    const product=productById.get(variant.product_id);
    const compare=variant.compare_at_price??variant.price;
    return {...variant,product,discountAmount:compare-variant.price,discountRate:Math.round((1-variant.price/compare)*100)};
  }).filter(item=>item.product);

  const discountedProducts=new Set(discounted.map(item=>item.product_id)).size;
  const averageRate=discounted.length?Math.round(discounted.reduce((sum,item)=>sum+item.discountRate,0)/discounted.length):0;
  const totalAdvantage=discounted.reduce((sum,item)=>sum+item.discountAmount,0);

  return <Shell active="discounts" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>FİYATLANDIRMA · OTOMATİK</small><h2>İndirimler</h2><p>Karşılaştırma fiyatı satış fiyatından yüksek olan varyantlar otomatik olarak indirime girer. İndirim oranı, avantaj tutarı ve mağaza rozeti sistem tarafından hesaplanır.</p></div></section>

    <section className="discount-metrics">
      <article><span>İNDİRİMLİ ÜRÜN</span><strong>{discountedProducts}</strong><small>Katalogda aktif</small></article>
      <article><span>İNDİRİMLİ VARYANT</span><strong>{discounted.length}</strong><small>Fiyat bazında</small></article>
      <article><span>ORTALAMA İNDİRİM</span><strong>%{averageRate}</strong><small>Otomatik hesaplama</small></article>
      <article><span>TOPLAM FİYAT AVANTAJI</span><strong>{money.format(totalAdvantage/100)}</strong><small>Varyant toplamı</small></article>
    </section>

    <section className="card discount-guide">
      <div><small>NASIL ÇALIŞIR?</small><h3>Tek fiyat alanıyla kontrollü kampanya</h3><p>Ürün detayında satış fiyatını ve daha yüksek bir karşılaştırma fiyatını girin. Sistem yüzde rozetini otomatik oluşturur. Karşılaştırma fiyatını boşalttığınızda indirim sona erer.</p></div>
      <Link href="/urunler">Ürünleri yönet →</Link>
    </section>

    <section className="discount-list">
      <div className="product-catalog-head"><div><small>AKTİF İNDİRİMLER</small><h3>{discounted.length} varyant</h3></div><span>En yüksek indirim önce</span></div>
      {discounted.length?<div className="discount-table">
        <div className="discount-row discount-row-head"><span>ÜRÜN / VARYANT</span><span>ESKİ FİYAT</span><span>YENİ FİYAT</span><span>İNDİRİM</span><span>ROZET</span><span></span></div>
        {discounted.sort((a,b)=>b.discountRate-a.discountRate).map(item=>{
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
      </div>:<div className="card product-empty"><strong>Aktif indirim bulunmuyor.</strong><p>Bir ürün varyantına satış fiyatından yüksek karşılaştırma fiyatı ekleyerek ilk indirimi oluşturabilirsiniz.</p><Link href="/urunler">Ürünlere git →</Link></div>}
    </section>
  </Shell>;
}
