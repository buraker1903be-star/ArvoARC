import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";

type ProductMeta={image_paths?:string[];images?:string[];images_migrated?:boolean};
const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});

export default async function Operations(){
  const {supabase,organization}=await requireTenant();
  const [{data:orders,error:ordersError},{data:variants,error:variantsError},{data:products,error:productsError},{data:settings,error:settingsError}]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,status,payment_status,customer_name,total,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).order("stock",{ascending:true}),
    supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id),
    supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle()
  ]);
  if(ordersError)throw new Error(ordersError.message);if(variantsError)throw new Error(variantsError.message);if(productsError)throw new Error(productsError.message);if(settingsError)throw new Error(settingsError.message);
  const threshold=settings?.low_stock_threshold??5;const productMap=new Map((products??[]).map(product=>[product.id,product]));
  const openOrders=(orders??[]).filter(order=>["pending","confirmed","processing"].includes(order.status));
  const paymentPending=(orders??[]).filter(order=>["pending","authorized","failed"].includes(order.payment_status)&&!["cancelled","refunded"].includes(order.status));
  const criticalStock=(variants??[]).filter(variant=>variant.stock<0||(variant.stock===0&&!variant.allow_backorder));
  const lowStock=(variants??[]).filter(variant=>variant.stock>0&&variant.stock<=threshold);
  const missingImages=(products??[]).filter(product=>{const meta=(product.metadata??{}) as ProductMeta;return product.status==="active"&&!(meta.image_paths?.length)&&!(meta.images?.length);});
  const totalActions=openOrders.length+paymentPending.length+criticalStock.length+lowStock.length+missingImages.length;

  return <Shell active="operations" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · AKSİYON MERKEZİ</small><h2>Operasyon Merkezi</h2><p>Sipariş, ödeme, stok ve katalog için aksiyon gerektiren kayıtların tek görünümü.</p></div></section>
    <section className="metrics"><article><span>TOPLAM AKSİYON</span><strong>{totalActions}</strong><small>Kontrol bekleyen</small></article><article><span>AÇIK SİPARİŞ</span><strong>{openOrders.length}</strong><small>Bekliyor veya hazırlanıyor</small></article><article><span>STOK UYARISI</span><strong>{criticalStock.length+lowStock.length}</strong><small>Kritik ve düşük stok</small></article><article><span>GÖRSEL EKSİĞİ</span><strong>{missingImages.length}</strong><small>Aktif ürün</small></article></section>

    <section className="grid">
      <article className="card"><div className="head"><div><small>SİPARİŞ</small><h3>Açık siparişler</h3></div><Link href="/siparisler?filter=processing">Tüm siparişler →</Link></div>{openOrders.slice(0,8).map(order=><Link className="order" href={`/siparisler/${order.id}`} key={order.id}><i>▧</i><div><b>{order.order_number} · {order.customer_name||"Müşteri"}</b><small>{order.status} · {new Date(order.created_at).toLocaleDateString("tr-TR")}</small></div><strong>{money.format(order.total/100)}</strong></Link>)}{!openOrders.length&&<p>Açık sipariş bulunmuyor.</p>}</article>
      <article className="card"><div className="head"><div><small>ÖDEME</small><h3>Ödeme kontrolü</h3></div><Link href="/siparisler">Siparişlere git →</Link></div>{paymentPending.slice(0,8).map(order=><Link className="order" href={`/siparisler/${order.id}`} key={order.id}><i>₺</i><div><b>{order.order_number}</b><small>{order.payment_status}</small></div><strong>{money.format(order.total/100)}</strong></Link>)}{!paymentPending.length&&<p>Ödeme bekleyen sipariş bulunmuyor.</p>}</article>
    </section>

    <section className="grid" style={{marginTop:20}}>
      <article className="card"><div className="head"><div><small>STOK</small><h3>Kritik stoklar</h3></div><Link href="/stok?filter=negative">Stok yönetimi →</Link></div>{[...criticalStock,...lowStock].slice(0,10).map(variant=><div className="order" key={variant.id}><i>!</i><div><b>{productMap.get(variant.product_id)?.name??"Ürün"}</b><small>{variant.sku} · {variant.allow_backorder?"Stoksuz satış açık":"Stok zorunlu"}</small></div><strong>{variant.stock}</strong></div>)}{!criticalStock.length&&!lowStock.length&&<p>Stok uyarısı bulunmuyor.</p>}</article>
      <article className="card"><div className="head"><div><small>KATALOG</small><h3>Görseli eksik ürünler</h3></div><Link href="/urunler">Ürünlere git →</Link></div>{missingImages.slice(0,10).map(product=><Link className="order" href={`/urunler/${product.id}`} key={product.id}><i>◇</i><div><b>{product.name}</b><small>{product.source==="shopify"?"Shopify aktarımı":"ARC Native"}</small></div><strong>Görsel ekle</strong></Link>)}{!missingImages.length&&<p>Aktif ürünlerde görsel eksiği bulunmuyor.</p>}</article>
    </section>
  </Shell>;
}
