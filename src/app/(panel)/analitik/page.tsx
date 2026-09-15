import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { countsAsRevenue, refundedAmount, revenueAmount } from "@/lib/order-flow";
import { DAY, TR_OFFSET as TR, trDayStart } from "@/lib/tr-time";
import { orderStatusOptions, sourceLabel } from "@/lib/commerce-labels";
import { Notice } from "@/components/panel/notice";
import "./analytics.css";

/* Gün ve ay sınırları Türkiye saatine göre (bkz. lib/tr-time). */
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "UTC" });

const PERIODS = [
  ["7", "7 gün", "Son 7 gün", "Günlük"],
  ["30", "30 gün", "Son 30 gün", "Günlük"],
  ["90", "90 gün", "Son 90 gün", "Haftalık"],
  ["365", "12 ay", "Son 12 ay", "Aylık"],
] as const;
type PeriodKey = (typeof PERIODS)[number][0];

type Bucket = { start: number; end: number; label: string; revenue: number; orders: number };

const trMonthStart = (ms: number, offset: number) => {
  const local = new Date(ms + TR);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - TR;
};

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function currentTime() {
  return Date.now();
}

function buildBuckets(period: PeriodKey, now: number) {
  if (period === "365") {
    const buckets: Bucket[] = Array.from({ length: 12 }, (_, index) => {
      const start = trMonthStart(now, index - 11);
      return { start, end: trMonthStart(now, index - 10), label: monthShort.format(new Date(start + TR)), revenue: 0, orders: 0 };
    });
    return { buckets, since: buckets[0].start, previousSince: trMonthStart(now, -23) };
  }
  const end = trDayStart(now) + DAY;
  const size = period === "90" ? 7 : 1;
  const count = period === "90" ? 13 : Number(period);
  const since = end - size * count * DAY;
  const buckets: Bucket[] = Array.from({ length: count }, (_, index) => {
    const start = since + index * size * DAY;
    return { start, end: start + size * DAY, label: size === 1 ? String(new Date(start + TR).getUTCDate()) : dayMonth.format(new Date(start + TR)), revenue: 0, orders: 0 };
  });
  return { buckets, since, previousSince: since - size * count * DAY };
}

/* Değişim yüzdesi; önceki dönem sıfırsa karşılaştırma yapılamaz. */
const delta = (current: number, previous: number) => (previous ? Math.round(((current - previous) / previous) * 100) : null);

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="an-delta">yeni</span>;
  const good = inverse ? value < 0 : value > 0;
  const bad = inverse ? value > 0 : value < 0;
  return <span className="an-delta" data-dir={good ? "good" : bad ? "bad" : undefined}>{value > 0 ? "↑" : value < 0 ? "↓" : "→"} %{Math.abs(value)}</span>;
}

type OrderRow = { id: string; status: string; payment_status: string; total: number; source: string | null; refunded_amount: unknown; created_at: string };

