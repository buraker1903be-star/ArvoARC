import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderBadge, sourceLabel } from "@/lib/commerce-labels";
import { nextOrderStep } from "@/lib/order-flow";
import { gonderiSorunlu, kargoGorunumu } from "@/lib/kargo-bolme";
import { siparisKari } from "@/lib/siparis-kari";
import { isBankTransfer } from "@/lib/payment-method";
import { GorunumKaydet, KayitliGorunumler } from "@/components/panel/kayitli-gorunumler";
import { gorunumleriOku } from "../gorunumler/oku";
import { gorunumSorgusu, SIPARIS_DONEMLERI, SIPARIS_DURUMLARI } from "@/lib/kayitli-gorunum";
import { OrderForm } from "./order-form";
import { tamamlananlariArsivle } from "./actions";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { ARSIVLENEBILIR_DURUMLAR, arsivlenebilirMi } from "@/lib/order-flow";
import { OrderTable, type OrderRow } from "./order-table";
import { PanelDrawer } from "@/components/arvo-ui/panel-drawer";
import { IstatistikKarti, degisimYazisi, kisaPara, tamPara } from "@/components/arvo-ui/istatistik-karti";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatPersonName } from "@/lib/format-name";
import { istatistikBaslangici, siparisIstatistikleri, type IstatistikSiparisi } from "@/lib/siparis-istatistik";
// Liste kalıbı (talep-*, crm-data-table) ve kart dili: sayfa kullandığı sınıfın CSS'ini kendi import eder.
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./siparis-listesi.css";

const PAGE_SIZE = 50;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

/*
  Durum ve dönem listeleri lib/kayitli-gorunum.ts'de. Kaydedilmiş
  görünüm, sakladığı sorgunun geçerli olduğunu doğrulamak zorunda;
  ikinci bir kopya olsaydı buraya eklenen yeni bir durumu görünüm
  tanımaz ve sessizce düşürürdü.
*/
const STATUS_TABS = SIPARIS_DURUMLARI;
const PERIODS = SIPARIS_DONEMLERI;

type StatusKey = (typeof STATUS_TABS)[number][0];
type PeriodKey = (typeof PERIODS)[number][0];
type ListState = { q: string; filter: StatusKey; period: PeriodKey; page: number; kargo: "" | "sorunlu"; arsiv: boolean };


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
  if (next.arsiv) query.set("arsiv", "1");
  if (next.period !== "all") query.set("period", next.period);
  if (next.page > 1) query.set("page", String(next.page));
  const text = query.toString();
  return text ? `/siparisler?${text}` : "/siparisler";
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın (Ana Ekran ile aynı). */
function simdi() {
  return Date.now();
}

