import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/commerce-labels";

type ProductMeta={image_paths?:string[];images?:string[];images_migrated?:boolean};
const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});

export default async function Operations(){
  const {supabase,organization}=await requireTenant();
  /*
    Sorgular sınırlandırıldı ve filtreler veritabanına taşındı.

    Öncesinde tüm siparişler, tüm varyantlar (15.000+) ve tüm
    ürünler (3.000+) çekilip bellekte süzülüyordu. İki sorun
    vardı: sayfa çok yavaştı ve Supabase varsayılan olarak en
    fazla 1000 satır döndürdüğü için sayılar SESSİZCE yanlıştı —
    stok uyarısı 15.000 varyantın yalnızca ilk 1000'ine
    bakıyordu.

    Artık her liste kendi filtresiyle ve sınırıyla çekiliyor;
    toplamlar ayrı sayım sorgularından geliyor.
  */
  const {data:settings}=await supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle();
  const threshold=settings?.low_stock_threshold??5;

  const OPEN=["pending","confirmed","processing"];
  const PAYMENT=["pending","authorized","failed"];

  const [
    {data:openOrders,error:ordersError},
    {count:openCount},
    {data:paymentPending,error:paymentError},
    {count:paymentCount},
    {data:criticalStock,error:criticalError},
    {count:criticalCount},
    {data:lowStock,error:lowError},
    {count:lowCount},
  ]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,status,payment_status,customer_name,total,created_at").eq("organization_id",organization.id).in("status",OPEN).order("created_at",{ascending:false}).limit(8),
    supabase.from("arc_orders").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).in("status",OPEN),
    supabase.from("arc_orders").select("id,order_number,status,payment_status,customer_name,total,created_at").eq("organization_id",organization.id).in("payment_status",PAYMENT).not("status","in","(cancelled,refunded)").order("created_at",{ascending:false}).limit(8),
    supabase.from("arc_orders").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).in("payment_status",PAYMENT).not("status","in","(cancelled,refunded)"),
    // Kritik: stok sıfır ya da eksi ve stoksuz satış kapalı.
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).lte("stock",0).eq("allow_backorder",false).order("stock",{ascending:true}).limit(10),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).lte("stock",0).eq("allow_backorder",false),
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).gt("stock",0).lte("stock",threshold).order("stock",{ascending:true}).limit(10),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).gt("stock",0).lte("stock",threshold),
  ]);

  if(ordersError||paymentError||criticalError||lowError)throw new Error((ordersError??paymentError??criticalError??lowError)?.message??"Operasyon verisi okunamadı.");

  /* Yalnızca gösterilen varyantların ürün adları çekilir. */
  const stockVariants=[...(criticalStock??[]),...(lowStock??[])];
  const stockProductIds=[...new Set(stockVariants.map(v=>v.product_id))];
  const {data:stockProducts}=stockProductIds.length
    ?await supabase.from("arc_products").select("id,name").in("id",stockProductIds)
    :{data:[]};

  /*
    Görseli eksik ürünler. Metadata içinde arama yapılamadığı
    için son 200 aktif ürüne bakılıyor: tüm katalogu çekmek
    3.264 satır demek ve zaten 1000'de kesiliyordu.
  */
  const {data:recentActive}=await supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).eq("status","active").order("updated_at",{ascending:false}).limit(200);
  const productMap=new Map((stockProducts??[]).map(product=>[product.id,product]));
  const missingImages=(recentActive??[]).filter(product=>{const meta=(product.metadata??{}) as ProductMeta;return !(meta.image_paths?.length)&&!(meta.images?.length);});

  /* Sayaçlar veritabanından; listeler yalnızca ilk birkaç kayıt. */
  const totalActions=(openCount??0)+(paymentCount??0)+(criticalCount??0)+(lowCount??0)+missingImages.length;

  return <Shell active="operations" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="ac-bar">
      <div>
        <h1>Operasyon Merkezi</h1>
        <p>Aksiyon gerektiren kayıtların tek görünümü.</p>
      </div>
    </section>

    <div className="ac-stack">
    {/* Renk anlamlı: sıfır olan sayaç nötr, dolu olan dikkat. */}
    <section className="ac-metrics">
      <article className="ac-metric" data-tone={totalActions>0?"warn":undefined}>
        <span>TOPLAM AKSİYON</span><strong>{totalActions}</strong><small>Kontrol bekleyen</small>
      </article>
      <article className="ac-metric" data-tone={(openCount??0)>0?"warn":undefined}>
        <span>AÇIK SİPARİŞ</span><strong>{openCount??0}</strong><small>Bekliyor veya hazırlanıyor</small>
      </article>
      <article className="ac-metric" data-tone={(criticalCount??0)>0?"bad":(lowCount??0)>0?"warn":undefined}>
        <span>STOK UYARISI</span><strong>{(criticalCount??0)+(lowCount??0)}</strong><small>Kritik ve düşük stok</small>
      </article>
      <article className="ac-metric" data-tone={missingImages.length>0?"warn":undefined}>
        <span>GÖRSEL EKSİĞİ</span><strong>{missingImages.length}</strong><small>Aktif ürün</small>
      </article>
    </section>

    <section className="ac-split-even">
      <article className="ac ac-pad"><div className="ac-head"><div><h3>Açık siparişler</h3><p>Hazırlanmayı bekleyenler.</p></div><Link href="/siparisler?filter=processing">Tüm siparişler →</Link></div>{(openOrders??[]).slice(0,8).map(order=><Link prefetch={false} className="order" href={`/siparisler/${order.id}`} key={order.id}><i>▧</i><div><b>{order.order_number} · {order.customer_name||"Müşteri"}</b><small>{orderStatusLabel(order.status)} · {new Date(order.created_at).toLocaleDateString("tr-TR")}</small></div><strong>{money.format(order.total/100)}</strong></Link>)}{!(openOrders??[]).length&&<p>Açık sipariş bulunmuyor.</p>}</article>
      <article className="ac ac-pad"><div className="ac-head"><div><h3>Ödeme kontrolü</h3><p>Ödemesi tamamlanmamış siparişler.</p></div><Link href="/siparisler">Siparişlere git →</Link></div>{(paymentPending??[]).slice(0,8).map(order=><Link prefetch={false} className="order" href={`/siparisler/${order.id}`} key={order.id}><i>₺</i><div><b>{order.order_number}</b><small>{paymentStatusLabel(order.payment_status)}</small></div><strong>{money.format(order.total/100)}</strong></Link>)}{!(paymentPending??[]).length&&<p>Ödeme bekleyen sipariş bulunmuyor.</p>}</article>
    </section>

    <section className="ac-split-even">
      <article className="ac ac-pad"><div className="ac-head"><div><h3>Kritik stoklar</h3><p>Tükenen ve azalan varyantlar.</p></div><Link href="/stok?filter=negative">Stok yönetimi →</Link></div>{stockVariants.slice(0,10).map(variant=><div className="order" key={variant.id}><i>!</i><div><b>{productMap.get(variant.product_id)?.name??"Ürün"}</b><small>{variant.sku} · {variant.allow_backorder?"Stoksuz satış açık":"Stok zorunlu"}</small></div><strong>{variant.stock}</strong></div>)}{!stockVariants.length&&<p>Stok uyarısı bulunmuyor.</p>}</article>
      <article className="ac ac-pad"><div className="ac-head"><div><h3>Görseli eksik ürünler</h3><p>Aktif ama görselsiz.</p></div><Link href="/urunler">Ürünlere git →</Link></div>{missingImages.slice(0,10).map(product=><Link className="order" href={`/urunler/${product.id}`} key={product.id}><i>◇</i><div><b>{product.name}</b><small>{product.source==="shopify"?"Shopify aktarımı":"ARC Native"}</small></div><strong>Görsel ekle</strong></Link>)}{!missingImages.length&&<p>Aktif ürünlerde görsel eksiği bulunmuyor.</p>}</article>
    </section>
    </div>
  </Shell>;
}
