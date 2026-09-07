import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { orderStatusLabel, paymentStatusLabel, sourceLabel } from "@/lib/commerce-labels";
import { requireTenant } from "@/lib/tenant";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

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

  let ordersQuery = supabase
    .from("arc_orders")
    .select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,metadata,created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  if (key.startsWith("name:")) {
    ordersQuery = ordersQuery.ilike("customer_name", key.slice(5).replace(/[%_,]/g, ""));
  } else {
    ordersQuery = ordersQuery.ilike("customer_email", key.replace(/[%_,]/g, ""));
  }

  const { data: orders, error } = await ordersQuery;
  if (error) throw new Error(error.message);
  if (!orders?.length) notFound();

  const latestOrder = orders[0];
  const customerName = latestOrder.customer_name?.trim() || "İsimsiz müşteri";
  const customerEmail = latestOrder.customer_email?.trim() || "";
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
  const averageOrder = Math.round(totalSpent / orders.length);
  const firstOrder = orders.at(-1);
  const latestMeta = (latestOrder.metadata ?? {}) as OrderMeta;
  const address = latestMeta.shipping_address ?? latestMeta.billing;
  const addressLines = [
    address?.address1,
    address?.address2,
    [address?.zip, address?.city].filter(Boolean).join(" "),
    address?.province,
    address?.country,
  ].filter(Boolean);

  return <Shell active="customers" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/musteriler">MÜŞTERİLER</Link> · PROFİL</small><h2>{customerName}</h2><p>{customerEmail || "E-posta bilgisi bulunmuyor"} · İlk sipariş {firstOrder ? new Date(firstOrder.created_at).toLocaleDateString("tr-TR") : "—"}</p></div></section>

    <section className="metrics">
      <article><span>TOPLAM SİPARİŞ</span><strong>{orders.length}</strong><small>Tüm dönem</small></article>
      <article><span>TOPLAM HARCAMA</span><strong>{money.format(totalSpent / 100)}</strong><small>Tüm dönem</small></article>
      <article><span>ORTALAMA SEPET</span><strong>{money.format(averageOrder / 100)}</strong><small>Sipariş başına</small></article>
      <article><span>SON SİPARİŞ</span><strong>{new Date(latestOrder.created_at).toLocaleDateString("tr-TR")}</strong><small>{orderStatusLabel(latestOrder.status)}</small></article>
    </section>

    <div className="customer-detail-grid">
      <section className="card table"><div className="head"><div><small>SİPARİŞ GEÇMİŞİ</small><h3>{orders.length} sipariş</h3></div><span>En yeniden eskiye</span></div>
        <div className="row customer-order-row th"><span>SİPARİŞ</span><span>TARİH</span><span>KAYNAK</span><span>TUTAR</span><span>DURUM</span></div>
        {orders.map((order)=><Link href={`/siparisler/${order.id}`} className="row customer-order-row" key={order.id} style={{textDecoration:"none",color:"inherit"}}><span><b>{order.order_number}</b></span><span>{new Date(order.created_at).toLocaleDateString("tr-TR")}</span><span>{sourceLabel(order.source)}</span><span>{money.format(order.total / 100)}</span><span><em>{orderStatusLabel(order.status)}</em><small style={{display:"block",marginTop:4}}>{paymentStatusLabel(order.payment_status)}</small></span></Link>)}
      </section>

      <aside className="card customer-profile-card">
        <div className="head"><div><small>MÜŞTERİ BİLGİSİ</small><h3>İletişim</h3></div></div>
        <dl>
          <div><dt>Ad soyad</dt><dd>{customerName}</dd></div>
          <div><dt>E-posta</dt><dd>{customerEmail ? <a href={`mailto:${customerEmail}`}>{customerEmail}</a> : "Bulunmuyor"}</dd></div>
          <div><dt>Telefon</dt><dd>{address?.phone ? <a href={`tel:${address.phone}`}>{address.phone}</a> : "Bulunmuyor"}</dd></div>
          <div><dt>Son teslimat adresi</dt><dd>{addressLines.length ? addressLines.join(", ") : "Adres bilgisi bulunmuyor"}</dd></div>
        </dl>
        <Link href={`/siparisler/${latestOrder.id}`} className="customer-primary-link">Son siparişi aç →</Link>
      </aside>
    </div>
  </Shell>;
}
