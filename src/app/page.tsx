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

  const [ordersResult, openOrderCountResult, productsResult, productCountResult, activeProductCountResult, variantCountResult, stockSumResult, negativeStockResult, lowStockResult] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,status,total,currency,created_at").eq("organization_id", organization.id).gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: false }),
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).in("status", ["pending", "confirmed", "processing"]),
    supabase.from("arc_products").select("id,name,slug,status,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "active"),
    /*
      Varyantların tamamı çekiliyordu; Supabase 1000 satırda
      kestiği için "1000 varyant" yazıyor ve toplam stok eksik
      hesaplanıyordu. Sayım ve toplama veritabanında yapılıyor.
    */
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id", organization.id),
    supabase.rpc("arc_total_stock_units"),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id", organization.id).lt("stock",0),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id", organization.id).gte("stock",0).lte("stock",5),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (openOrderCountResult.error) throw new Error(openOrderCountResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (productCountResult.error) throw new Error(productCountResult.error.message);
  if (activeProductCountResult.error) throw new Error(activeProductCountResult.error.message);
  if (variantCountResult.error) throw new Error(variantCountResult.error.message);

  const orders = ordersResult.data ?? [];
  const products = productsResult.data ?? [];
  const sales = orders.reduce((sum, order) => sum + order.total, 0);
  /* Sayaçlar veritabanından; katalog belleğe alınmıyor. */
  const variantCount = variantCountResult.count ?? 0;
  const stock = typeof stockSumResult.data === "number" ? stockSumResult.data : 0;
  const negativeStockCount = negativeStockResult.count ?? 0;
  const lowStockCount = lowStockResult.count ?? 0;
  const recentOrders = orders.slice(0, 5);
  const chartStart=new Date(now);chartStart.setUTCHours(0,0,0,0);chartStart.setUTCDate(chartStart.getUTCDate()-13);
  const dailySales=Array<number>(14).fill(0);
  for(const order of orders){
    const day=Math.floor((new Date(order.created_at).getTime()-chartStart.getTime())/86_400_000);
    if(day>=0&&day<14)dailySales[day]+=order.total;
  }
  const maxDailySales = Math.max(...dailySales, 1);
  const actionItems = [
    {
      label: "İşlem bekleyen sipariş",
      value: openOrderCountResult.count ?? 0,
      detail: openOrderCountResult.count ? "Onay ve hazırlık akışını tamamlayın" : "Sipariş akışı güncel",
      href: "/operasyon",
      tone: openOrderCountResult.count ? "attention" : "success",
    },
    {
      label: "Kritik stok",
      value: negativeStockCount,
      detail: negativeStockCount ? "Eksi stokları hemen düzeltin" : "Eksi stok bulunmuyor",
      href: "/stok?filter=negative",
      tone: negativeStockCount ? "danger" : "success",
    },
    {
      label: "Azalan stok",
      value: lowStockCount,
      detail: lowStockCount ? "5 ve altındaki varyantları inceleyin" : "Stok seviyeleri sağlıklı",
      href: "/stok?filter=low",
      tone: lowStockCount ? "attention" : "success",
    },
  ];
  const quickActions = [
    { label: "Yeni ürün", detail: "Kataloğa ürün ekle", href: "/urunler", icon: "+" },
    { label: "Yeni sipariş", detail: "Manuel sipariş oluştur", href: "/siparisler", icon: "↗" },
    { label: "Stok işlemi", detail: "Stok seviyesini güncelle", href: "/stok", icon: "⇅" },
    { label: "Müşteriler", detail: "Müşteri kayıtlarını aç", href: "/musteriler", icon: "◎" },
    { label: "Veri aktarımı", detail: "CSV arşivi içe aktar", href: "/veri-aktarimi", icon: "↓" },
  ];
  const metrics = [
    ["Net satış", money.format(sales / 100), "Son 30 gün"],
    ["Sipariş", String(orders.length), "Son 30 gün"],
    ["Ürün", String(productCountResult.count ?? 0), `${activeProductCountResult.count ?? 0} aktif`],
    ["Stok", stock.toLocaleString("tr-TR"), `${variantCount.toLocaleString("tr-TR")} varyant`],
  ];

  /* Son eklenen ürünlerin varyantları yalnızca o beş ürün için
     çekilir; tüm katalog belleğe alınmaz. */
  const recentProductIds=products.map(product=>product.id);
  const {data:recentVariants}=recentProductIds.length
    ?await supabase.from("arc_product_variants").select("product_id,sku,stock,price,currency").eq("organization_id",organization.id).in("product_id",recentProductIds)
    :{data:[]};
  const variantByProduct=new Map((recentVariants??[]).map(variant=>[variant.product_id,variant]));
  return <Shell tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="ac-bar">
      <div>
        <h1>Genel Bakış</h1>
        <p>{organization.name} · son 30 gün</p>
      </div>
      <nav className="ac-bar-actions" aria-label="Hızlı işlemler">
        {quickActions.map((action)=>(
          <Link className="ac-btn" href={action.href} key={action.label}>
            {action.label}
          </Link>
        ))}
      </nav>
    </section>

    <section className="ac-metrics">
      {metrics.map(([label,value,change])=>(
        <article className="ac-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{change}</small>
        </article>
      ))}
    </section>
    {/*
      Aksiyon özeti. İki katmanlı başlık kaldırıldı: "Bugünün
      öncelikleri / Operasyon özeti" aynı şeyi iki kez
      söylüyordu.

      Renk artık anlam taşıyor: sıfır olan sayaç nötr, dikkat
      gerektiren sarı, sorunlu kırmızı.
    */}
    <section className="ac ac-pad" style={{marginTop:"var(--s5)"}}>
      <div className="ac-head">
        <div>
          <h3>Aksiyon bekleyenler</h3>
          <p>Bugün ilgilenilmesi gereken kayıtlar.</p>
        </div>
        <Link href="/operasyon">Operasyon merkezi →</Link>
      </div>

      <div className="ac-metrics">
        {actionItems.map((item)=>(
          <Link
            className="ac-metric ac-lift"
            data-tone={Number(item.value)===0?undefined:item.tone==="danger"?"bad":"warn"}
            href={item.href}
            key={item.label}
            style={{textDecoration:"none"}}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </Link>
        ))}
      </div>
    </section>
    <section className="grid"><article className="card sales"><div className="head"><div><small>SON 30 GÜN</small><h3>{money.format(sales / 100)}</h3></div><span>Gerçek sipariş toplamı</span></div><div className="bars" aria-label="Son 14 günlük satış grafiği">{dailySales.map((value,i)=><i key={i} title={money.format(value / 100)} style={{height:`${Math.max(6, Math.round((value / maxDailySales) * 100))}%`}}/>)}</div><div className="labels"><span>14 gün önce</span><span>Günlük satış</span><span>Bugün</span></div></article><article className="card"><div className="head"><div><small>SON SİPARİŞLER</small><h3>Akış</h3></div><Link href="/siparisler">Tümünü gör →</Link></div>{recentOrders.length ? recentOrders.map(o=><div className="order" key={o.id}><i>{(o.customer_name || "Müşteri").split(" ").map((x: string)=>x[0]).join("").slice(0,2)}</i><div><b>{o.order_number} · {o.customer_name || "Müşteri"}</b><small>{orderStatusLabel(o.status)}</small></div><strong>{money.format(o.total / 100)}</strong></div>) : <p>Henüz sipariş yok.</p>}</article></section>
    <section className="card table"><div className="head"><div><small>KATALOG</small><h3>Son ürünler</h3></div><Link href="/urunler">Ürünleri yönet →</Link></div><div className="row th"><span>ÜRÜN</span><span>SKU</span><span>STOK</span><span>FİYAT</span><span>DURUM</span></div>{products.length ? products.map((p,i)=>{const variant=variantByProduct.get(p.id);return <div className="row" key={p.id}><span><i className={`swatch s${i%5}`}>AC</i><b>{p.name}</b></span><span>{variant?.sku ?? "—"}</span><span>{variant?.stock ?? 0}</span><span>{variant ? money.format(variant.price/100) : "—"}</span><span><em>{productStatusLabel(p.status)}</em></span></div>}) : <p>Henüz ürün yok. İlk ürününü ekleyerek başlayabilirsin.</p>}</section>
  </Shell>;
}
