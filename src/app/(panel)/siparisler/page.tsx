import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderBadge, sourceLabel } from "@/lib/commerce-labels";
import { nextOrderStep } from "@/lib/order-flow";
import { Notice } from "@/components/panel/notice";
import { OrderForm } from "./order-form";
import { OrderTable, type OrderRow } from "./order-table";
import { OrdersTabs } from "./orders-tabs";
import "./orders.css";

const PAGE_SIZE = 50;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const STATUS_TABS = [
  ["all", "Tümü"],
  ["pending", "Bekliyor"],
  ["confirmed", "Onaylandı"],
  ["processing", "Hazırlanıyor"],
  ["fulfilled", "Tamamlandı"],
  ["cancelled", "İptal"],
  ["refunded", "İade"],
] as const;

const PERIODS = [
  ["all", "Tümü", "Tüm zamanlar"],
  ["today", "Bugün", "Bugün"],
  ["7", "7 gün", "Son 7 gün"],
  ["30", "30 gün", "Son 30 gün"],
] as const;

type StatusKey = (typeof STATUS_TABS)[number][0];
type PeriodKey = (typeof PERIODS)[number][0];
type ListState = { q: string; filter: StatusKey; period: PeriodKey; page: number };

const ERRORS: Record<string, string> = {
  "order-closed": "Bu sipariş kapandığı (iptal ya da iade) için akışta ilerletilemez.",
  "order-not-found": "Sipariş bulunamadı.",
  forbidden: "Bu işlem için yetkiniz yok.",
  "invalid-status": "Geçersiz sipariş durumu.",
  "invalid-order": "Sipariş bilgileri eksik.",
  "save-failed": "Durum kaydedilemedi, tekrar deneyin.",
  "bulk-empty": "Toplu işlem için sipariş seçilmedi.",
};

/* Dönem Türkiye saatine göre gün başından sayılır (UTC+3). */
function periodStart(period: PeriodKey) {
  const offset = 3 * 3_600_000;
  const day = 86_400_000;
  const todayStart = Math.floor((Date.now() + offset) / day) * day - offset;
  if (period === "today") return new Date(todayStart).toISOString();
  if (period === "7") return new Date(todayStart - 6 * day).toISOString();
  if (period === "30") return new Date(todayStart - 29 * day).toISOString();
  return null;
}

