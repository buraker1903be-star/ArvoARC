import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderBadge, productStatusLabel } from "@/lib/commerce-labels";
import { Icon, type IconName } from "@/components/panel/icons";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
const longDate = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR") || "M";
}

type Tone = "gold" | "info" | "brand" | "success" | "warning" | "danger" | "muted";

export default async function Dashboard() {
  const { supabase, organization } = await requireTenant();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [ordersResult, openOrderCountResult, productsResult, productCountResult, activeProductCountResult, variantCountResult, stockSumResult, negativeStockResult, lowStockResult] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,status,payment_status,total,currency,created_at").eq("organization_id", organization.id).gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: false }),
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).in("status", ["pending", "confirmed", "processing"]),
    supabase.from("arc_products").select("id,name,slug,status,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "active"),
    /*
      Varyantların tamamı çekiliyordu; Supabase 1000 satırda
      kestiği için "1000 varyant" yazıyor ve toplam stok eksik
      hesaplanıyordu. Sayım ve toplama veritabanında yapılıyor.
    */
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.rpc("arc_total_stock_units"),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).lt("stock", 0),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).gte("stock", 0).lte("stock", 5),
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
  const openOrderCount = openOrderCountResult.count ?? 0;
  const recentOrders = orders.slice(0, 6);

  const chartStart = new Date(now);
  chartStart.setUTCHours(0, 0, 0, 0);
  chartStart.setUTCDate(chartStart.getUTCDate() - 13);
  const dailySales = Array<number>(14).fill(0);
  for (const order of orders) {
    const day = Math.floor((new Date(order.created_at).getTime() - chartStart.getTime()) / 86_400_000);
    if (day >= 0 && day < 14) dailySales[day] += order.total;
  }
  const maxDailySales = Math.max(...dailySales, 1);
  const chartTotal = dailySales.reduce((sum, value) => sum + value, 0);
  const chartDays = dailySales.map((value, index) => {
    const date = new Date(chartStart);
    date.setUTCDate(chartStart.getUTCDate() + index);
    return { value, day: date.getUTCDate(), label: shortDate.format(date) };
  });

  const widgets: { label: string; value: string; note: string; href: string; icon: IconName; tone: Tone }[] = [
    { label: "Net satış", value: money.format(sales / 100), note: "Son 30 gün", href: "/analitik", icon: "lira", tone: "gold" },
    { label: "Sipariş", value: orders.length.toLocaleString("tr-TR"), note: "Son 30 gün", href: "/siparisler", icon: "box", tone: "info" },
    { label: "Ürün", value: (productCountResult.count ?? 0).toLocaleString("tr-TR"), note: `${(activeProductCountResult.count ?? 0).toLocaleString("tr-TR")} aktif`, href: "/urunler", icon: "tag", tone: "brand" },
    { label: "Stok", value: stock.toLocaleString("tr-TR"), note: `${variantCount.toLocaleString("tr-TR")} varyant`, href: "/stok", icon: "archive", tone: "success" },
  ];

  /*
    Aksiyon özeti. Renk anlam taşıyor: sıfır olan sayaç nötr,
    dikkat gerektiren sarı, sorunlu kırmızı.
  */
  const actionItems: { label: string; value: number; detail: string; href: string; icon: IconName; tone: Tone }[] = [
    {
      label: "İşlem bekleyen sipariş",
      value: openOrderCount,
      detail: openOrderCount ? "Onay ve hazırlık akışını tamamlayın" : "Sipariş akışı güncel",
      href: "/operasyon",
      icon: "box",
      tone: openOrderCount ? "warning" : "muted",
    },
    {
      label: "Kritik stok",
      value: negativeStockCount,
      detail: negativeStockCount ? "Eksi stokları hemen düzeltin" : "Eksi stok bulunmuyor",
      href: "/stok?filter=negative",
      icon: "alert",
      tone: negativeStockCount ? "danger" : "muted",
    },
    {
      label: "Azalan stok",
      value: lowStockCount,
      detail: lowStockCount ? "5 ve altındaki varyantları inceleyin" : "Stok seviyeleri sağlıklı",
      href: "/stok?filter=low",
      icon: "archive",
      tone: lowStockCount ? "warning" : "muted",
    },
  ];

  /* Son eklenen ürünlerin varyantları yalnızca o beş ürün için
     çekilir; tüm katalog belleğe alınmaz. */
  const recentProductIds = products.map((product) => product.id);
  const { data: recentVariants } = recentProductIds.length
    ? await supabase.from("arc_product_variants").select("product_id,sku,stock,price,currency").eq("organization_id", organization.id).in("product_id", recentProductIds)
    : { data: [] };
  const variantByProduct = new Map((recentVariants ?? []).map((variant) => [variant.product_id, variant]));

  /*
    Hızlı işlem düğmeleri bilerek yok: hepsi sol menüde. Aynı
    işlevi iki yerde göstermek başlık hizasında yer kaplıyordu.
  */
  return (
    <div className="dash">
      <section className="dash-hero">
        <div>
          <span className="panel-kicker">{longDate.format(now).toLocaleUpperCase("tr-TR")}</span>
          <h1>Genel Bakış</h1>
          <p>{organization.name} mağazasının satış, sipariş ve stok durumu.</p>
        </div>
      </section>

      <section className="dash-widgets" aria-label="Özet">
        {widgets.map((widget) => (
          <Link prefetch={false} className="dash-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
            <span className="dash-widget-icon"><Icon name={widget.icon} size={18} /></span>
            <small>{widget.label}</small>
            <strong>{widget.value}</strong>
            <span className="dash-widget-note">{widget.note}</span>
          </Link>
        ))}
      </section>

      <div className="dash-grid">
        <article className="dash-card dash-chart" data-tone="gold">
          <div className="dash-card-head">
            <div>
              <h2>Son 14 gün</h2>
              <p>Günlük satış, bugün altın renkte.</p>
            </div>
            <div className="dash-stat">
              <strong>{money.format(chartTotal / 100)}</strong>
              <span>{orders.length ? "Gerçek sipariş toplamı" : "Henüz satış yok"}</span>
            </div>
          </div>
          <div className="dash-bars" role="img" aria-label="Son 14 günlük satış grafiği">
            {chartDays.map((day, index) => (
              <div className={`dash-bar${day.value ? "" : " is-empty"}${index === 13 ? " is-today" : ""}`} key={day.label} title={`${day.label}: ${money.format(day.value / 100)}`}>
                <span className="dash-bar-value">{day.value ? compact.format(day.value / 100) : ""}</span>
                <span className="dash-bar-fill" style={{ "--h": `${Math.max(3, Math.round((day.value / maxDailySales) * 100))}%` } as React.CSSProperties} />
                <small>{index === 13 ? "Bugün" : day.day}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Aksiyon bekleyenler</h2>
              <p>Bugün ilgilenilmesi gereken kayıtlar.</p>
            </div>
          </div>
          <div className="dash-list">
            {actionItems.map((item) => (
              <Link prefetch={false} className="dash-row" data-tone={item.tone} href={item.href} key={item.label}>
                <span className="dash-row-icon"><Icon name={item.icon} size={16} /></span>
                <span className="dash-row-label"><span>{item.label}</span><small>{item.detail}</small></span>
                <span className={item.value ? "dash-row-count" : "dash-row-count is-zero"}>{item.value.toLocaleString("tr-TR")}</span>
                <span className="dash-chevron"><Icon name="chevron" size={16} /></span>
              </Link>
            ))}
          </div>
          <Link prefetch={false} className="dash-card-link" href="/operasyon">Operasyon merkezi <Icon name="chevron" size={15} /></Link>
        </article>

        <article className="dash-card dash-activity">
          <div className="dash-card-head">
            <div>
              <h2>Son siparişler</h2>
              <p>Son 30 günde gelen siparişler.</p>
            </div>
            <Link prefetch={false} className="dash-card-link" href="/siparisler">Tümünü gör <Icon name="chevron" size={15} /></Link>
          </div>
          {recentOrders.length ? (
            <ul className="dash-activity-list">
              {recentOrders.map((order) => {
                const badge = orderBadge(order.status, order.payment_status);
                const customer = order.customer_name || "Misafir müşteri";
                return (
                  <li key={order.id}>
                    <Link prefetch={false} className="dash-activity-row" href={`/siparisler/${order.id}`}>
                      <span className="dash-avatar">{initials(customer)}</span>
                      <span className="dash-activity-body">
                        <b>{order.order_number} · {customer}</b>
                        <small>{shortDate.format(new Date(order.created_at))}</small>
                      </span>
                      <span className="dash-activity-side">
                        <strong>{money.format(order.total / 100)}</strong>
                        <em className="ac-tag" data-tone={badge.tone}>{badge.label}</em>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="dash-empty">Henüz sipariş yok. İlk sipariş geldiğinde burada görünecek.</p>}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Son ürünler</h2>
              <p>Kataloğa en son eklenenler.</p>
            </div>
            <Link prefetch={false} className="dash-card-link" href="/urunler">Ürünler <Icon name="chevron" size={15} /></Link>
          </div>
          {products.length ? (
            <ul className="dash-activity-list">
              {products.map((product) => {
                const variant = variantByProduct.get(product.id);
                return (
                  <li key={product.id}>
                    <Link prefetch={false} className="dash-activity-row" href={`/urunler/${product.id}`}>
                      <span className="dash-avatar is-product">{initials(product.name)}</span>
                      <span className="dash-activity-body">
                        <b>{product.name}</b>
                        <small>{variant ? `${variant.sku} · stok ${variant.stock}` : "Varyant yok"} · {productStatusLabel(product.status)}</small>
                      </span>
                      <span className="dash-activity-side">
                        <strong>{variant ? money.format(variant.price / 100) : "—"}</strong>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="dash-empty">Henüz ürün yok. İlk ürününü ekleyerek başlayabilirsin.</p>}
        </article>
      </div>
    </div>
  );
}
