import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export default async function Dashboard() {
  const { supabase, organization } = await requireTenant();

  const [ordersResult, productsResult, variantsResult] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,status,total,currency,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_products").select("id,name,slug,status,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,price,currency").eq("organization_id", organization.id),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);

  const orders = ordersResult.data ?? [];
  const products = productsResult.data ?? [];
  const variants = variantsResult.data ?? [];
  const sales = orders.reduce((sum, order) => sum + order.total, 0);
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  const metrics = [
    ["Net satış", money.format(sales / 100), `${orders.length} son sipariş`],
    ["Sipariş", String(orders.length), "Canlı veri"],
    ["Ürün", String(products.length), `${products.filter((p) => p.status === "active").length} aktif`],
    ["Stok", String(stock), `${variants.length} varyant`],
  ];

  return <Shell tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="intro"><div><p>ARVO ARC · CANLI</p><h2>Mağaza operasyonun <em>tek merkezde.</em></h2><span>{organization.name} için Supabase commerce verileri.</span></div><select defaultValue="30" aria-label="Rapor dönemi"><option value="30">Son 30 gün</option><option value="7">Son 7 gün</option></select></section>
    <section className="metrics">{metrics.map(([label,value,change])=><article key={label}><span>{label}</span><strong>{value}</strong><small>{change}</small></article>)}</section>
    <section className="grid"><article className="card sales"><div className="head"><div><small>COMMERCE CORE</small><h3>{money.format(sales / 100)}</h3></div><span>Son sipariş toplamı</span></div><div className="bars">{[31,46,38,61,44,68,54,79,65,88,70,82,76,96].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div><div className="labels"><span>ARC</span><span>Supabase</span><span>Live</span></div></article><article className="card"><div className="head"><div><small>SON SİPARİŞLER</small><h3>Akış</h3></div><a href="/siparisler">Tümünü gör →</a></div>{orders.length ? orders.map(o=><div className="order" key={o.id}><i>{(o.customer_name || "Müşteri").split(" ").map((x: string)=>x[0]).join("").slice(0,2)}</i><div><b>{o.order_number} · {o.customer_name || "Müşteri"}</b><small>{o.status}</small></div><strong>{money.format(o.total / 100)}</strong></div>) : <p>Henüz sipariş yok.</p>}</article></section>
    <section className="card table"><div className="head"><div><small>KATALOG</small><h3>Son ürünler</h3></div><a href="/urunler">Ürünleri yönet →</a></div><div className="row th"><span>ÜRÜN</span><span>SKU</span><span>STOK</span><span>FİYAT</span><span>DURUM</span></div>{products.length ? products.map((p,i)=>{const variant=variants.find(v=>v.product_id===p.id);return <div className="row" key={p.id}><span><i className={`swatch s${i%5}`}>AC</i><b>{p.name}</b></span><span>{variant?.sku ?? "—"}</span><span>{variant?.stock ?? 0}</span><span>{variant ? money.format(variant.price/100) : "—"}</span><span><em>{p.status}</em></span></div>}) : <p>Henüz ürün yok. İlk ürününü ekleyerek başlayabilirsin.</p>}</section>
  </Shell>;
}
