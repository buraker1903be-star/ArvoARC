import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Icon } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import { customerTags, currentTime, DAY, daysAgo, loadCustomers, NEW_DAYS, RISK_DAYS, type Customer } from "./customer-data";
import "./customers.css";

const PAGE_SIZE = 50;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });

const SEGMENTS = [
  ["all", "Tümü"],
  ["repeat", "Tekrarlayan"],
  ["new", "Yeni"],
  ["risk", "Uzun süredir yok"],
  ["single", "Tek sipariş"],
] as const;
const SORTS = [
  ["spent", "Harcama"],
  ["orders", "Sipariş"],
  ["recent", "Son sipariş"],
] as const;

type SegmentKey = (typeof SEGMENTS)[number][0];
type SortKey = (typeof SORTS)[number][0];
type ListState = { q: string; segment: SegmentKey; sort: SortKey; page: number };

function listHref(state: ListState, patch: Partial<ListState>) {
  const next = { ...state, ...patch };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.segment !== "all") query.set("segment", next.segment);
  if (next.sort !== "spent") query.set("sort", next.sort);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/musteriler?${text}` : "/musteriler";
}

function inSegment(customer: Customer, segment: SegmentKey, now: number) {
  if (segment === "repeat") return customer.paidOrders > 1;
  if (segment === "new") return now - customer.firstOrderAt <= NEW_DAYS * DAY;
  if (segment === "risk") return now - customer.lastOrderAt > RISK_DAYS * DAY;
  if (segment === "single") return customer.orders === 1;
  return true;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR") || "M";

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const { supabase, organization } = await requireTenant();
  const now = currentTime();

  const search = (params.q ?? "").trim().slice(0, 80);
  const needle = search.toLocaleLowerCase("tr-TR");
  const segment: SegmentKey = SEGMENTS.some(([key]) => key === params.segment) ? (params.segment as SegmentKey) : "all";
  const sort: SortKey = SORTS.some(([key]) => key === params.sort) ? (params.sort as SortKey) : "spent";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const state: ListState = { q: search, segment, sort, page };

  const { customers, orderCount, truncated } = await loadCustomers(supabase, organization.id);

  const searched = needle ? customers.filter((customer) => customer.name.toLocaleLowerCase("tr-TR").includes(needle) || customer.email.includes(needle)) : customers;
  const counts = Object.fromEntries(SEGMENTS.map(([key]) => [key, searched.filter((customer) => inSegment(customer, key, now)).length])) as Record<SegmentKey, number>;
  const sorted = searched
    .filter((customer) => inSegment(customer, segment, now))
    .sort((a, b) => (sort === "orders" ? b.orders - a.orders || b.spent - a.spent : sort === "recent" ? b.lastOrderAt - a.lastOrderAt : b.spent - a.spent));
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const from = (Math.min(page, pageCount) - 1) * PAGE_SIZE;
  const visible = sorted.slice(from, from + PAGE_SIZE);

  const totalSpent = customers.reduce((sum, customer) => sum + customer.spent, 0);
  const repeat = customers.filter((customer) => customer.paidOrders > 1).length;
  const newCount = customers.filter((customer) => now - customer.firstOrderAt <= NEW_DAYS * DAY).length;

  return <>
    <section className="ac-bar">
      <div>
        <h1>Müşteriler</h1>
        <p>{customers.length.toLocaleString("tr-TR")} müşteri · {orderCount.toLocaleString("tr-TR")} siparişten oluşturuldu</p>
      </div>
      <div className="ac-bar-actions">
        <a className="ac-btn" href="/api/disari-aktar/musteriler"><Icon name="download" size={15} />CSV indir</a>
      </div>
    </section>

    <div className="ac-stack">
      {truncated ? <Notice tone="warn" title="Sipariş sayısı çok yüksek">Müşteri görünümü en yeni 20.000 siparişten hesaplandı; daha eski siparişler toplamlara dâhil değil.</Notice> : null}

      <section className="ac-metrics" aria-label="Müşteri özeti">
        <article className="ac-metric"><span>Toplam müşteri</span><strong>{customers.length.toLocaleString("tr-TR")}</strong><small>Sipariş veren</small></article>
        <Link prefetch={false} className="ac-metric ac-lift" href={listHref(state, { segment: "repeat", page: 1 })}>
          <span>Tekrarlayan</span>
          <strong>{repeat.toLocaleString("tr-TR")}</strong>
          <small>Müşterilerin %{customers.length ? Math.round((repeat / customers.length) * 100) : 0}’i birden fazla kez aldı</small>
        </Link>
        <article className="ac-metric"><span>Müşteri değeri</span><strong>{money.format(customers.length ? totalSpent / customers.length / 100 : 0)}</strong><small>Müşteri başına net harcama</small></article>
        <Link prefetch={false} className="ac-metric ac-lift" href={listHref(state, { segment: "new", page: 1 })}>
          <span>Yeni müşteri</span>
          <strong>{newCount.toLocaleString("tr-TR")}</strong>
          <small>İlk siparişi son {NEW_DAYS} günde</small>
        </Link>
      </section>

      <section className="ac ac-pad-sm cust-toolbar">
        <form className="ac-filter cust-search" role="search">
          {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
          {sort !== "spent" ? <input type="hidden" name="sort" value={sort} /> : null}
          <input name="q" defaultValue={search} placeholder="Ad veya e-posta ile ara" aria-label="Müşterilerde ara" />
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {search ? <Link prefetch={false} className="ac-btn" href={listHref(state, { q: "", page: 1 })}>Temizle</Link> : null}
        </form>
        <nav className="ac-filter" aria-label="Sıralama">
          {SORTS.map(([key, label]) => (
            <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { sort: key, page: 1 })} aria-current={sort === key ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      </section>

      <nav className="ac-filter" aria-label="Müşteri segmenti">
        {SEGMENTS.map(([key, label]) => (
          <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { segment: key, page: 1 })} aria-current={segment === key ? "page" : undefined}>
            {label}
            <span className="ac-count" data-tone={key === "risk" && counts[key] ? "warn" : undefined}>{counts[key].toLocaleString("tr-TR")}</span>
          </Link>
        ))}
      </nav>

      <section className="ac table list-table customer-list">
        <div className="ac-head ac-pad-sm list-table-head">
          <div>
            <h3>Müşteri listesi</h3>
            <p>“Uzun süredir yok”: son siparişi {RISK_DAYS} günden eski. Satıra tıklayarak profili açın.</p>
          </div>
        </div>
        {visible.length ? (
          <>
            <div className="list-row th">
              <span className="cl-avatar" />
              <span className="cl-name">MÜŞTERİ</span>
              <span className="cl-orders">SİPARİŞ</span>
              <span className="cl-spent">NET HARCAMA</span>
              <span className="cl-last">SON SİPARİŞ</span>
              <span className="cl-tags">SEGMENT</span>
            </div>
            {visible.map((customer) => (
              <div className="list-row" key={customer.key}>
                <span className="cl-avatar">{initials(customer.name)}</span>
                <span className="cl-name">
                  <Link prefetch={false} className="list-row-link" href={`/musteriler/${encodeURIComponent(customer.key)}`}><b>{customer.name}</b></Link>
                  <small>{customer.email || "E-posta yok"}</small>
                </span>
                <span className="cl-orders"><b>{customer.orders}</b><small>{customer.orders === customer.paidOrders ? "sipariş" : `${customer.orders - customer.paidOrders} iptal/iade`}</small></span>
                <span className="cl-spent"><b>{money.format(customer.spent / 100)}</b><small>ort. {money.format(customer.paidOrders ? customer.spent / customer.paidOrders / 100 : 0)}</small></span>
                <span className="cl-last"><b>{dateFormat.format(new Date(customer.lastOrderAt))}</b><small>{daysAgo(customer.lastOrderAt, now)}</small></span>
                <span className="cl-tags">{customerTags(customer, now).map((tag) => <em className="ac-tag" data-tone={tag.tone} key={tag.label}>{tag.label}</em>)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="list-empty">
            <b>Bu ölçütlere uygun müşteri yok.</b>
            <p>Aramayı veya segmenti değiştirin.</p>
          </div>
        )}
        <div className="list-pagination">
          <span>{sorted.length ? `${(from + 1).toLocaleString("tr-TR")}–${(from + visible.length).toLocaleString("tr-TR")} / ${sorted.length.toLocaleString("tr-TR")} müşteri` : "Kayıt yok"}</span>
          {pageCount > 1 ? (
            <div>
              {page > 1 ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page - 1 })}>← Önceki</Link> : <span className="ac-btn" aria-disabled="true">← Önceki</span>}
              <span className="order-page-number">{Math.min(page, pageCount)} / {pageCount}</span>
              {page < pageCount ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page + 1 })}>Sonraki →</Link> : <span className="ac-btn" aria-disabled="true">Sonraki →</span>}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  </>;
}
