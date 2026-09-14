import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderBadge, productStatusLabel } from "@/lib/commerce-labels";
import { Icon, type IconName } from "@/components/panel/icons";
import "./search.css";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });

type Hit = { key: string; href: string; icon: IconName; title: string; detail: string; side?: React.ReactNode };

function Section({ title, hits, more }: { title: string; hits: Hit[]; more?: { href: string; label: string } }) {
  if (!hits.length) return null;
  return (
    <section className="ac table list-table search-list">
      <div className="ac-head ac-pad-sm list-table-head">
        <div><h3>{title}</h3><p>{hits.length} sonuç</p></div>
        {more ? <Link prefetch={false} href={more.href}>{more.label} →</Link> : null}
      </div>
      {hits.map((hit) => (
        <div className="list-row" key={hit.key}>
          <span className="sr-icon"><Icon name={hit.icon} size={16} /></span>
          <span className="sr-main"><Link prefetch={false} className="list-row-link" href={hit.href}><b>{hit.title}</b></Link><small>{hit.detail}</small></span>
          <span className="sr-side">{hit.side}</span>
        </div>
      ))}
    </section>
  );
}

/*
  Genel arama sonuçları. Her tür kendi sorgusuyla ve sınırıyla
  aranır; ayrıntılı filtreleme için ilgili sayfaya bağlantı verilir.
  Metin PostgREST filtresine yazıldığı için filtre sözdiziminin
  parçaları (virgül, parantez, joker) temizlenir.
*/
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, organization } = await requireTenant();
  const term = (q ?? "").replace(/[,()*\\"%_]/g, " ").trim().slice(0, 80);

  if (!term) {
    return <>
      <section className="ac-bar"><div><h1>Arama</h1><p>Sipariş numarası, müşteri adı veya e-postası, ürün adı, SKU ya da koleksiyon adı yazın.</p></div></section>
      <section className="ac list-empty"><b>Aramak istediğiniz kelimeyi yazın.</b><p>İpucu: üst çubuktaki kutuya ⌘K (Windows’ta Ctrl+K) veya “/” ile hızlıca geçebilirsiniz.</p></section>
    </>;
  }

  const like = `%${term}%`;
  const [ordersResult, productsResult, skuResult, collectionsResult] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,customer_email,total,status,payment_status,created_at").eq("organization_id", organization.id).or(`order_number.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like}`).order("created_at", { ascending: false }).limit(60),
    supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id", organization.id).ilike("name", like).order("updated_at", { ascending: false }).limit(8),
    supabase.from("arc_product_variants").select("product_id,sku").eq("organization_id", organization.id).ilike("sku", like).limit(20),
    supabase.from("arc_collections").select("id,title,slug,status").eq("organization_id", organization.id).ilike("title", like).order("title").limit(5),
  ]);
  for (const result of [ordersResult, productsResult, skuResult, collectionsResult]) if (result.error) throw new Error(result.error.message);

  /* SKU ile eşleşen ama adı eşleşmeyen ürünler de gösterilir. */
  const nameMatches = productsResult.data ?? [];
  const skuByProduct = new Map((skuResult.data ?? []).map((row) => [row.product_id, row.sku]));
  const missingIds = [...skuByProduct.keys()].filter((id) => !nameMatches.some((product) => product.id === id)).slice(0, 8);
  const { data: skuProducts } = missingIds.length
    ? await supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id", organization.id).in("id", missingIds)
    : { data: [] };
  const products = [...nameMatches, ...(skuProducts ?? [])].slice(0, 10);

  const orders = ordersResult.data ?? [];
  const orderHits: Hit[] = orders.slice(0, 8).map((order) => {
    const badge = orderBadge(order.status, order.payment_status);
    return {
      key: order.id,
      href: `/siparisler/${order.id}`,
      icon: "box",
      title: `${order.order_number} · ${order.customer_name || order.customer_email || "Misafir müşteri"}`,
      detail: shortDate.format(new Date(order.created_at)),
      side: <><strong className="sr-amount">{money.format(order.total / 100)}</strong><em className="ac-tag" data-tone={badge.tone}>{badge.label}</em></>,
    };
  });

  /* Müşteriler siparişlerden türetilir (müşteri listesiyle aynı anahtar). */
  const customers = new Map<string, { key: string; name: string; email: string; orders: number }>();
  for (const order of orders) {
    const email = (order.customer_email ?? "").trim().toLocaleLowerCase("tr-TR");
    const name = (order.customer_name ?? "").trim() || "İsimsiz müşteri";
    const needle = term.toLocaleLowerCase("tr-TR");
    if (!name.toLocaleLowerCase("tr-TR").includes(needle) && !email.includes(needle)) continue;
    const key = email || `name:${name.toLocaleLowerCase("tr-TR")}`;
    const entry = customers.get(key);
    if (entry) entry.orders++;
    else customers.set(key, { key, name, email, orders: 1 });
  }
  const customerHits: Hit[] = [...customers.values()].slice(0, 6).map((customer) => ({
    key: customer.key,
    href: `/musteriler/${encodeURIComponent(customer.key)}`,
    icon: "users",
    title: customer.name,
    detail: customer.email || "E-posta yok",
    side: <span className="sr-muted">{customer.orders}+ sipariş</span>,
  }));

  const productHits: Hit[] = products.map((product) => {
    const meta = (product.metadata ?? {}) as { vendor?: string };
    const sku = skuByProduct.get(product.id);
    return {
      key: product.id,
      href: `/urunler/${product.id}`,
      icon: "tag",
      title: product.name,
      detail: [sku ? `SKU ${sku}` : null, meta.vendor].filter(Boolean).join(" · ") || "Ürün",
      side: <em className="ac-tag" data-tone={product.status === "active" ? undefined : product.status === "draft" ? "warn" : "muted"}>{productStatusLabel(product.status)}</em>,
    };
  });

  const collectionHits: Hit[] = (collectionsResult.data ?? []).map((collection) => ({
    key: collection.id,
    href: `/koleksiyonlar/${collection.id}`,
    icon: "layers",
    title: collection.title,
    detail: `/${collection.slug}`,
    side: <em className="ac-tag" data-tone={collection.status === "active" ? undefined : "muted"}>{collection.status === "active" ? "Aktif" : collection.status === "draft" ? "Taslak" : "Arşiv"}</em>,
  }));

  const total = orderHits.length + customerHits.length + productHits.length + collectionHits.length;
  const encoded = encodeURIComponent(term);

  return <>
    <section className="ac-bar">
      <div>
        <h1>“{term}”</h1>
        <p>{total ? `${total} sonuç · sipariş, müşteri, ürün ve koleksiyonlarda arandı` : "Sonuç bulunamadı"}</p>
      </div>
    </section>

    <div className="ac-stack">
      {total ? <>
        <Section title="Siparişler" hits={orderHits} more={orders.length > 8 ? { href: `/siparisler?q=${encoded}`, label: "Tüm siparişlerde" } : undefined} />
        <Section title="Müşteriler" hits={customerHits} more={{ href: `/musteriler?q=${encoded}`, label: "Müşteri listesinde" }} />
        <Section title="Ürünler" hits={productHits} more={{ href: `/urunler?q=${encoded}`, label: "Katalogda" }} />
        <Section title="Koleksiyonlar" hits={collectionHits} />
      </> : (
        <section className="ac list-empty">
          <b>Bu aramayla eşleşen kayıt yok.</b>
          <p>Sipariş numarasını (#AC-1048), müşteri adını veya e-postasını, ürün adını ya da SKU’yu deneyin.</p>
        </section>
      )}
    </div>
  </>;
}
