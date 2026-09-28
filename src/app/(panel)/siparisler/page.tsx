import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderBadge, sourceLabel } from "@/lib/commerce-labels";
import { nextOrderStep } from "@/lib/order-flow";
import { gonderiSorunlu, kargoGorunumu } from "@/lib/kargo-bolme";
import { siparisKari } from "@/lib/siparis-kari";
import { isBankTransfer } from "@/lib/payment-method";
import { PanelBildirimi } from "@/components/panel/bildirim";
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
type ListState = { q: string; filter: StatusKey; period: PeriodKey; page: number; kargo: "" | "sorunlu" };


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
  if (next.kargo) query.set("kargo", next.kargo);
  if (next.period !== "all") query.set("period", next.period);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/siparisler?${text}` : "/siparisler";
}

type Params = { q?: string; filter?: string; period?: string; page?: string; kargo?: string };

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
  /*
    SORUNLU KARGO SÜZGECİ. Uyarı listesindeki "Sorunlu gönderi" buraya
    bağlanıyor: OTO'nun returned/lost/failed durumları arc_shipments'ta
    "failed" oluyor ve o paketi görmenin başka yolu yoktu — gönderiler
    sipariş detayının içinde yaşıyor, ayrı bir listesi yok.
  */
  const kargo: ListState["kargo"] = params.kargo === "sorunlu" ? "sorunlu" : "";
  const state: ListState = { q: search, filter: statusFilter, period, page, kargo };
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
      .select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,created_at,metadata", { count: "exact" })
      .eq("organization_id", organization.id),
  );
  if (statusFilter !== "all") listQuery = listQuery.eq("status", statusFilter);
  /*
    Sipariş kimlikleri önce toplanıyor: PostgREST'te ilişkili tabloya
    göre süzmek select şeklini değiştiriyor ve liste tipini bozardı.
    Sorunlu gönderi az sayıda olur; sınır 500'de.
  */
  if (kargo === "sorunlu") {
    const { data: sorunlular, error: sorunluHatasi } = await supabase.from("arc_shipments")
      .select("order_id").eq("organization_id", organization.id).eq("status", "failed").limit(500);
    /*
      Hata YUTULMUYOR. Yutulsaydı liste boş kalır ve süzgeç "sorunlu
      gönderi yok" derdi: amacı sorun göstermek olan bir ekranın
      sessizce temiz görünmesi, hata sayfasından çok daha kötü.
      Sayfanın geri kalanı da hatada düşüyor (productsError).
    */
    if (sorunluHatasi) throw new Error("Sorunlu gönderiler okunamadı: " + sorunluHatasi.message);
    const idler = [...new Set(((sorunlular ?? []) as { order_id: string }[]).map((s) => s.order_id))];
    /* Hiç yoksa boş liste: .in("id", []) PostgREST'te hata veriyor. */
    listQuery = idler.length ? listQuery.in("id", idler) : listQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const from = (page - 1) * PAGE_SIZE;

  /*
    Manuel sipariş için varyant listesi yalnızca yetkili kullanıcıda
    çekilir. Tüm katalog değil, kendi ürünlerimiz: manuel sipariş
    telefonla gelen siparişler için, tedarikçi kataloğu için değil.
  */
  const [listResult, variantsResult, returnsResult, sorunluResult, siparisSayimi, ...countResults] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    canManage
      ? supabase.from("arc_product_variants").select("id,product_id,sku,price,stock,allow_backorder").eq("organization_id", organization.id).is("supplier", null).order("sku").limit(500)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "beklemede"),
    supabase.from("arc_shipments").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "failed"),
    /*
      Mağaza HİÇ sipariş almış mı? counts.all arama ve dönem
      süzgecinden geçtiği için sıfır olması hem boş mağazayı hem
      sonuçsuz aramayı anlatabiliyor; boş ekran ikisine farklı şey
      söylüyor. head:true, satır taşımıyor.
    */
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    ...STATUS_TABS.map(([key]) => countQuery(key)),
  ]);

  /* Son sayfanın ötesine gidilirse PostgREST PGRST103 döner: boş liste say. */
  if (listResult.error && listResult.error.code !== "PGRST103") throw new Error(listResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);
  /* Sayım düşerse "hiç sipariş yok" VARSAYILMIYOR; hatayı yutmak dolu
     mağazaya siparişlerinin kaybolduğunu düşündürürdü. */
  if (siparisSayimi.error) throw new Error(siparisSayimi.error.message);

  const counts = Object.fromEntries(STATUS_TABS.map(([key], index) => [key, countResults[index]?.count ?? 0])) as Record<StatusKey, number>;
  const total = listResult.count ?? counts[statusFilter];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pendingReturns = returnsResult.count ?? 0;
  const sorunluKargo = sorunluResult.count ?? 0;

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

  /*
    KÂR ve KARGO DURUMU listedeki siparişler için tek turda çekiliyor.
    Sipariş başına sorgu, elli satırda elli tur demekti.
  */
  const listeIdleri = (listResult.data ?? []).map((order) => order.id);
  const [{ data: listeKalemleri }, { data: listeGonderileri }] = listeIdleri.length
    ? await Promise.all([
        /*
          MALİYET KALEMİN KENDİSİNDE. Önce varyantın BUGÜNKÜ cost_price
          değeri okunuyordu ve tedarikçi fiyatı değişince geçmiş
          siparişlerin kârı da değişmiş görünüyordu. Artık satış anında
          donuyor (tetikleyici private.arc_order_item_cost); varyant
          sorgusu da gerekmiyor.
        */
        supabase.from("arc_order_items").select("id,order_id,quantity,total,cost_price")
          .eq("organization_id", organization.id).in("order_id", listeIdleri),
        supabase.from("arc_shipments").select("order_id,status,arc_shipment_items(order_item_id,quantity)")
          .eq("organization_id", organization.id).in("order_id", listeIdleri),
      ])
    : [{ data: [] }, { data: [] }];

  type ListeKalemi = { id: string; order_id: string; quantity: number; total: number; cost_price: number | null };
  const kalemler = (listeKalemleri ?? []) as ListeKalemi[];

  const kalemlerBySiparis = new Map<string, ListeKalemi[]>();
  for (const kalem of kalemler) {
    const liste = kalemlerBySiparis.get(kalem.order_id) ?? [];
    liste.push(kalem);
    kalemlerBySiparis.set(kalem.order_id, liste);
  }

  type ListeGonderi = { order_id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null };
  const gonderilerBySiparis = new Map<string, ListeGonderi[]>();
  for (const gonderi of (listeGonderileri ?? []) as ListeGonderi[]) {
    const liste = gonderilerBySiparis.get(gonderi.order_id) ?? [];
    liste.push(gonderi);
    gonderilerBySiparis.set(gonderi.order_id, liste);
  }

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
    transfer: isBankTransfer(order.metadata),
    kar: (() => {
      const kalem = kalemlerBySiparis.get(order.id) ?? [];
      const sonuc = siparisKari(
        kalem.map((k) => ({ toplamKurus: k.total, adet: k.quantity, maliyetKurus: k.cost_price })),
        order.status,
        order.payment_status,
      );
      return sonuc ? { tutar: money.format(sonuc.kurus / 100), oran: sonuc.oran, eksi: sonuc.kurus < 0 } : null;
    })(),
    kargo: (() => {
      /*
        Kargo durumu gönderilerden TÜRETİLİYOR, ayrı bir sütunda
        tutulmuyor: sipariş detayındaki özetle aynı fonksiyon
        (kargoDurumu), iki ekran aynı siparişe farklı şey demesin.
      */
      const gonderiler = (gonderilerBySiparis.get(order.id) ?? []).map((g) => ({
        id: g.order_id,
        status: g.status,
        items: g.arc_shipment_items ?? [],
      }));
      const siparisKalemleri = (kalemlerBySiparis.get(order.id) ?? []).map((k) => ({ id: k.id, quantity: k.quantity, product_name: "" }));
      return {
        durum: kargoGorunumu(siparisKalemleri, gonderiler),
        sorunlu: gonderiler.some((g) => gonderiSorunlu(g.status)),
      };
    })(),
  }));

  const metrics = [
    { label: "Onay bekliyor", value: counts.pending, note: "Onayla adımında", filter: "pending" as const, tone: counts.pending ? "warn" : undefined },
    { label: "Hazırlanacak", value: counts.confirmed, note: "Onaylandı, hazırlanmadı", filter: "confirmed" as const, tone: counts.confirmed ? "warn" : undefined },
    { label: "Hazırlanıyor", value: counts.processing, note: "Kargoya verilecek", filter: "processing" as const, tone: undefined },
  ];

  /*
    İade talebi de sayılıyor: o kutu çiplerde karşılığı olmayan tek
    kutu (iade TALEBİ, iade edilmiş sipariş değil) ve bekleyen bir
    talep varken şeridi gizlemek o işi görünmez yapardı.
  */
  const ozetGorunsun = metrics.some((metric) => metric.value > 0) || pendingReturns > 0;

  return <>
    <section className="ac-bar">
      <div>
        <h1>Siparişler</h1>
        {/* İpucu buraya taşındı: liste üstünde ayrı bir bant olarak 56px tutuyordu. */}
        <p>{counts.all.toLocaleString("tr-TR")} sipariş · {periodLabel}{search ? ` · “${search}”` : ""} · satıra tıklayarak detayı açın{canManage ? ", kutucuklarla toplu işlem yapın" : ""}</p>
      </div>
      <OrdersTabs active="orders" pendingReturns={pendingReturns} canExport={canManage} />
    </section>

    <div className="ac-stack">
      {/* Sonuç ÇEREZDEN geliyor; adres satırındaki ?error= artık
          okunmuyor: dışarıdan gönderilen bağlantı uydurma mesaj
          gösterebiliyordu (lib/panel-bildirim.ts). */}
      <PanelBildirimi />

      {/*
        ÖZET ŞERİDİ YALNIZCA İŞ VARKEN GÖRÜNÜYOR.

        Üç kutunun üçü de filtre çipleriyle AYNI bağlantıya ve aynı sayıya
        gidiyor (?filter=pending / confirmed / processing); çipler zaten
        44px'te aynı bilgiyi veriyor. Hepsi sıfırken şerit 114px'i sıfır
        göstermeye harcıyordu: 900px'lik ekranda ilk sipariş satırı 555.
        pikselde başlıyor, 40 kayıttan 8'i görünüyordu (canlıda ölçüldü,
        27.09.2026). Şerit gizlenince 11 satır görünüyor.

        Sıfır olmayan bir sayı varsa şerit geri geliyor: o zaman bekleyen
        iş demektir ve tam da göze çarpması gereken şeydir.
      */}
      {ozetGorunsun ? (
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
      ) : null}

      <section className="ac ac-pad-sm list-toolbar">
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
        {/*
          SORUNLU KARGO çipi yalnızca sorun VARKEN görünüyor. Sıfır
          gösteren bir çip, bugün üç listede kaldırdığımız gürültünün
          aynısı olurdu; bu çip zaten olağan dışı bir duruma işaret
          ediyor.
        */}
        {kargo === "sorunlu" || sorunluKargo > 0 ? (
          <Link
            prefetch={false}
            className="ac-btn order-chip-danger"
            href={listHref(state, { kargo: kargo === "sorunlu" ? "" : "sorunlu", page: 1 })}
            aria-current={kargo === "sorunlu" ? "page" : undefined}
          >
            Sorunlu kargo
            <span className="ac-count">{sorunluKargo.toLocaleString("tr-TR")}</span>
          </Link>
        ) : null}
      </nav>

      <OrderTable key={JSON.stringify(params)} rows={rows} canManage={canManage} canDelete={["owner","admin"].includes(membership.role)} back={listHref(state, {})} siparisYok={(siparisSayimi.count ?? 0) === 0}>
        <div className="list-pagination">
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
