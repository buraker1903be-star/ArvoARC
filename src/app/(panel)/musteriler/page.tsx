import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { SatirTiklama } from "@/components/arvo-ui/satir-tiklama";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/kayit-detay.css";
import { customerTags, currentTime, DAY, daysAgo, loadCustomers, NEW_DAYS, RISK_DAYS, type Customer } from "./customer-data";
import "./musteri-listesi.css";

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


export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
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

  const filtreli = Boolean(search) || segment !== "all";

  /* ArvoOS'un liste kalıbı (16.10.2026): başlık, segment şeridi, süzgeç ve tablo tek kartta. */
  return (
    <main className="talep liste-sayfa musteri-listesi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Satış</small>
          <h1>Müşteriler</h1>
          <p className="talep-bas-alt">{customers.length.toLocaleString("tr-TR")} müşteri · müşteri başına {money.format(customers.length ? totalSpent / customers.length / 100 : 0)} · {orderCount.toLocaleString("tr-TR")} siparişten</p>
        </div>
        <div className="talep-bas-eylem">
          {canManage ? <a className="panel-secondary" href="/api/disari-aktar/musteriler">CSV indir</a> : null}
        </div>
      </header>

      {truncated ? <KNot ton="uyari">Müşteri görünümü en yeni 20.000 siparişten hesaplandı; daha eski siparişler toplamlara dâhil değil.</KNot> : null}

      <nav className="kayit-serit talep-serit" aria-label="Segmente göre süz">
        <dl>
          {SEGMENTS.map(([key, label]) => (
            <div key={key} className={[segment === key ? "is-active" : "", key === "risk" && counts[key] ? "is-uyari" : ""].filter(Boolean).join(" ") || undefined}>
              <dt>{label}</dt>
              <dd><Link prefetch={false} href={listHref(state, { segment: key, page: 1 })} aria-current={segment === key ? "page" : undefined}>{counts[key].toLocaleString("tr-TR")}</Link></dd>
            </div>
          ))}
        </dl>
      </nav>

      <section className="panel-card talep-bilgi" aria-label="Müşteri listesi">
        <div className="ekip-suzgec talep-suzgec">
          {SORTS.map(([key, label]) => (
            <Link prefetch={false} key={key} href={listHref(state, { sort: key, page: 1 })} className={sort === key ? "is-active" : undefined} aria-current={sort === key ? "page" : undefined}>{label}</Link>
          ))}
          <form className="talep-ara" role="search">
            {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
            {sort !== "spent" ? <input type="hidden" name="sort" value={sort} /> : null}
            <input name="q" defaultValue={search} placeholder="Ad veya e-posta ile ara" aria-label="Müşterilerde ara" />
          </form>
        </div>

        {visible.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="musteriler">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th className="crm-col-amount">Sipariş</th>
                  <th className="crm-col-amount">Net harcama</th>
                  <th>Son sipariş</th>
                  <th>Segment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((customer) => {
                  const href = `/musteriler/${encodeURIComponent(customer.key)}`;
                  const etiketler = customerTags(customer, now);
                  return (
                    <tr key={customer.key}>
                      <td data-label="Müşteri">
                        <Link prefetch={false} className="crm-row-link" href={href} title={customer.name}>{customer.name}</Link>
                        <small className="crm-cell-sub" title={customer.email || undefined}>{customer.email || "E-posta yok"}</small>
                      </td>
                      <td className="crm-col-amount" data-label="Sipariş">
                        <b>{customer.orders}</b>
                        <small className="crm-cell-sub">{customer.orders === customer.paidOrders ? "sipariş" : `${customer.orders - customer.paidOrders} iptal/iade`}</small>
                      </td>
                      <td className="crm-col-amount" data-label="Net harcama">
                        <b>{money.format(customer.spent / 100)}</b>
                        <small className="crm-cell-sub">ort. {money.format(customer.paidOrders ? customer.spent / customer.paidOrders / 100 : 0)}</small>
                      </td>
                      <td data-label="Son sipariş">
                        {dateFormat.format(new Date(customer.lastOrderAt))}
                        <small className="crm-cell-sub">{daysAgo(customer.lastOrderAt, now)}</small>
                      </td>
                      <td data-label="Segment"><span className="musteri-etiketler">{etiketler.map((tag) => <span className="status-pill" data-tone={rozetTonu(tag.tone)} key={tag.label}>{tag.label}</span>)}</span></td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                      <MobilSatir
                        href={href}
                        baslik={customer.name}
                        durum={etiketler[0] ? { etiket: etiketler[0].label, ton: rozetTonu(etiketler[0].tone) } : null}
                        alt={[customer.email || "E-posta yok", `son ${daysAgo(customer.lastOrderAt, now)}`]}
                        isaretler={[
                          { metin: money.format(customer.spent / 100), ton: "guclu" },
                          { metin: `${customer.orders} sipariş`, ton: "sessiz" },
                        ]}
                      />
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
            {pageCount > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {page > 1 ? <Link prefetch={false} href={listHref(state, { page: page - 1 })}>← Önceki</Link> : <span aria-disabled="true">← Önceki</span>}
                <b>{Math.min(page, pageCount)} / {pageCount} · {sorted.length.toLocaleString("tr-TR")} müşteri</b>
                {page < pageCount ? <Link prefetch={false} href={listHref(state, { page: page + 1 })}>Sonraki →</Link> : <span aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </div>
        ) : (
          /*
            Müşteri listesi siparişlerden türüyor; hiç müşteri yoksa
            değiştirilecek bir segment de yok.
          */
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{customers.length === 0 ? "Henüz müşteri yok" : "Bu ölçütlere uygun müşteri yok"}</h2>
            <p>{customers.length === 0
              ? "Müşteri kaydı siparişlerden oluşuyor: vitrinden ilk sipariş geldiğinde alıcı burada görünür."
              : `Ad ve e-postada arama yapılır. “Uzun süredir yok”: son siparişi ${RISK_DAYS} günden eski.`}</p>
            <div className="crm-empty-actions">
              {filtreli ? <Link prefetch={false} className="panel-secondary" href="/musteriler">Süzgeci temizle</Link> : null}
              {customers.length === 0 ? <Link prefetch={false} className="panel-primary" href="/siparisler">Siparişlere git</Link> : null}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
