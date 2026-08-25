import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import Link from "next/link";
import { orderStatusLabel, productStatusLabel } from "@/lib/commerce-labels";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export default async function Dashboard() {
  const { supabase, organization } = await requireTenant();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [ordersResult, productsResult, productCountResult, activeProductCountResult, variantsResult] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,status,total,currency,created_at").eq("organization_id", organization.id).gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: false }),
    supabase.from("arc_products").select("id,name,slug,status,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "active"),
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,price,currency").eq("organization_id", organization.id),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (productCountResult.error) throw new Error(productCountResult.error.message);
  if (activeProductCountResult.error) throw new Error(activeProductCountResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);

  const orders = ordersResult.data ?? [];
  const products = productsResult.data ?? [];
  const variants = variantsResult.data ?? [];
  const sales = orders.reduce((sum, order) => sum + order.total, 0);
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  const recentOrders = orders.slice(0, 5);
  const dailySales = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (13 - index));
    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return orders
      .filter((order) => {
        const createdAt = new Date(order.created_at);
        return createdAt >= day && createdAt < nextDay;
      })
      .reduce((sum, order) => sum + order.total, 0);
  });
  const maxDailySales = Math.max(...dailySales, 1);
  const openOrders = orders.filter((order) => ["pending", "confirmed", "processing"].includes(order.status));
  const negativeStock = variants.filter((variant) => variant.stock < 0);
  const lowStock = variants.filter((variant) => variant.stock >= 0 && variant.stock <= 5);
  const actionItems = [
    {
      label: "İşlem bekleyen sipariş",
      value: openOrders.length,
      detail: openOrders.length ? "Onay ve hazırlık akışını tamamlayın" : "Sipariş akışı güncel",
      href: "/operasyon",
      tone: openOrders.length ? "attention" : "success",
    },
    {
      label: "Kritik stok",
      value: negativeStock.length,
      detail: negativeStock.length ? "Eksi stokları hemen düzeltin" : "Eksi stok bulunmuyor",
      href: "/stok?filter=negative",
      tone: negativeStock.length ? "danger" : "success",
    },
    {
      label: "Azalan stok",
      value: lowStock.length,
      detail: lowStock.length ? "5 ve altındaki varyantları inceleyin" : "Stok seviyeleri sağlıklı",
      href: "/stok?filter=low",
      tone: lowStock.length ? "attention" : "success",
    },
  ];
  const metrics = [
    ["Net satış", money.format(sales / 100), "Son 30 gün"],
    ["Sipariş", String(orders.length), "Son 30 gün"],
    ["Ürün", String(productCountResult.count ?? 0), `${activeProductCountResult.count ?? 0} aktif`],
    ["Stok", String(stock), `${variants.length} varyant`],
  ];

  return <Shell tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="intro"><div><p>ARVO ARC · CANLI</p><h2>Mağaza operasyonun <em>tek merkezde.</em></h2><span>{organization.name} için Supabase commerce verileri.</span></div><span>Son 30 gün</span></section>
    <section className="metrics">{metrics.map(([label,value,change])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{change}</small></article>)}</section>
    <section className="action-center" aria-labelledby="action-center-title">
      <div className="action-center-head"><div><small>BUGÜNÜN ÖNCELİKLERİ</small><h3 id="action-center-title">Operasyon özeti</h3></div><Link href="/operasyon">Operasyon merkezini aç →</Link></div>
      <div className="action-center-grid">{actionItems.map((item)=><Link href={item.href} className={`action-item ${item.tone}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small><b>İncele →</b></Link>)}</div>
    </section>
    <section className="grid"><article className="card sales"><div className="head"><div><small>SON 30 GÜN</small><h3>{money.format(sales / 100)}</h3></div><span>Gerçek sipariş toplamı</span></div><div className="bars" aria-label="Son 14 günlük satış grafiği">{dailySales.map((value,i)=><i key={i} title={money.format(value / 100)} style={{height:`${Math.max(6, Math.round((value / maxDailySales) * 100))}%`}}/>)}</div><div className="labels"><span>14 gün önce</span><span>Günlük satış</span><span>Bugün</span></div></article><article className="card"><div className="head"><div><small>SON SİPARİŞLER</small><h3>Akış</h3></div><Link href="/siparisler">Tümünü gör →</Link></div>{recentOrders.length ? recentOrders.map(o=><div className="order" key={o.id}><i>{(o.customer_name || "Müşteri").split(" ").map((x: string)=>x[0]).join("").slice(0,2)}</i><div><b>{o.order_number} · {o.customer_name || "Müşteri"}</b><small>{orderStatusLabel(o.status)}</small></div><strong>{money.format(o.total / 100)}</strong></div>) : <p>Henüz sipariş yok.</p>}</article></section>
    <section className="card table"><div className="head"><div><small>KATALOG</small><h3>Son ürünler</h3></div><Link href="/urunler">Ürünleri yönet →</Link></div><div className="row th"><span>ÜRÜN</span><span>SKU</span><span>STOK</span><span>FİYAT</span><span>DURUM</span></div>{products.length ? products.map((p,i)=>{const variant=variants.find(v=>v.product_id===p.id);return <div className="row" key={p.id}><span><i className={`swatch s${i%5}`}>AC</i><b>{p.name}</b></span><span>{variant?.sku ?? "—"}</span><span>{variant?.stock ?? 0}</span><span>{variant ? money.format(variant.price/100) : "—"}</span><span><em>{productStatusLabel(p.status)}</em></span></div>}) : <p>Henüz ürün yok. İlk ürününü ekleyerek başlayabilirsin.</p>}</section>
  </Shell>;
}
