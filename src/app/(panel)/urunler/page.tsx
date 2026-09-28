import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { createProduct, bulkUpdateStatus } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel } from "@/lib/commerce-labels";
import { yayinOzeti } from "@/lib/yayin-plani";
import { PanelBildirimi } from "@/components/panel/bildirim";
import { GorunumKaydet, KayitliGorunumler } from "@/components/panel/kayitli-gorunumler";
import { gorunumleriOku } from "../gorunumler/oku";
import { gorunumSorgusu, URUN_DURUMLARI, URUN_KAYNAKLARI } from "@/lib/kayitli-gorunum";
import { ProductTable, type ProductRow } from "./product-table";
import "../catalog.css";

const PAGE_SIZE = 24;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/*
  Durum ve kaynak listeleri lib/kayitli-gorunum.ts'de: kaydedilmiş
  görünüm sakladığı sorgunun geçerli olduğunu doğrulamak zorunda ve
  ikinci bir kopya, buraya eklenen yeni bir kaynağı görünmez kılardı.
*/
const STATUS_TABS = URUN_DURUMLARI;
const SOURCES = URUN_KAYNAKLARI;

type StatusKey = (typeof STATUS_TABS)[number][0];
type SourceKey = (typeof SOURCES)[number][0];
type ListState = { q: string; filter: StatusKey; source: SourceKey; page: number };
type ProductMeta = { images?: string[]; image_paths?: string[]; vendor?: string; type?: string; tags?: string };


