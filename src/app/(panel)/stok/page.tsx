import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { adjustInventory } from "./actions";
import { inventoryKindLabel } from "@/lib/commerce-labels";
import { Icon } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import "../catalog.css";

const PAGE_SIZE = 50;
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

type FilterKey = "all" | "negative" | "zero" | "low" | "available" | "backorder";
type ListState = { q: string; filter: FilterKey; page: number };

const ERRORS: Record<string, string> = {
  forbidden: "Stok hareketi için yetkiniz yok.",
  "invalid-movement": "Miktar 1 veya daha büyük bir tam sayı olmalı.",
  "variant-not-found": "Bu SKU ile bir varyant bulunamadı.",
};

function listHref(state: ListState, patch: Partial<ListState>) {
  const next = { ...state, ...patch };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.filter !== "all") query.set("filter", next.filter);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/stok?${text}` : "/stok";
}

export default async function Stock({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; q?: string; filter?: string; page?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  const { data: settings, error: settingsError } = await supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id", organization.id).maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const lowStockThreshold = settings?.low_stock_threshold ?? 5;

  const FILTERS: [FilterKey, string][] = [
    ["all", "Tümü"],
    ["negative", "Negatif"],
    ["zero", "Sıfır"],
    ["low", `Düşük (1–${lowStockThreshold})`],
    ["available", "Stokta"],
    ["backorder", "Stoksuz satış"],
  ];

  const search = (params.q ?? "").replace(/[,()*\\"]/g, " ").trim().slice(0, 80);
  const stockFilter: FilterKey = FILTERS.some(([key]) => key === params.filter) ? (params.filter as FilterKey) : "all";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const state: ListState = { q: search, filter: stockFilter, page };

  /*
    Filtreleme ve sayım veritabanında. Öncesinde 15.000+ varyantın
    tamamı çekilip bellekte süzülüyordu; Supabase 1000 satırda
    kestiği için sayılar sessizce yanlıştı.

    Arama SKU'da ve ürün adında: ürün adıyla eşleşen ürünlerin
    varyantları da listelenir.
  */
  let nameProductIds: string[] = [];
  if (search) {
    const { data, error } = await supabase.from("arc_products").select("id").eq("organization_id", organization.id).ilike("name", `%${search}%`).limit(200);
    if (error) throw new Error(error.message);
    nameProductIds = (data ?? []).map((row) => String(row.id));
  }

  /* Sorgu oluşturucunun genel türü burada çok derin açılıyor
     (TS2589); filtre yalnızca bu dar arayüz üzerinden uygulanır. */
  type Narrowable = { lt(column: string, value: number): Narrowable; eq(column: string, value: number | boolean): Narrowable; gt(column: string, value: number): Narrowable; lte(column: string, value: number): Narrowable; or(filters: string): Narrowable };
  const narrowed = <T,>(query: T, filter: FilterKey): T => {
    let next = query as unknown as Narrowable;
    if (search) next = next.or([`sku.ilike.%${search}%`, ...(nameProductIds.length ? [`product_id.in.(${nameProductIds.join(",")})`] : [])].join(","));
    if (filter === "negative") next = next.lt("stock", 0);
    if (filter === "zero") next = next.eq("stock", 0);
    if (filter === "low") next = next.gt("stock", 0).lte("stock", lowStockThreshold);
    if (filter === "available") next = next.gt("stock", 0);
    if (filter === "backorder") next = next.eq("allow_backorder", true);
    return next as unknown as T;
  };
  const countQuery = (filter: FilterKey) =>
    narrowed(supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id), filter);
  const from = (page - 1) * PAGE_SIZE;

  const [listResult, movementsResult, unavailableResult, stockSumResult, ...countResults] = await Promise.all([
    narrowed(supabase.from("arc_product_variants").select("id,product_id,sku,title,stock,allow_backorder", { count: "exact" }).eq("organization_id", organization.id), stockFilter)
      .order("stock", { ascending: true })
      .order("sku", { ascending: true })
      .range(from, from + PAGE_SIZE - 1),
    supabase.from("arc_inventory_movements").select("id,variant_id,kind,quantity,note,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).lte("stock", 0).eq("allow_backorder", false),
    /* Toplam adet veritabanında toplanıyor; tüm varyantlar belleğe alınamaz. */
    supabase.rpc("arc_total_stock_units"),
    ...FILTERS.map(([key]) => countQuery(key)),
  ]);

  if (listResult.error && listResult.error.code !== "PGRST103") throw new Error(listResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);

  const counts = Object.fromEntries(FILTERS.map(([key], index) => [key, countResults[index]?.count ?? 0])) as Record<FilterKey, number>;
  const variants = listResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const total = listResult.count ?? counts[stockFilter];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stockSum = typeof stockSumResult.data === "number" ? stockSumResult.data : 0;
  const unavailable = unavailableResult.count ?? 0;

  /*
    Hareket geçmişindeki varyantlar listede olmayabilir (başka
    sayfa, başka filtre). Öncesinde bu satırlarda SKU yerine
    "SKU" yazıyordu; eksik olanlar ayrıca okunuyor.
  */
  const visibleById = new Map(variants.map((variant) => [variant.id, variant]));
  const missingIds = [...new Set(movements.map((movement) => movement.variant_id).filter((id) => !visibleById.has(id)))];
  const { data: movementVariants } = missingIds.length
    ? await supabase.from("arc_product_variants").select("id,product_id,sku").eq("organization_id", organization.id).in("id", missingIds)
    : { data: [] };
  const variantInfo = new Map<string, { product_id: string; sku: string }>([
    ...variants.map((variant) => [variant.id, { product_id: variant.product_id, sku: variant.sku }] as const),
    ...(movementVariants ?? []).map((variant) => [variant.id, { product_id: variant.product_id, sku: variant.sku }] as const),
  ]);

  const productIds = [...new Set([...variantInfo.values()].map((variant) => variant.product_id))];
  const { data: products } = productIds.length ? await supabase.from("arc_products").select("id,name").in("id", productIds) : { data: [] };
  const productName = new Map((products ?? []).map((product) => [product.id, product.name]));
  const back = listHref(state, {});

  const metrics = [
    { key: "negative" as const, label: "Negatif", value: counts.negative, note: "Tedarik gerekli", tone: counts.negative ? "bad" : undefined },
    { key: "zero" as const, label: "Stok sıfır", value: counts.zero, note: "Satış politikası kontrolü", tone: counts.zero ? "warn" : undefined },
    { key: "low" as const, label: "Düşük stok", value: counts.low, note: `1–${lowStockThreshold} adet arası`, tone: counts.low ? "warn" : undefined },
  ];

  return <>
    <section className="ac-bar">
      <div>
        <h1>Stok Yönetimi</h1>
        <p>Tüm değişiklikler hareket olarak kaydedilir.</p>
      </div>
      <div className="ac-bar-actions">
        {canManage ? <a className="ac-btn" href="/api/disari-aktar/stok"><Icon name="download" size={15} />CSV indir</a> : null}
      </div>
    </section>

    <div className="ac-stack">
      {params.updated ? <Notice title={params.updated === "1" ? "Stok hareketi kaydedildi." : `Stok hareketi kaydedildi · ${params.updated}`} /> : null}
      {params.error ? <Notice tone="error" title="Stok hareketi kaydedilemedi">{ERRORS[params.error] ?? params.error}</Notice> : null}

      <section className="ac-metrics" aria-label="Stok özeti">
        <article className="ac-metric">
          <span>Toplam stok</span>
          <strong>{stockSum.toLocaleString("tr-TR")}</strong>
          <small>{counts.all.toLocaleString("tr-TR")} varyant</small>
        </article>
        {metrics.map((metric) => (
          <Link prefetch={false} className="ac-metric ac-lift" data-tone={metric.tone} href={listHref(state, { filter: metric.key, page: 1 })} key={metric.key}>
            <span>{metric.label}</span>
            <strong>{metric.value.toLocaleString("tr-TR")}</strong>
            <small>{metric.note}</small>
          </Link>
        ))}
      </section>

      {counts.negative + unavailable > 0 ? (
        <Notice tone="warn" title={`${(counts.negative + unavailable).toLocaleString("tr-TR")} varyantta stok aksiyonu gerekiyor`}>
          {counts.negative.toLocaleString("tr-TR")} varyant negatif stokta; {unavailable.toLocaleString("tr-TR")} varyantta stok yok ve stoksuz satış kapalı (mağazada satın alınamıyor).
        </Notice>
      ) : null}

      <section className="ac ac-pad-sm catalog-toolbar">
        <form className="ac-filter catalog-search" role="search">
          {stockFilter !== "all" ? <input type="hidden" name="filter" value={stockFilter} /> : null}
          <input name="q" defaultValue={search} placeholder="SKU veya ürün adı" aria-label="Stokta ara" />
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {search ? <Link prefetch={false} className="ac-btn" href={listHref(state, { q: "", page: 1 })}>Temizle</Link> : null}
        </form>
      </section>

      <nav className="ac-filter" aria-label="Stok durumu">
        {FILTERS.map(([key, label]) => (
          <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { filter: key, page: 1 })} aria-current={stockFilter === key ? "page" : undefined}>
            {label}
            <span className="ac-count" data-tone={key === "negative" && counts[key] ? "warn" : undefined}>{counts[key].toLocaleString("tr-TR")}</span>
          </Link>
        ))}
      </nav>

      <section className="ac table list-table stock-list" data-manage={canManage ? "" : undefined}>
        <div className="ac-head ac-pad-sm list-table-head">
          <div>
            <h3>Varyantlar</h3>
            <p>En düşük stoktan başlayarak{canManage ? "; miktarı yazıp satırdan giriş veya çıkış yapın." : "."}</p>
          </div>
        </div>
        {variants.length ? (
          <>
            <div className="list-row th">
              <span className="sl-name">ÜRÜN</span>
              <span className="sl-sku">SKU</span>
              <span className="sl-qty">STOK</span>
              <span className="sl-policy">POLİTİKA</span>
              {canManage ? <span className="sl-adjust">HAREKET</span> : null}
            </div>
            {variants.map((variant) => (
              <div className="list-row" key={variant.id}>
                <span className="sl-name">
                  <Link prefetch={false} className="list-row-link" href={`/urunler/${variant.product_id}`}><b>{productName.get(variant.product_id) ?? "Ürün"}</b></Link>
                  <small>{variant.title && variant.title !== "Default" ? variant.title : "Tek varyant"}</small>
                </span>
                <span className="sl-sku">{variant.sku}</span>
                <span className="sl-qty">
                  <em className="stock-pill" data-tone={variant.stock < 0 ? "bad" : variant.stock === 0 ? "warn" : variant.stock <= lowStockThreshold ? "warn" : undefined}>{variant.stock.toLocaleString("tr-TR")}</em>
                </span>
                <span className="sl-policy">{variant.allow_backorder ? "Stoksuz satış açık" : "Stok zorunlu"}</span>
                {canManage ? (
                  <form action={adjustInventory} className="sl-adjust">
                    <input type="hidden" name="variant_id" value={variant.id} />
                    <input type="hidden" name="back" value={back} />
                    <input name="quantity" type="number" min="1" step="1" defaultValue="1" required className="ac-input" aria-label={`${variant.sku} hareket miktarı`} />
                    <button className="ac-btn" type="submit" name="direction" value="in" title="Stok girişi">+ Giriş</button>
                    <button className="ac-btn" type="submit" name="direction" value="out" title="Stok çıkışı">− Çıkış</button>
                  </form>
                ) : null}
              </div>
            ))}
          </>
        ) : (
          <div className="list-empty">
            <b>Bu ölçütlere uygun varyant yok.</b>
            <p>Aramayı veya filtreyi değiştirin.</p>
          </div>
        )}
        <div className="list-pagination">
          <span>{total ? `${(from + 1).toLocaleString("tr-TR")}–${(from + variants.length).toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} varyant` : "Kayıt yok"}</span>
          {pageCount > 1 ? (
            <div>
              {page > 1 ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page - 1 })}>← Önceki</Link> : <span className="ac-btn" aria-disabled="true">← Önceki</span>}
              <span className="order-page-number">{page} / {pageCount}</span>
              {page < pageCount ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page + 1 })}>Sonraki →</Link> : <span className="ac-btn" aria-disabled="true">Sonraki →</span>}
            </div>
          ) : null}
        </div>
      </section>

      {canManage ? (
        <details className="ac ac-pad catalog-details">
          <summary><span><b>Detaylı stok hareketi</b><small>SKU ile giriş, çıkış veya düzeltme; not ile birlikte kaydedilir</small></span></summary>
          <form action={adjustInventory} className="stock-detailed-form">
            <input type="hidden" name="back" value={back} />
            <label>SKU<input name="sku" required maxLength={80} className="ac-input" placeholder="Örn. AC-TS-MNT" autoComplete="off" /></label>
            <label>İşlem<select name="direction" defaultValue="in" className="ac-input"><option value="in">Stok girişi</option><option value="out">Stok çıkışı</option><option value="adjustment">Pozitif düzeltme</option></select></label>
            <label>Miktar<input name="quantity" type="number" min="1" step="1" required className="ac-input" /></label>
            <label>Not<input name="note" maxLength={300} className="ac-input" placeholder="Örn. Tedarikçi teslimatı #123" /></label>
            <button className="ac-btn ac-btn-primary" type="submit">Hareketi kaydet</button>
          </form>
        </details>
      ) : null}

      <section className="ac ac-pad">
        <div className="ac-head"><div><h3>Hareket geçmişi</h3><p>Son 20 işlem.</p></div></div>
        {movements.length ? (
          <ul className="stock-moves">
            {movements.map((movement) => {
              const info = variantInfo.get(movement.variant_id);
              const out = movement.quantity < 0;
              return (
                <li key={movement.id}>
                  <span className="stock-move-sign" data-out={out ? "" : undefined}>{out ? "−" : "+"}</span>
                  <div>
                    <b>{info ? <Link prefetch={false} href={`/urunler/${info.product_id}`}>{info.sku}</Link> : "Silinmiş varyant"} · {inventoryKindLabel(movement.kind)}</b>
                    <small>{[info ? productName.get(info.product_id) : null, movement.note, dateTime.format(new Date(movement.created_at))].filter(Boolean).join(" · ")}</small>
                  </div>
                  <strong data-out={out ? "" : undefined}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</strong>
                </li>
              );
            })}
          </ul>
        ) : <p className="catalog-hint">Henüz stok hareketi yok.</p>}
      </section>
    </div>
  </>;
}