type Params = { q?: string; filter?: string; period?: string; page?: string; kargo?: string; arsiv?: string };

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
  /*
    ARŞİV (16.10.2026): liste varsayılan olarak arşivdekileri göstermiyor;
    ?arsiv=1 yalnızca arşivi gösterir. Şerit sayıları da aynı süzgeçten
    (scoped) geçiyor — AGENTS.md: şerit listeyle aynı süzgeçten.
  */
  const arsivde = params.arsiv === "1";
  const state: ListState = { q: search, filter: statusFilter, period, page, kargo, arsiv: arsivde };
  /*
    Görünüm karşılaştırması için süzgecin KANONİK hâli: sayfa numarası
    düşer, varsayılanlar yazılmaz, anahtarlar hep aynı sırada. Adres
    satırındaki metni doğrudan karşılaştırmak, "?period=7&filter=pending"
    ile "?filter=pending&period=7" için iki farklı sonuç verirdi.
  */
  const aktifSorgu = gorunumSorgusu("siparisler", params as Record<string, string | undefined>);
  const since = periodStart(period);

  /* Arama ve dönem hem listeye hem sekme sayaçlarına uygulanır. */
  type Filterable<T> = { gte(column: string, value: string): T; or(filters: string): T; is(column: string, value: null): T; not(column: string, operator: string, value: null): T };
  const scoped = <T extends Filterable<T>>(query: T): T => {
    let next = arsivde ? query.not("archived_at", "is", null) : query.is("archived_at", null);
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
    İSTATİSTİK PENCERESİ (sağdaki kart): son altı ay, süzgeçten bağımsız.
    1000'lik sayfalarla okunuyor (Ana Ekran ve Analitik ile aynı yöntem):
    tek istek Supabase'in satır tavanında kesilir ve yoğun ayda sayılar
    sessizce eksilirdi. Yalnızca hesabın gerektirdiği sütunlar.
  */
  const istatistikAni = simdi();
  const istatistikPenceresi = fetchAllRows<IstatistikSiparisi>((bas, son) =>
    supabase.from("arc_orders")
      .select("total,status,payment_status,refunded_amount:metadata->refunded_amount,created_at,source")
      .eq("organization_id", organization.id)
      .gte("created_at", new Date(istatistikBaslangici(istatistikAni)).toISOString())
      .order("created_at", { ascending: false })
      .range(bas, son) as unknown as PromiseLike<{ data: IstatistikSiparisi[] | null; error: { message: string } | null }>,
  );

  /*
    Manuel sipariş için varyant listesi yalnızca yetkili kullanıcıda
    çekilir. Tüm katalog değil, kendi ürünlerimiz: manuel sipariş
    telefonla gelen siparişler için, tedarikçi kataloğu için değil.
  */
  const [listResult, variantsResult, returnsResult, sorunluResult, siparisSayimi, gorunumler, istatistikSonucu, arsivSayimi, arsivlenecekSayimi, ...countResults] = await Promise.all([
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
    gorunumleriOku(supabase, organization.id, "siparisler"),
    istatistikPenceresi,
    /* Başlıktaki "Arşiv (n)" ve "Tamamlananları arşivle (n)": süzgeçten bağımsız, kurumun tamamı. */
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).not("archived_at", "is", null),
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).is("archived_at", null).in("status", [...ARSIVLENEBILIR_DURUMLAR]),
    ...STATUS_TABS.map(([key]) => countQuery(key)),
  ]);

  /* Son sayfanın ötesine gidilirse PostgREST PGRST103 döner: boş liste say. */
  if (listResult.error && listResult.error.code !== "PGRST103") throw new Error(listResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);
  /* Sayım düşerse "hiç sipariş yok" VARSAYILMIYOR; hatayı yutmak dolu
     mağazaya siparişlerinin kaybolduğunu düşündürürdü. */
  if (siparisSayimi.error) throw new Error(siparisSayimi.error.message);
  if (arsivSayimi.error) throw new Error("Arşiv sayılamadı: " + arsivSayimi.error.message);
  if (arsivlenecekSayimi.error) throw new Error("Arşivlenecek siparişler sayılamadı: " + arsivlenecekSayimi.error.message);
  const arsivSayisi = arsivSayimi.count ?? 0;
  const arsivlenecek = arsivlenecekSayimi.count ?? 0;

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
  /*
    Fiyat ve stok ARTIK ETİKETİN İÇİNDE DEĞİL, ayrı alanlarda: pencere
    satır ve sipariş toplamını kendisi hesaplıyor (order-form.tsx) ve
    stok uyarısını gönderimden önce veriyor. Etikette eskiden
    "stok 0 · stoksuz satış açık" yazıyordu; LR ürünlerinde stok hep 0
    ve stoksuz satış açık, yani 243 satırın hepsinde aynı cümle
    tekrarlıyor ve ürün adını kısaltıyordu.
  */
  const variantOptions = variants.map((variant) => {
    const product = productById.get(variant.product_id);
    return {
      id: variant.id,
      label: `${product?.name ?? "Ürün"} · ${variant.sku}`,
      price: variant.price ?? 0,
      stock: variant.stock ?? 0,
      backorder: Boolean(variant.allow_backorder),
    };
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
    /* Ad "Adı Soyadı" biçiminde (lib/format-name): vitrinde müşteri kendisi
       yazıyor, aynı listede BÜYÜK ve küçük harfli adlar yan yana duruyordu. */
    customer: formatPersonName(order.customer_name) || order.customer_email || "Misafir müşteri",
    email: order.customer_name ? order.customer_email ?? "" : "",
    source: sourceLabel(order.source),
    total: money.format(order.total / 100),
    date: dateFormat.format(new Date(order.created_at)),
    badge: orderBadge(order.status, order.payment_status),
    next: nextOrderStep(order.status, order.payment_status),
    arsivlenebilir: arsivlenebilirMi(order.status),
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

  /*
    DURUM ŞERİDİ (ArvoOS'un liste kalıbı, 16.10.2026). Eskiden üstte dört
    büyük kutu (onay bekliyor, hazırlanacak…) ve altında aynı sayıları
    tekrar eden durum çipleri vardı; şerit ikisinin yerini alıyor: her
    durum bir sütun, sayısı o durumla süzen bir bağlantı. İade talebi
    şeritte duruyor, çünkü çiplerde karşılığı olmayan tek iş o.
  */
  const istatistik = siparisIstatistikleri(istatistikSonucu.rows, istatistikAni);
  const filtreli = Boolean(search) || statusFilter !== "all" || period !== "all" || Boolean(kargo);

  return (
    <main className="talep cari ekip talepler teklifler liste-sayfa siparis-listesi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Siparişler</small>
          <h1>{arsivde ? "Arşiv" : "Siparişler"}</h1>
        </div>
        <div className="talep-bas-eylem">
          {arsivde
            ? <Link prefetch={false} className="panel-secondary" href="/siparisler">← Aktif siparişler</Link>
            : <Link prefetch={false} className="panel-secondary" href="/siparisler?arsiv=1">Arşiv ({arsivSayisi.toLocaleString("tr-TR")})</Link>}
          {/*
            TAMAMLANANLARI ARŞİVLE: kapanmış (tamamlandı, iptal, iade)
            bütün siparişler tek seferde. İade talebi bekleyenler kalır.
          */}
          {canManage && !arsivde && arsivlenecek > 0 ? (
            <form action={tamamlananlariArsivle}>
              <input type="hidden" name="back" value={listHref(state, {})} />
              <ConfirmSubmit className="panel-secondary" message={`${arsivlenecek} kapanmış sipariş (tamamlanan, iptal ve iade edilen) arşive taşınsın mı?\n\nKayıtlar silinmez; ciro ve raporlar saymaya devam eder. Arşivden görebilir, istediğinizi geri alabilirsiniz. İade talebi bekleyen siparişler listede kalır.`}>Tamamlananları arşivle ({arsivlenecek.toLocaleString("tr-TR")})</ConfirmSubmit>
            </form>
          ) : null}
          {canManage ? <a className="panel-secondary" href="/api/disari-aktar/siparisler">CSV indir</a> : null}
          {/* Manuel sipariş çekmecede: eskiden listenin dibinde açılır bir karttı. */}
          {canManage ? (
            <PanelDrawer triggerLabel="+ Manuel sipariş" title="Manuel sipariş" kicker="Siparişler" description="Telefonla veya elden alınan siparişler için · çok kalemli" genis>
              <OrderForm variants={variantOptions} />
            </PanelDrawer>
          ) : null}
        </div>
      </header>

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {STATUS_TABS.map(([key, label]) => (
            <div key={key} className={statusFilter === key ? "is-active" : undefined}>
              <dt>{label}</dt>
              <dd><Link prefetch={false} href={listHref(state, { filter: key, page: 1 })} aria-current={statusFilter === key ? "page" : undefined}>{counts[key].toLocaleString("tr-TR")}</Link></dd>
            </div>
          ))}
          <div className={pendingReturns ? "is-uyari" : undefined}>
            <dt>İade talebi</dt>
            <dd><Link prefetch={false} href="/siparisler/iadeler">{pendingReturns.toLocaleString("tr-TR")}</Link></dd>
          </div>
          {/*
            SORUNLU KARGO yalnızca sorun VARKEN: sıfır gösteren bir sütun
            gürültü olurdu; bu sütun olağan dışı bir duruma işaret ediyor.
          */}
          {kargo === "sorunlu" || sorunluKargo > 0 ? (
            <div className={kargo === "sorunlu" ? "is-active is-tehlike" : "is-tehlike"}>
              <dt>Sorunlu kargo</dt>
              <dd><Link prefetch={false} href={listHref(state, { kargo: kargo === "sorunlu" ? "" : "sorunlu", page: 1 })} aria-current={kargo === "sorunlu" ? "page" : undefined}>{sorunluKargo.toLocaleString("tr-TR")}</Link></dd>
            </div>
          ) : null}
        </dl>
      </nav>

      {/* Solda liste, sağda istatistikler: ArvoOS'un iş listesiyle aynı ızgara. */}
      <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Sipariş listesi">
        <div className="ekip-suzgec talep-suzgec">
          {PERIODS.map(([key, label]) => (
            <Link prefetch={false} key={key} href={listHref(state, { period: key, page: 1 })} className={period === key ? "is-active" : undefined} aria-current={period === key ? "page" : undefined}>{label}</Link>
          ))}
          <form className="talep-ara" role="search">
            {statusFilter !== "all" ? <input type="hidden" name="filter" value={statusFilter} /> : null}
            {period !== "all" ? <input type="hidden" name="period" value={period} /> : null}
            {kargo ? <input type="hidden" name="kargo" value={kargo} /> : null}
            {arsivde ? <input type="hidden" name="arsiv" value="1" /> : null}
            <input name="q" defaultValue={search} placeholder="Sipariş no, müşteri veya e-posta" aria-label="Siparişlerde ara" />
          </form>
          <GorunumKaydet liste="siparisler" aktifSorgu={aktifSorgu} gorunumler={gorunumler} canManage={canManage} />
        </div>

        {/* Şerit yalnızca kayıtlı görünüm varken çiziliyor; boşken hiç yer kaplamıyor. */}
        <KayitliGorunumler liste="siparisler" gorunumler={gorunumler} aktifSorgu={aktifSorgu} canManage={canManage} />

        <OrderTable
          key={JSON.stringify(params)}
          rows={rows}
          canManage={canManage}
          canDelete={["owner", "admin"].includes(membership.role)}
          back={listHref(state, {})}
          bos={
            /*
              Hiç sipariş almamış mağazaya "filtreyi değiştirin" demek,
              ortada olmayan bir filtreyi aratmaktı.
            */
            <div className="crm-empty-state talep-bos-kutu">
              <h2>{arsivde && !filtreli ? "Arşiv boş" : (siparisSayimi.count ?? 0) === 0 ? "Henüz sipariş yok" : "Bu ölçütlere uygun sipariş yok"}</h2>
              <p>{(siparisSayimi.count ?? 0) === 0
                ? "Vitrinden ilk sipariş geldiğinde burada görünür. Mağazanızı açıp alışveriş akışını kendiniz deneyebilirsiniz."
                : "Durumu, dönemi veya aramayı değiştirin. Sipariş numarası, müşteri adı ve e-postada arama yapılır."}</p>
              <div className="crm-empty-actions">
                {filtreli ? <Link prefetch={false} className="panel-secondary" href={arsivde ? "/siparisler?arsiv=1" : "/siparisler"}>Süzgeci temizle</Link> : null}
                {(siparisSayimi.count ?? 0) === 0 ? <a className="panel-primary" href="/magaza" target="_blank" rel="noreferrer">Mağazanı gör</a> : null}
                {(siparisSayimi.count ?? 0) === 0 ? <Link prefetch={false} className="panel-secondary" href="/veri-aktarimi">Eski siparişleri aktar</Link> : null}
              </div>
            </div>
          }
        >
          {/* Sayfalayıcı ArvoOS'taki gibi: tek sayfalık listede çizilmiyor, adres taşınıyor. */}
          {pageCount > 1 ? (
            <nav className="liste-sayfalar" aria-label="Sayfalar">
              {page > 1
                ? <Link prefetch={false} href={listHref(state, { page: page - 1 })}>← Önceki</Link>
                : <span aria-disabled="true">← Önceki</span>}
              <b>{page} / {pageCount} · {total.toLocaleString("tr-TR")} sipariş</b>
              {page < pageCount
                ? <Link prefetch={false} href={listHref(state, { page: page + 1 })}>Sonraki →</Link>
                : <span aria-disabled="true">Sonraki →</span>}
            </nav>
          ) : null}
        </OrderTable>
      </section>

      <IstatistikKarti
        kapsam={istatistikSonucu.truncated ? "son 6 ay · ilk 20.000 sipariş" : "son 6 ay · süzgeçten bağımsız"}
        kutular={[
          { ad: "Son 30 gün", deger: istatistik.son30.toLocaleString("tr-TR"), alt: degisimYazisi(istatistik.siparisDegisimi) ?? "sipariş", ton: istatistik.siparisDegisimi !== null && istatistik.siparisDegisimi < 0 ? "uyari" : istatistik.siparisDegisimi !== null ? "arti" : undefined },
          { ad: "Ciro · 30 gün", deger: tamPara(istatistik.ciro30), alt: degisimYazisi(istatistik.ciroDegisimi) ?? "iptal ve iadeler hariç", ton: istatistik.ciroDegisimi !== null && istatistik.ciroDegisimi < 0 ? "uyari" : istatistik.ciroDegisimi !== null ? "arti" : undefined },
          { ad: "Ortalama sepet", deger: istatistik.ortalamaSepet === null ? "—" : tamPara(istatistik.ortalamaSepet), alt: `${istatistik.ciroyaSayilan30} geçerli sipariş` },
          { ad: "İptal / iade", deger: istatistik.kapananOrani === null ? "—" : `%${istatistik.kapananOrani}`, alt: `${istatistik.kapanan30}/${istatistik.son30} sipariş · 30 gün`, ton: (istatistik.kapananOrani ?? 0) >= 20 ? "uyari" : undefined },
        ]}
        gruplar={[
          { baslik: "Son 6 ay · ciro", satirlar: istatistik.aylik.map((ay) => ({ ad: ay.ad, adet: ay.ciro, etiket: `${kisaPara(ay.ciro)} · ${ay.adet}` })) },
          { baslik: "Kaynağa göre · 30 gün", satirlar: istatistik.kaynaklar.map((k) => ({ ad: sourceLabel(k.kaynak), adet: k.adet })) },
        ]}
      />
      </div>
    </main>
  );
}