function listHref(state: ListState, patch: Partial<ListState>) {
  const next = { ...state, ...patch };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.filter !== "all") query.set("filter", next.filter);
  if (next.source !== "all") query.set("source", next.source);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/urunler?${text}` : "/urunler";
}

type Params = { error?: string; created?: string; ok?: string; q?: string; filter?: string; source?: string; page?: string; updated?: string; skipped?: string; yeni?: string };

export default async function Products({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  /*
    Arama veritabanında yapılıyor.

    Öncesinde arama açıkken sayfalama kapanıyor, katalog belleğe
    çekilip orada süzülüyordu; Supabase 1000 satırda kestiği için
    3.264 ürünlük katalogda eski ürünler aramada hiç çıkmıyordu.

    Metin PostgREST `or` filtresine yazıldığı için virgül, parantez
    ve tırnak temizleniyor (filtre sözdiziminin parçaları).
  */
  const search = (params.q ?? "").replace(/[,()*\\"]/g, " ").trim().slice(0, 80);
  const statusFilter: StatusKey = STATUS_TABS.some(([key]) => key === params.filter) ? (params.filter as StatusKey) : "all";
  const source: SourceKey = SOURCES.some(([key]) => key === params.source) ? (params.source as SourceKey) : "all";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const state: ListState = { q: search, filter: statusFilter, source, page };
  /* Görünüm karşılaştırması için süzgecin kanonik hâli; sayfa numarası düşer. */
  const aktifSorgu = gorunumSorgusu("urunler", params as Record<string, string | undefined>);

  /* SKU varyantta duruyor: eşleşen varyantların ürünleri aramaya eklenir. */
  let skuProductIds: string[] = [];
  if (search) {
    const { data, error } = await supabase.from("arc_product_variants").select("product_id").eq("organization_id", organization.id).ilike("sku", `%${search}%`).limit(200);
    if (error) throw new Error(error.message);
    skuProductIds = [...new Set((data ?? []).map((row) => String(row.product_id)))];
  }

  /* Sorgu oluşturucunun genel türü burada çok derin açılıyor
     (TS2589); filtre yalnızca bu dar arayüz üzerinden uygulanır. */
  type Scopable = { or(filters: string): Scopable; eq(column: string, value: string): Scopable; is(column: string, value: null): Scopable };
  const scoped = <T,>(query: T): T => {
    let next = query as unknown as Scopable;
    if (source === "own") next = next.is("supplier", null);
    if (source === "tarzyeri") next = next.eq("supplier", "tarzyeri");
    if (search) {
      const filters = ["name", "description", "metadata->>vendor", "metadata->>type", "metadata->>tags"].map((column) => `${column}.ilike.%${search}%`);
      if (skuProductIds.length) filters.push(`id.in.(${skuProductIds.join(",")})`);
      next = next.or(filters.join(","));
    }
    return next as unknown as T;
  };
  const countQuery = (status: StatusKey) => {
    const query = scoped(supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id));
    return status === "all" ? query : query.eq("status", status);
  };

  /* Açıklama listede gösterilmiyor; uzun HTML'i çekmemek için seçilmiyor. */
  let listQuery = scoped(supabase.from("arc_products").select("id,name,status,source,supplier,metadata,created_at,publish_at,unpublish_at", { count: "exact" }).eq("organization_id", organization.id));
  if (statusFilter !== "all") listQuery = listQuery.eq("status", statusFilter);
  const from = (page - 1) * PAGE_SIZE;

  /*
    Katalogda HİÇ ürün var mı? counts.all arama ve kaynak süzgecinden
    geçiyor, yani sıfır olması hem boş kataloğu hem sonuçsuz aramayı
    anlatabiliyor. Boş ekran ikisine farklı şey söylediği için
    süzgeçsiz bir sayım gerekiyor — head:true, satır taşımıyor.
  */
  const [listResult, variantCountResult, bestSellerResult, katalogSayimi, gorunumler, ...countResults] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.from("arc_collections").select("id").eq("organization_id", organization.id).eq("title", "Çok Satanlar").eq("status", "active").maybeSingle(),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    gorunumleriOku(supabase, organization.id, "urunler"),
    ...STATUS_TABS.map(([key]) => countQuery(key)),
  ]);

  if (listResult.error && listResult.error.code !== "PGRST103") throw new Error(listResult.error.message);
  if (variantCountResult.error || bestSellerResult.error) throw new Error((variantCountResult.error ?? bestSellerResult.error)?.message ?? "Katalog sayıları okunamadı.");
  /*
    Sayım düşerse boş katalog VARSAYILMIYOR: hata yutulup "kataloğunuz
    boş" demek, dolu bir kataloğa sahip kullanıcıya ürünlerinin
    silindiğini düşündürürdü.
  */
  if (katalogSayimi.error) throw new Error(katalogSayimi.error.message);

  const counts = Object.fromEntries(STATUS_TABS.map(([key], index) => [key, countResults[index]?.count ?? 0])) as Record<StatusKey, number>;
  const total = listResult.count ?? counts[statusFilter];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const products = listResult.data ?? [];
  const productIds = products.map((product) => product.id);
  const bestSellerCollection = bestSellerResult.data;

  type Variant = { id: string; product_id: string; sku: string; title: string; price: number; compare_at_price: number | null; currency: string; stock: number; allow_backorder: boolean; cost_price: number | null; supplier: string | null };
  /*
    Sayfadaki ürünlerin varyantları sayfalanarak okunur: çok bedenli
    tedarikçi ürünlerinde bir sayfanın varyantları 1000 satırı
    aşabiliyor, sondaki ürünlerin stok ve fiyatı eksik görünüyordu.
  */
  const [variants, { data: bestSellerMemberships, error: bestSellerMembershipError }] = await Promise.all([
    productIds.length
      ? fetchAllRows<Variant>((from, to) => supabase.from("arc_product_variants").select("id,product_id,sku,title,price,compare_at_price,currency,stock,allow_backorder,cost_price,supplier").eq("organization_id", organization.id).in("product_id", productIds).order("id").range(from, to) as unknown as PromiseLike<{ data: Variant[] | null; error: { message: string } | null }>).then((result) => result.rows)
      : Promise.resolve([] as Variant[]),
    productIds.length && bestSellerCollection
      ? supabase.from("arc_collection_products").select("product_id").eq("organization_id", organization.id).eq("collection_id", bestSellerCollection.id).in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bestSellerMembershipError) throw new Error(bestSellerMembershipError.message ?? "Ürün rozetleri okunamadı.");

  const bestSellerIds = new Set((bestSellerMemberships ?? []).map((item) => item.product_id));
  const variantsByProduct = new Map<string, Variant[]>();
  for (const variant of variants ?? []) {
    const list = variantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    variantsByProduct.set(variant.product_id, list);
  }

  /*
    Görsel adresleri iki türlü saklanıyor:

    - Kendi ürünlerimiz: ArvoARC deposundaki göreli yol. İmzalı
      bağlantı üretilmesi gerekiyor.
    - Tedarikçi ürünleri: tedarikçi CDN'inin tam adresi. Doğrudan
      kullanılıyor.
  */
  const isRemote = (path: string) => path.startsWith("http");
  const storedPaths = products.flatMap((product) => {
    const path = ((product.metadata ?? {}) as ProductMeta).image_paths?.[0];
    return path && !isRemote(path) ? [path] : [];
  });
  const signedImageUrls = await createProductImageUrls(supabase, storedPaths);
  const signedByPath = new Map(storedPaths.map((path, index) => [path, signedImageUrls[index]]));

  const rows: ProductRow[] = products.map((product) => {
    const meta = (product.metadata ?? {}) as ProductMeta;
    const path = meta.image_paths?.[0];
    const image = (path ? (isRemote(path) ? path : signedByPath.get(path)) : undefined) ?? meta.images?.[0] ?? null;
    const pv = variantsByProduct.get(product.id) ?? [];
    const prices = pv.map((variant) => variant.price);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const discounted = pv.filter((variant) => (variant.compare_at_price ?? 0) > variant.price);
    const maxDiscount = discounted.length ? Math.max(...discounted.map((variant) => Math.round((1 - variant.price / (variant.compare_at_price ?? variant.price)) * 100))) : 0;
    const comparePrices = discounted.map((variant) => variant.compare_at_price ?? 0);

    /*
      Tedarikçi ürünlerinde alış maliyeti ve kâr. Kâr, en düşük
      satış fiyatı ile en yüksek maliyet üzerinden: en kötü
      senaryoyu göstermek daha güvenli.
    */
    const costs = pv.map((variant) => variant.cost_price).filter((value): value is number => typeof value === "number" && value > 0);
    const minCost = costs.length ? Math.min(...costs) : 0;
    const maxCost = costs.length ? Math.max(...costs) : 0;
    const profit = costs.length && prices.length ? minPrice - maxCost : 0;
    const margin = costs.length && maxCost > 0 ? Math.round((profit / maxCost) * 100) : 0;
    const totalStock = pv.reduce((sum, variant) => sum + variant.stock, 0);

    return {
      id: product.id,
      name: product.name,
      image,
      initials: product.name.slice(0, 2).toLocaleUpperCase("tr-TR"),
      meta: [pv[0]?.sku, `${pv.length} varyant`, meta.vendor].filter(Boolean).join(" · "),
      price: prices.length ? (minPrice === maxPrice ? money.format(minPrice / 100) : `${money.format(minPrice / 100)} – ${money.format(maxPrice / 100)}`) : "Fiyat yok",
      compare: comparePrices.length ? money.format(Math.max(...comparePrices) / 100) : "",
      discount: maxDiscount,
      cost: costs.length ? (minCost === maxCost ? money.format(minCost / 100) : `${money.format(minCost / 100)} – ${money.format(maxCost / 100)}`) : null,
      profit: costs.length ? `${profit > 0 ? "+" : ""}${money.format(profit / 100)} · %${margin}` : null,
      loss: profit <= 0,
      stock: totalStock,
      stockTone: totalStock < 0 ? "bad" : totalStock === 0 ? "warn" : undefined,
      status: product.status,
      /*
        ZAMANLANMIŞ ÜRÜN LİSTEDE AYIRT EDİLİYOR. Planı olan bir taslak,
        planı olmayandan görünüşte farksızdı: "hangi ürünler
        zamanlanmış" sorusunun ekranda karşılığı yoktu. Rozetin
        BAŞLIĞINA yazılıyor, yeni bir sütun açılmıyor — liste
        yoğunluğu bu panelde ölçülerek kazanıldı.
      */
      statusLabel: productStatusLabel(product.status),
      statusHint: yayinOzeti(product.publish_at, product.unpublish_at) || undefined,
      statusTone: product.status === "active" ? undefined : product.status === "draft" ? "warn" : "muted",
      bestSeller: bestSellerIds.has(product.id),
    };
  });

  return <>
    <section className="ac-bar">
      <div>
        <h1>Ürünler</h1>
        {/* İpucu buraya taşındı: liste üstünde ayrı bir bant olarak 56px tutuyordu. */}
        <p>{counts.all.toLocaleString("tr-TR")} ürün · {(variantCountResult.count ?? 0).toLocaleString("tr-TR")} varyant{search ? ` · “${search}”` : ""} · satıra tıklayarak düzenleyin{canManage ? ", kutucuklarla toplu işlem yapın" : ""}</p>
      </div>
      {canManage ? <div className="ac-bar-actions"><Link prefetch={false} className="ac-btn ac-btn-primary" href="/urunler?yeni=1#yeni-urun">+ Yeni ürün</Link></div> : null}
    </section>

    <div className="ac-stack">
      {/* Sonuç ÇEREZDEN geliyor; adres satırındaki ?error= artık
          okunmuyor: dışarıdan gönderilen bağlantı uydurma mesaj
          gösterebiliyordu (lib/panel-bildirim.ts). */}
      <PanelBildirimi />

      {/*
        ÖZET ŞERİDİ KALDIRILDI: taşıdığı dört sayının dördü de ekranda
        zaten vardı. Aktif/Taslak/Arşiv kutuları filtre çipleriyle aynı
        bağlantıya ve aynı sayıya gidiyordu; varyant sayısı da sayfanın
        alt başlığında yazıyor ("3.442 ürün · 15.740 varyant").

        Bedeli 114px'di: 900px'lik ekranda ilk ürün satırı 595. pikselde
        başlıyor ve 3.442 üründen 4'ü görünüyordu (canlıda ölçüldü,
        27.09.2026).
      */}

      <section className="ac ac-pad-sm list-toolbar">
        <form className="ac-filter catalog-search" role="search">
          {statusFilter !== "all" ? <input type="hidden" name="filter" value={statusFilter} /> : null}
          {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
          <input name="q" defaultValue={search} placeholder="Ürün adı, SKU, marka, tür veya etiket" aria-label="Ürünlerde ara" />
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {search ? <Link prefetch={false} className="ac-btn" href={listHref(state, { q: "", page: 1 })}>Temizle</Link> : null}
        </form>
        <nav className="ac-filter" aria-label="Ürün kaynağı">
          {SOURCES.map(([key, label]) => (
            <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { source: key, page: 1 })} aria-current={source === key ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <GorunumKaydet liste="urunler" aktifSorgu={aktifSorgu} gorunumler={gorunumler} canManage={canManage} />
      </section>

      {/* Şerit yalnızca kayıtlı görünüm varken çiziliyor; boşken hiç yer kaplamıyor. */}
      <KayitliGorunumler liste="urunler" gorunumler={gorunumler} aktifSorgu={aktifSorgu} canManage={canManage} />

      <nav className="ac-filter" aria-label="Ürün durumu">
        {STATUS_TABS.map(([key, label]) => (
          <Link prefetch={false} key={key} className="ac-btn" href={listHref(state, { filter: key, page: 1 })} aria-current={statusFilter === key ? "page" : undefined}>
            {label}
            <span className="ac-count">{counts[key].toLocaleString("tr-TR")}</span>
          </Link>
        ))}
      </nav>

      <ProductTable key={JSON.stringify(params)} rows={rows} canManage={canManage} back={listHref(state, {})} katalogBos={(katalogSayimi.count ?? 0) === 0}>
        <div className="list-pagination">
          <span>{total ? `${(from + 1).toLocaleString("tr-TR")}–${(from + rows.length).toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} ürün` : "Kayıt yok"}</span>
          {pageCount > 1 ? (
            <div>
              {page > 1 ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page - 1 })}>← Önceki</Link> : <span className="ac-btn" aria-disabled="true">← Önceki</span>}
              <span className="order-page-number">{page} / {pageCount}</span>
              {page < pageCount ? <Link prefetch={false} className="ac-btn" href={listHref(state, { page: page + 1 })}>Sonraki →</Link> : <span className="ac-btn" aria-disabled="true">Sonraki →</span>}
            </div>
          ) : null}
        </div>
      </ProductTable>

      {canManage ? (
        <details className="ac ac-pad catalog-details" id="yeni-urun" open={params.yeni === "1"}>
          <summary><span><b>Yeni ürün oluştur</b><small>Tek varyantla başlar; görsel, açıklama ve SEO sonra düzenleyicide eklenir</small></span></summary>
          <form action={createProduct} className="catalog-form">
            <label>Ürün adı<input name="name" required maxLength={200} className="ac-input" /></label>
            <label>SKU<input name="sku" required maxLength={80} className="ac-input" /></label>
            <label>Satış fiyatı (₺)<input name="price" type="number" min="0" step="0.01" required className="ac-input" /></label>
            <label>Karşılaştırma fiyatı (₺)<input name="compare_at_price" type="number" min="0" step="0.01" placeholder="İndirim yoksa boş" className="ac-input" /></label>
            <label>Başlangıç stoku<input name="stock" type="number" step="1" required defaultValue="0" className="ac-input" /></label>
            <label>Durum<select name="status" defaultValue="draft" className="ac-input"><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
            <label className="is-wide">Açıklama<textarea name="description" rows={4} className="ac-input" /></label>
            <div className="catalog-form-actions">
              <label className="check-inline"><input name="allow_backorder" type="checkbox" defaultChecked /> Stok yokken satışa devam et</label>
              <button className="ac-btn ac-btn-primary" type="submit">Ürün oluştur</button>
            </div>
          </form>
        </details>
      ) : null}

      {canManage ? (
        <details className="ac ac-pad catalog-details">
          <summary><span><b>Filtreye göre toplu durum değişikliği</b><small>Bir tedarikçinin veya koleksiyonun tüm ürünlerini tek seferde açıp kapatın</small></span></summary>
          <form action={bulkUpdateStatus} className="catalog-form is-narrow">
            <p className="list-hint">Listede seçerek toplu işlem yapabilirsiniz; bu form ise filtreye uyan <b>tüm</b> ürünleri değiştirir. En az bir tedarikçi veya koleksiyon seçilmesi zorunlu: filtresiz işlem tüm kataloğu değiştirir ve geri alması zordur.</p>
            <label>Tedarikçi<select name="supplier" className="ac-input"><option value="">Seçiniz</option><option value="tarzyeri">Tarzyeri</option></select></label>
            <label>Koleksiyon (isteğe bağlı, slug)<input name="collection" placeholder="örnek: erkek-t-shirt" className="ac-input" /></label>
            <label>Yalnızca şu durumdakiler<select name="current_status" className="ac-input"><option value="">Hepsi</option><option value="draft">Taslak</option><option value="active">Yayında</option><option value="archived">Arşiv</option></select></label>
            <label>Yeni durum<select name="status" required className="ac-input"><option value="active">Yayında</option><option value="draft">Taslak</option><option value="archived">Arşiv</option></select></label>
            <div className="catalog-form-actions"><button className="ac-btn ac-btn-primary" type="submit">Uygula</button></div>
          </form>
        </details>
      ) : null}
    </div>
  </>;
}