export default async function Analytics({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const params = await searchParams;
  const { supabase, organization } = await requireTenant();
  const period: PeriodKey = PERIODS.some(([key]) => key === params.p) ? (params.p as PeriodKey) : "30";
  const [, , periodLabel, bucketKind] = PERIODS.find(([key]) => key === period)!;
  const now = currentTime();
  const { buckets, since, previousSince } = buildBuckets(period, now);

  /*
    Seçilen dönem ve bir önceki eşit dönem birlikte okunur.
    Siparişler 1000'lik sayfalarla okunuyor: tek istekte Supabase
    1000 satırda kesiyor ve rakamlar sessizce eksik çıkıyordu.
  */
  const { rows: orders, truncated } = await fetchAllRows<OrderRow>((from, to) =>
    supabase
      .from("arc_orders")
      .select("id,status,payment_status,total,source,refunded_amount:metadata->refunded_amount,created_at")
      .eq("organization_id", organization.id)
      .gte("created_at", new Date(previousSince).toISOString())
      .order("created_at", { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>,
  );

  const current = orders.filter((order) => Date.parse(order.created_at) >= since);
  const previous = orders.filter((order) => Date.parse(order.created_at) < since);
  const currentPaid = current.filter((order) => countsAsRevenue(order.status, order.payment_status));
  const previousPaid = previous.filter((order) => countsAsRevenue(order.status, order.payment_status));
  /* Net ciro kısmi iadeyi düşer; "İade" kısmi iadeleri de sayar. */
  const sum = (list: OrderRow[]) => list.reduce((total, order) => total + revenueAmount(order), 0);
  const refundedTotal = (list: OrderRow[]) => list.reduce((total, order) => total + refundedAmount(order), 0);

  const revenue = sum(currentPaid);
  const previousRevenue = sum(previousPaid);
  const average = currentPaid.length ? Math.round(revenue / currentPaid.length) : 0;
  const previousAverage = previousPaid.length ? Math.round(previousRevenue / previousPaid.length) : 0;
  const refunded = refundedTotal(current);

  for (const order of currentPaid) {
    const at = Date.parse(order.created_at);
    const bucket = buckets.find((item) => at >= item.start && at < item.end);
    if (bucket) {
      bucket.revenue += revenueAmount(order);
      bucket.orders++;
    }
  }
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.revenue), 1);
  const days = Math.max(1, Math.round((buckets[buckets.length - 1].end - since) / DAY));

  const statusCounts = new Map<string, number>();
  for (const order of current) statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);

  const sources = new Map<string, { revenue: number; orders: number }>();
  for (const order of currentPaid) {
    const label = sourceLabel(order.source);
    const entry = sources.get(label) ?? { revenue: 0, orders: 0 };
    entry.revenue += revenueAmount(order);
    entry.orders++;
    sources.set(label, entry);
  }
  const sourceList = [...sources.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

  /*
    Dönemin en çok satanları: yalnızca bu dönemdeki geçerli
    siparişlerin kalemleri. Öncesinde kalemler dönemden bağımsız
    ilk 5000 satırdan (pratikte 1000) hesaplanıyordu. Kimlik listesi
    URL'ye yazıldığı için 150'lik parçalarla okunur.
  */
  const paidIds = currentPaid.slice(0, 3000).map((order) => order.id);
  const chunks = Array.from({ length: Math.ceil(paidIds.length / 150) }, (_, index) => paidIds.slice(index * 150, index * 150 + 150));
  /* 150 siparişin kalemi 1000 satırı aşabiliyor; her parça sayfalanarak okunur. */
  type ItemRow = { product_name: string; sku: string; quantity: number; total: number };
  const itemChunks = await Promise.all(chunks.map((chunk) => fetchAllRows<ItemRow>((from, to) =>
    supabase.from("arc_order_items").select("product_name,sku,quantity,total").eq("organization_id", organization.id).in("order_id", chunk).order("id").range(from, to) as unknown as PromiseLike<{ data: ItemRow[] | null; error: { message: string } | null }>)));
  const products = new Map<string, { name: string; sku: string; quantity: number; revenue: number }>();
  for (const { rows } of itemChunks) {
    for (const item of rows) {
      const key = item.sku || item.product_name;
      const entry = products.get(key);
      if (entry) {
        entry.quantity += item.quantity;
        entry.revenue += item.total;
      } else products.set(key, { name: item.product_name, sku: item.sku, quantity: item.quantity, revenue: item.total });
    }
  }
  const topProducts = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxProduct = Math.max(...topProducts.map((item) => item.revenue), 1);
  const itemsRevenue = [...products.values()].reduce((total, item) => total + item.revenue, 0);

  const metrics = [
    { label: "Net ciro", value: money.format(revenue / 100), change: delta(revenue, previousRevenue), note: "iptal ve iadeler hariç" },
    { label: "Sipariş", value: currentPaid.length.toLocaleString("tr-TR"), change: delta(currentPaid.length, previousPaid.length), note: "geçerli sipariş" },
    { label: "Ortalama sepet", value: money.format(average / 100), change: delta(average, previousAverage), note: "sipariş başına" },
    { label: "İade", value: money.format(refunded / 100), change: delta(refunded, refundedTotal(previous)), note: "iade edilen tutar", inverse: true },
  ];

  return <>
    <section className="ac-bar">
      <div>
        <h1>Satış Analitiği</h1>
        <p>{periodLabel} · önceki eşit dönemle karşılaştırmalı · iptal ve iadeler ciroya dâhil değil</p>
      </div>
      <nav className="ac-filter" aria-label="Dönem">
        {PERIODS.map(([key, label]) => (
          <Link prefetch={false} key={key} className="ac-btn" href={key === "30" ? "/analitik" : `/analitik?p=${key}`} aria-current={period === key ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </section>

    <div className="ac-stack">
      {truncated ? <Notice tone="warn" title="Rakamlar kısmi">Bu dönemde 20.000’den fazla sipariş var; hesaplama en yeni 20.000 siparişle yapıldı.</Notice> : null}

      <section className="ac-metrics" aria-label="Dönem özeti">
        {metrics.map((metric) => (
          <article className="ac-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small><Delta value={metric.change} inverse={metric.inverse} />{metric.note}</small>
          </article>
        ))}
      </section>

      <div className="an-grid">
        <article className="ac ac-pad an-chart">
          <div className="an-head">
            <div><h3>Ciro</h3><p>{bucketKind} · son çubuk içinde bulunulan dönem</p></div>
            <div className="an-stat"><strong>{money.format(revenue / 100)}</strong><span>Günlük ortalama {money.format(revenue / days / 100)}</span></div>
          </div>
          <div className="an-bars" data-dense={buckets.length > 14 ? "" : undefined} style={{ "--n": buckets.length } as React.CSSProperties} role="img" aria-label={`${periodLabel} ciro grafiği`}>
            {buckets.map((bucket, index) => (
              <div className={`an-bar${bucket.revenue ? "" : " is-empty"}${index === buckets.length - 1 ? " is-last" : ""}`} key={bucket.start} title={`${bucket.label}: ${money.format(bucket.revenue / 100)} · ${bucket.orders} sipariş`}>
                <span className="an-bar-value">{bucket.revenue && buckets.length <= 14 ? compact.format(bucket.revenue / 100) : ""}</span>
                <span className="an-bar-fill" style={{ "--h": `${Math.max(2, Math.round((bucket.revenue / maxBucket) * 100))}%` } as React.CSSProperties} />
                <small>{bucket.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="ac ac-pad">
          <div className="an-head"><div><h3>Sipariş durumları</h3><p>{current.length.toLocaleString("tr-TR")} sipariş · {periodLabel.toLocaleLowerCase("tr-TR")}</p></div></div>
          <ul className="an-dist">
            {orderStatusOptions.map(([status, label]) => {
              const count = statusCounts.get(status) ?? 0;
              return (
                <li key={status}>
                  <div className="an-dist-top"><span>{label}</span><b>{count.toLocaleString("tr-TR")}</b></div>
                  <div className="an-track"><i style={{ "--w": `${current.length ? (count / current.length) * 100 : 0}%` } as React.CSSProperties} /></div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="ac ac-pad an-top">
          <div className="an-head"><div><h3>En çok satan ürünler</h3><p>Ciroya göre ilk 10 · {periodLabel.toLocaleLowerCase("tr-TR")}</p></div></div>
          {topProducts.length ? (
            <ol className="an-top-list">
              {topProducts.map((product, index) => (
                <li key={product.sku || product.name}>
                  <span className="an-rank">{index + 1}</span>
                  <span><b>{product.name}</b><small>{product.sku || "SKU yok"} · payı %{itemsRevenue ? Math.round((product.revenue / itemsRevenue) * 100) : 0}</small></span>
                  <div className="an-track is-gold"><i style={{ "--w": `${(product.revenue / maxProduct) * 100}%` } as React.CSSProperties} /></div>
                  <span className="an-qty">{product.quantity.toLocaleString("tr-TR")} adet</span>
                  <strong>{money.format(product.revenue / 100)}</strong>
                </li>
              ))}
            </ol>
          ) : <p className="an-empty">Bu dönemde satılan ürün yok.</p>}
        </article>

        <article className="ac ac-pad">
          <div className="an-head"><div><h3>Satış kaynağı</h3><p>Ciroya göre dağılım</p></div></div>
          {sourceList.length ? (
            <ul className="an-dist">
              {sourceList.map(([label, entry]) => (
                <li key={label}>
                  <div className="an-dist-top"><span>{label} · {entry.orders.toLocaleString("tr-TR")} sipariş</span><b>{money.format(entry.revenue / 100)}</b></div>
                  <div className="an-track is-gold"><i style={{ "--w": `${revenue ? (entry.revenue / revenue) * 100 : 0}%` } as React.CSSProperties} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="an-empty">Bu dönemde geçerli sipariş yok.</p>}
        </article>
      </div>
    </div>
  </>;
}