function listHref(state: ListState, patch: Partial<ListState>) {
  const next = { ...state, ...patch };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.filter !== "all") query.set("filter", next.filter);
  if (next.period !== "all") query.set("period", next.period);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/siparisler?${text}` : "/siparisler";
}

type Params = { error?: string; created?: string; ok?: string; q?: string; filter?: string; period?: string; page?: string; updated?: string; skipped?: string };

export default async function Orders({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  /*
    Arama metni PostgREST `or` filtresine yazılıyor. Virgül ve
    parantez filtre sözdiziminin parçası: temizlenmezse arama
    kutusuna yazılan metin filtreyi değiştirebiliyordu.
  */
  const search = (params.q ?? "").replace(/[,()*\\]/g, " ").trim().slice(0, 80);
  const statusFilter: StatusKey = STATUS_TABS.some(([key]) => key === params.filter) ? (params.filter as StatusKey) : "all";
  const period: PeriodKey = PERIODS.some(([key]) => key === params.period) ? (params.period as PeriodKey) : "all";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const state: ListState = { q: search, filter: statusFilter, period, page };
  const since = periodStart(period);
  const periodLabel = PERIODS.find(([key]) => key === period)?.[2] ?? "Tüm zamanlar";

  /* Arama ve dönem hem listeye hem sekme sayaçlarına uygulanır. */
  type Filterable<T> = { gte(column: string, value: string): T; or(filters: string): T };
  const scoped = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (since) next = next.gte("created_at", since);
    if (search) next = next.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
    return next;
  };
  const countQuery = (status: StatusKey) => {
    const query = scoped(supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id));
    return status === "all" ? query : query.eq("status", status);
  };

  let listQuery = scoped(
    supabase
      .from("arc_orders")
      .select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,created_at", { count: "exact" })
      .eq("organization_id", organization.id),
  );
  if (statusFilter !== "all") listQuery = listQuery.eq("status", statusFilter);
  const from = (page - 1) * PAGE_SIZE;

  /*
    Manuel sipariş için varyant listesi yalnızca yetkili kullanıcıda
    çekilir. Tüm katalog değil, kendi ürünlerimiz: manuel sipariş
    telefonla gelen siparişler için, tedarikçi kataloğu için değil.
  */
  const [listResult, variantsResult, returnsResult, ...countResults] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    canManage
      ? supabase.from("arc_product_variants").select("id,product_id,sku,price,stock,allow_backorder").eq("organization_id", organization.id).is("supplier", null).order("sku").limit(500)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "beklemede"),
    ...STATUS_TABS.map(([key]) => countQuery(key)),
  ]);

  /* Son sayfanın ötesine gidilirse PostgREST PGRST103 döner: boş liste say. */
  if (listResult.error && listResult.error.code !== "PGRST103") throw new Error(listResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);

  const counts = Object.fromEntries(STATUS_TABS.map(([key], index) => [key, countResults[index]?.count ?? 0])) as Record<StatusKey, number>;
  const total = listResult.count ?? counts[statusFilter];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pendingReturns = returnsResult.count ?? 0;

  const variants = variantsResult.data ?? [];
  const variantProductIds = [...new Set(variants.map((variant) => variant.product_id))];
  const { data: products, error: productsError } = variantProductIds.length
    ? await supabase.from("arc_products").select("id,name,status").in("id", variantProductIds)
    : { data: [], error: null };
  if (productsError) throw new Error(productsError.message);
  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const variantOptions = variants.map((variant) => {
    const product = productById.get(variant.product_id);
    return { id: variant.id, label: `${product?.name ?? "Ürün"} · ${variant.sku} · stok ${variant.stock}${variant.allow_backorder ? " · stoksuz satış açık" : ""}` };
  });

  const rows: OrderRow[] = (listResult.data ?? []).map((order) => ({
    id: order.id,
    number: order.order_number,
    customer: order.customer_name || order.customer_email || "Misafir müşteri",
    email: order.customer_name ? order.customer_email ?? "" : "",
    source: sourceLabel(order.source),
    total: money.format(order.total / 100),
    date: dateFormat.format(new Date(order.created_at)),
    badge: orderBadge(order.status, order.payment_status),
    next: nextOrderStep(order.status, order.payment_status),
  }));

  const metrics = [
    { label: "Onay bekliyor", value: counts.pending, note: "Onayla adımında", filter: "pending" as const, tone: counts.pending ? "warn" : undefined },
    { label: "Hazırlanacak", value: counts.confirmed, note: "Onaylandı, hazırlanmadı", filter: "confirmed" as const, tone: counts.confirmed ? "warn" : undefined },
    { label: "Hazırlanıyor", value: counts.processing, note: "Kargoya verilecek", filter: "processing" as const, tone: undefined },
  ];

  return <>
    <section className="ac-bar">
      <div>
        <h1>Siparişler</h1>
        <p>{counts.all.toLocaleString("tr-TR")} sipariş · {periodLabel}{search ? ` · “${search}”` : ""}</p>
      </div>
      <OrdersTabs active="orders" pendingReturns={pendingReturns} />
    </section>

    <div className="ac-stack">
      {params.created ? <Notice title={`${params.created} siparişi oluşturuldu.`} /> : null}
      {params.ok === "status" ? <Notice title="Sipariş durumu güncellendi." /> : null}
      {params.ok === "bulk" ? (
        <Notice title={`${Number(params.updated ?? 0)} sipariş güncellendi.`}>
          {Number(params.skipped ?? 0) > 0 ? `${Number(params.skipped)} sipariş bu adıma uygun olmadığı için atlandı.` : null}
        </Notice>
      ) : null}
      {params.error ? <Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[params.error] ?? params.error}</Notice> : null}

      <section className="ac-metrics" aria-label="Sipariş özeti">
        {metrics.map((metric) => (
          <Link prefetch={false} className="ac-metric ac-lift" data-tone={metric.tone} href={listHref(state, { filter: metric.filter, page: 1 })} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value.toLocaleString("tr-TR")}</strong>
            <small>{metric.note}</small>
          </Link>
        ))}
        <Link prefetch={false} className="ac-metric ac-lift" data-tone={pendingReturns ? "warn" : undefined} href="/siparisler/iadeler">
          <span>İade talebi</span>
          <strong>{pendingReturns.toLocaleString("tr-TR")}</strong>
          <small>Karar bekliyor</small>
        </Link>
      </section>

      <section className="ac ac-pad-sm order-toolbar">
        <form className="ac-filter order-search" role="search">
          {statusFilter !== "all" ? <input type="hidden" name="filter" value={statusFilter} /> : null}
          {period !== "all" ? <input type="hidden" name="period" value={period} /> : null}
          <input name="q" defaultValue={search} placeholder="Sipariş no, müşteri veya e-posta" aria-label="Siparişlerde ara" />
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {search ? <Link prefetch={false} className="ac-btn" href={listHref(state, { q: "", page: 1 })}>Temizle</Link> : null}
        </form>
        <nav className="ac-filter" aria-label="Dönem">
          {PERIODS.map(([key, label]) => (
            <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { period: key, page: 1 })} aria-current={period === key ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      </section>

      {/*
        Durum filtreleri tek tıkla çalışır; her sekmede o durumdaki
        kayıt sayısı görünür (arama ve dönem dâhil).
      */}
      <nav className="ac-filter" aria-label="Sipariş durumu">
        {STATUS_TABS.map(([key, label]) => (
          <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { filter: key, page: 1 })} aria-current={statusFilter === key ? "page" : undefined}>
            {label}
            <span className="ac-count">{counts[key].toLocaleString("tr-TR")}</span>
          </Link>
        ))}
      </nav>

      <OrderTable key={JSON.stringify(params)} rows={rows} canManage={canManage} back={listHref(state, {})}>
        <div className="order-pagination">
          <span>{total ? `${(from + 1).toLocaleString("tr-TR")}–${(from + rows.length).toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} sipariş` : "Kayıt yok"}</span>
          {pageCount > 1 ? (
            <div>
              {page > 1 ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page - 1 })}>← Önceki</Link> : <span className="ac-btn" aria-disabled="true">← Önceki</span>}
              <span className="order-page-number">{page} / {pageCount}</span>
              {page < pageCount ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page + 1 })}>Sonraki →</Link> : <span className="ac-btn" aria-disabled="true">Sonraki →</span>}
            </div>
          ) : null}
        </div>
      </OrderTable>

      {/* Manuel sipariş listenin altında: günlük iş listeye bakmak,
          form ara sıra kullanılıyor. */}
      {canManage ? (
        <details className="ac ac-pad order-create">
          <summary>
            <span><b>Manuel sipariş oluştur</b><small>Telefonla veya elden alınan siparişler için · çok kalemli</small></span>
          </summary>
          <OrderForm variants={variantOptions} />
        </details>
      ) : null}
    </div>
  </>;
}
