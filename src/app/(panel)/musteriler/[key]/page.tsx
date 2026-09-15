import Link from "next/link";
import { notFound } from "next/navigation";
import { orderBadge, sourceLabel } from "@/lib/commerce-labels";
import { countsAsRevenue, revenueAmount } from "@/lib/order-flow";
import { fetchAllRows } from "@/lib/fetch-all";
import { requireTenant } from "@/lib/tenant";
import { Icon } from "@/components/panel/icons";
import { currentTime, customerTags, DAY, daysAgo, type Customer } from "../customer-data";
import "../customers.css";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });

type Address = {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

type OrderMeta = {
  billing?: Address;
  shipping_address?: Address;
};

export default async function CustomerDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const { supabase, organization } = await requireTenant();
  const now = currentTime();

  let ordersQuery = supabase
    .from("arc_orders")
    .select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,metadata,created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (key.startsWith("name:")) {
    ordersQuery = ordersQuery.ilike("customer_name", key.slice(5).replace(/[%_,]/g, ""));
  } else {
    ordersQuery = ordersQuery.ilike("customer_email", key.replace(/[%_,]/g, ""));
  }

  const { data: orders, error } = await ordersQuery;
  if (error) throw new Error(error.message);
  if (!orders?.length) notFound();

  const latestOrder = orders[0];
  const firstOrder = orders[orders.length - 1];
  const customerName = latestOrder.customer_name?.trim() || "İsimsiz müşteri";
  const customerEmail = latestOrder.customer_email?.trim() || "";
  const paidOrders = orders.filter((order) => countsAsRevenue(order.status, order.payment_status));
  const totalSpent = paidOrders.reduce((sum, order) => sum + revenueAmount({ ...order, refunded_amount: (order.metadata as { refunded_amount?: unknown } | null)?.refunded_amount }), 0);
  const averageOrder = paidOrders.length ? Math.round(totalSpent / paidOrders.length) : 0;
  const firstAt = Date.parse(firstOrder.created_at);
  const lastAt = Date.parse(latestOrder.created_at);
  /* Sipariş sıklığı: ilk ve son sipariş arasındaki gün / aralık sayısı. */
  const cadence = orders.length > 1 ? Math.max(1, Math.round((lastAt - firstAt) / DAY / (orders.length - 1))) : null;

  const latestMeta = (latestOrder.metadata ?? {}) as OrderMeta;
  const address = latestMeta.shipping_address ?? latestMeta.billing;
  const addressLines = [address?.address1, address?.address2, [address?.zip, address?.city].filter(Boolean).join(" "), address?.province, address?.country].filter(Boolean);

  const summary: Customer = { key, name: customerName, email: customerEmail, orders: orders.length, paidOrders: paidOrders.length, spent: totalSpent, firstOrderAt: firstAt, lastOrderAt: lastAt };

  /*
    En çok aldığı ürünler: ciroya sayılan siparişlerin kalemleri.
    Kimlik listesi URL'ye yazıldığı için 150'lik parçalarla okunur.
  */
  const paidIds = paidOrders.slice(0, 300).map((order) => order.id);
  const chunks = Array.from({ length: Math.ceil(paidIds.length / 150) }, (_, index) => paidIds.slice(index * 150, index * 150 + 150));
  /* 150 siparişin kalemi 1000 satırı aşabiliyor; her parça sayfalanarak okunur. */
  type ItemRow = { product_name: string; sku: string; quantity: number; total: number };
  const itemChunks = await Promise.all(chunks.map((chunk) => fetchAllRows<ItemRow>((from, to) =>
    supabase.from("arc_order_items").select("product_name,sku,quantity,total").eq("organization_id", organization.id).in("order_id", chunk).order("id").range(from, to) as unknown as PromiseLike<{ data: ItemRow[] | null; error: { message: string } | null }>)));
  const favourites = new Map<string, { name: string; sku: string; quantity: number; total: number }>();
  for (const { rows } of itemChunks) {
    for (const item of rows) {
      const itemKey = item.sku || item.product_name;
      const current = favourites.get(itemKey);
      if (current) {
        current.quantity += item.quantity;
        current.total += item.total;
      } else favourites.set(itemKey, { name: item.product_name, sku: item.sku, quantity: item.quantity, total: item.total });
    }
  }
  const topProducts = [...favourites.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, 5);

  return <>
    <section className="ac-bar">
      <div>
        <Link prefetch={false} className="customer-back" href="/musteriler">← Müşteriler</Link>
        <h1>{customerName}</h1>
        <p>{customerEmail || "E-posta bilgisi yok"} · {dateFormat.format(new Date(firstAt))} tarihinden beri müşteri</p>
      </div>
      <div className="customer-head-actions">
        {customerTags(summary, now).map((tag) => <em className="ac-tag" data-tone={tag.tone} key={tag.label}>{tag.label}</em>)}
        {customerEmail ? <a className="ac-btn" href={`mailto:${customerEmail}`}><Icon name="mail" size={15} />E-posta gönder</a> : null}
      </div>
    </section>

    <div className="ac-stack">
      <section className="ac-metrics" aria-label="Müşteri özeti">
        <article className="ac-metric"><span>Sipariş</span><strong>{orders.length}</strong><small>{orders.length === paidOrders.length ? "Tamamı geçerli" : `${orders.length - paidOrders.length} iptal veya iade`}</small></article>
        <article className="ac-metric"><span>Net harcama</span><strong>{money.format(totalSpent / 100)}</strong><small>İptal ve iadeler hariç</small></article>
        <article className="ac-metric"><span>Ortalama sepet</span><strong>{money.format(averageOrder / 100)}</strong><small>Geçerli sipariş başına</small></article>
        <article className="ac-metric" data-tone={now - lastAt > 120 * DAY ? "warn" : undefined}><span>Son sipariş</span><strong>{shortDate.format(new Date(lastAt))}</strong><small>{daysAgo(lastAt, now)}</small></article>
      </section>

      <div className="customer-layout">
        <section className="ac table list-table customer-orders">
          <div className="ac-head ac-pad-sm list-table-head">
            <div><h3>Sipariş geçmişi</h3><p>{orders.length} sipariş · en yeniden eskiye</p></div>
          </div>
          <div className="list-row th">
            <span className="co-main">SİPARİŞ</span>
            <span className="co-source">KAYNAK</span>
            <span className="co-amount">TUTAR</span>
            <span className="co-status">DURUM</span>
          </div>
          {orders.map((order) => {
            const badge = orderBadge(order.status, order.payment_status);
            return (
              <div className="list-row" key={order.id}>
                <span className="co-main">
                  <Link prefetch={false} className="list-row-link" href={`/siparisler/${order.id}`}><b>{order.order_number}</b></Link>
                  <small>{shortDate.format(new Date(order.created_at))}</small>
                </span>
                <span className="co-source">{sourceLabel(order.source)}</span>
                <span className="co-amount">{money.format(order.total / 100)}</span>
                <span className="co-status"><em className="ac-tag" data-tone={badge.tone}>{badge.label}</em></span>
              </div>
            );
          })}
        </section>

        <aside className="customer-side">
          <section className="ac ac-pad customer-card">
            <h3>İletişim</h3>
            <dl className="customer-dl">
              <div><dt>E-posta</dt><dd>{customerEmail ? <a href={`mailto:${customerEmail}`}>{customerEmail}</a> : "Bulunmuyor"}</dd></div>
              <div><dt>Telefon</dt><dd>{address?.phone ? <a href={`tel:${address.phone}`}>{address.phone}</a> : "Bulunmuyor"}</dd></div>
              <div><dt>Son teslimat adresi</dt><dd>{addressLines.length ? addressLines.join(", ") : "Adres bilgisi bulunmuyor"}</dd></div>
            </dl>
          </section>

          <section className="ac ac-pad customer-card">
            <h3>Alışveriş alışkanlığı</h3>
            <dl className="customer-dl">
              <div><dt>Sipariş sıklığı</dt><dd>{cadence ? `Ortalama ${cadence.toLocaleString("tr-TR")} günde bir` : "Tek sipariş"}</dd></div>
              <div><dt>İlk sipariş</dt><dd>{dateFormat.format(new Date(firstAt))}</dd></div>
              <div><dt>Son sipariş</dt><dd>{dateFormat.format(new Date(lastAt))} · {daysAgo(lastAt, now)}</dd></div>
            </dl>
          </section>

          <section className="ac ac-pad customer-card">
            <h3>En çok aldığı ürünler</h3>
            {topProducts.length ? (
              <ul className="customer-fav">
                {topProducts.map((product) => (
                  <li key={product.sku || product.name}>
                    <span><b>{product.name}</b><small>{product.sku || "SKU yok"} · {money.format(product.total / 100)}</small></span>
                    <strong>{product.quantity} adet</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="customer-muted">Ürün kalemi bulunmuyor.</p>}
          </section>
        </aside>
      </div>
    </div>
  </>;
}
