import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { calculateRefund } from "@/lib/refund";
import { formatPersonName } from "@/lib/format-name";
import { iadeTedarikcileri, iadeYonu, type GonderiEslesme, type SiparisKalemiEslesme } from "@/lib/iade-yonlendirme";
import { fetchAllRows } from "@/lib/fetch-all";
import { iadeIstatistikBaslangici, iadeIstatistikleri, type IstatistikIadesi } from "@/lib/iade-istatistik";
import { gorunumSorgusu, IADE_DURUMLARI, SIPARIS_DONEMLERI } from "@/lib/kayitli-gorunum";
import { iadeRozeti } from "@/lib/iade-durumu";
import { gorunumleriOku } from "../../gorunumler/oku";
import { GorunumKaydet, KayitliGorunumler } from "@/components/panel/kayitli-gorunumler";
import { IstatistikKarti, degisimYazisi, kisaPara, tamPara } from "@/components/arvo-ui/istatistik-karti";
import { IadeTablosu, type IadeSatiri } from "./iade-tablosu";
// Liste kalıbı (talep-*, crm-data-table): sayfa kullandığı sınıfın CSS'ini kendi import eder.
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./iadeler.css";

/*
  İADE TALEPLERİ LİSTESİ.

  16.10.2026'da sipariş listesinin kalıbına geçti. Öncesinde ekran kart
  kart akıyordu: her talep ekranın yarısını kaplayan bir kart, her
  kartın içinde karar formu, hepsi tek sayfada ve `limit(50)` ile —
  sayfalama, arama ve dönem süzgeci yoktu. Elli talebin birini bulmak
  sonsuz kaydırmak, iki talebi karşılaştırmak imkânsızdı.

  Artık siparişlerle aynı iskelet: durum şeridi, solda tablo, sağda
  istatistik kartı, kaydedilmiş görünümler ve sunucuda süzme/sayma/
  sayfalama. Karar verme DETAY sayfasına taşındı
  (iadeler/[id]): para iadesi geri alınamayan bir işlem ve listede
  yanlış satıra basmaya çok yakındı.
*/

const PAGE_SIZE = 50;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const DURUMLAR = IADE_DURUMLARI;
const PERIODS = SIPARIS_DONEMLERI;
type DurumKey = (typeof DURUMLAR)[number][0];
type PeriodKey = (typeof PERIODS)[number][0];

type ListeDurumu = { q: string; filter: DurumKey; period: PeriodKey; page: number };

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

function listHref(durum: ListeDurumu, yama: Partial<ListeDurumu>) {
  const sonraki = { ...durum, ...yama };
  const sorgu = new URLSearchParams();
  if (sonraki.q) sorgu.set("q", sonraki.q);
  /* "beklemede" varsayılan: adrese yazılmıyor (kayıtlı görünümle aynı kural). */
  if (sonraki.filter !== "beklemede") sorgu.set("filter", sonraki.filter);
  if (sonraki.period !== "all") sorgu.set("period", sonraki.period);
  if (sonraki.page > 1) sorgu.set("page", String(sonraki.page));
  const metin = sorgu.toString();
  return metin ? `/siparisler/iadeler?${metin}` : "/siparisler/iadeler";
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function simdi() {
  return Date.now();
}

type Params = { q?: string; filter?: string; period?: string; page?: string };

export default async function IadelerSayfasi({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  /* Karar PayTR iadesini tetikleyebildiği için sahip ve yönetici verir. */
  const canResolve = ["owner", "admin"].includes(membership.role);

  /*
    Arama metni PostgREST `or` süzgecine giriyor; virgül ve parantez
    süzgeç sözdiziminin parçası, temizlenmezse kutuya yazılan metin
    süzgeci değiştirebilir.
  */
  const search = (params.q ?? "").replace(/[,()*\\]/g, " ").trim().slice(0, 80);
  const filter: DurumKey = DURUMLAR.some(([key]) => key === params.filter) ? (params.filter as DurumKey) : "beklemede";
  const period: PeriodKey = PERIODS.some(([key]) => key === params.period) ? (params.period as PeriodKey) : "all";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const durum: ListeDurumu = { q: search, filter, period, page };
  const aktifSorgu = gorunumSorgusu("iadeler", params as Record<string, string | undefined>);
  const since = periodStart(period);

  /*
    ARAMA İKİ ADIMDA. Aranan alanlar (sipariş numarası, müşteri adı,
    e-posta) iade talebinde değil SİPARİŞTE duruyor ve PostgREST tek bir
    `or` içinde ana tabloyla gömülü tabloyu birleştiremiyor. Sipariş
    kimlikleri önce toplanıyor — sipariş listesindeki "sorunlu kargo"
    süzgeci de aynı yolu kullanıyor.

    Hata YUTULMUYOR: yutulsaydı arama "sonuç yok" der ve kullanıcı
    talebin silindiğini sanardı.
  */
  const ARAMA_TAVANI = 300;
  let aramaSiparisIdleri: string[] | null = null;
  if (search) {
    const { data: siparisler, error: aramaHatasi } = await supabase
      .from("arc_orders")
      .select("id")
      .eq("organization_id", organization.id)
      .or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`)
      /* Kimlikler sonraki sorgunun ADRESİNDE taşınıyor; tavan bu yüzden
         var (uuid başına ~37 karakter). Tavana değildiyse ekranda yazıyor:
         sessizce daraltılan bir arama "talep yok" demenin en kolay yolu. */
      .limit(ARAMA_TAVANI);
    if (aramaHatasi) throw new Error("Arama yapılamadı: " + aramaHatasi.message);
    aramaSiparisIdleri = [...new Set(((siparisler ?? []) as { id: string }[]).map((s) => s.id))];
  }
  const aramaDaraldi = aramaSiparisIdleri !== null && aramaSiparisIdleri.length >= ARAMA_TAVANI;

  /* Süzgeç hem listeye hem şerit sayılarına aynı biçimde uygulanır. */
  /*
    Arayüz DAR tutuluyor (sipariş listesinde de böyle): PostgREST'in
    sorgu tipi özyinelemeli, fazladan bir yöntem yazıldığında tsc
    "type instantiation is excessively deep" diyip duruyor.
  */
  type Suzulebilir<T> = { gte(column: string, value: string): T; or(filters: string): T };
  const scoped = <T extends Suzulebilir<T>>(sorgu: T): T => {
    let sonraki = sorgu;
    if (since) sonraki = sonraki.gte("created_at", since);
    if (aramaSiparisIdleri) {
      /*
        Kimlik süzgeci `.in()` ile değil `or(order_id.in.(…))` ile
        yazılıyor: ortak süzgeç yardımcısının yapısal tipi `.in()`
        yöntemini taşıyamıyor (tsc "type instantiation is excessively
        deep and possibly infinite" diyip duruyor), `or` metin aldığı
        için taşıyor ve sonuç birebir aynı. Değerler veritabanından
        gelen uuid'ler, yani süzgeç sözdizimine giremezler.

        Hiç eşleşme yoksa olmayan bir kimlik: boş liste `in.()`
        PostgREST'te sözdizimi hatası.
      */
      const idler = aramaSiparisIdleri.length ? aramaSiparisIdleri : ["00000000-0000-0000-0000-000000000000"];
      sonraki = sonraki.or(`order_id.in.(${idler.join(",")})`);
    }
    return sonraki;
  };
  const sayimSorgusu = (anahtar: DurumKey) => {
    const sorgu = scoped(supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id));
    return anahtar === "all" ? sorgu : sorgu.eq("status", anahtar);
  };

  let listeSorgusu = scoped(
    supabase
      .from("arc_return_requests")
      /*
        SİPARİŞ ALANLARI GÖMÜLÜ SEÇİLMİYOR, ikinci turda kimliklerle
        çekiliyor. İki sebep: gömülü seçim sorgunun TypeScript tipini
        öyle derinleştiriyor ki ortak süzgeç yardımcısına verilemiyor
        (tsc "type instantiation is excessively deep" diyor) ve sayfa
        kalemleri, gönderileri ve varyantları zaten aynı yoldan
        topluyor. Ortak süzgeç önemli: şerit sayıları ile liste aynı
        süzgeçten geçmezse listede bir şey görünüp rozette başka sayı
        yazar.
      */
      .select("id,order_id,items,reason,note,status,status_note,refund_amount,created_at,resolved_at", { count: "exact" })
      .eq("organization_id", organization.id),
  );
  if (filter !== "all") listeSorgusu = listeSorgusu.eq("status", filter);
  const from = (page - 1) * PAGE_SIZE;

  /*
    İSTATİSTİK PENCERESİ (sağdaki kart): son altı ay, süzgeçten
    bağımsız. 1000'lik sayfalarla okunuyor; tek istek Supabase'in satır
    tavanında kesilir ve yoğun ayda sayılar sessizce eksilirdi.
  */
  const istatistikAni = simdi();
  const istatistikPenceresi = fetchAllRows<IstatistikIadesi>((bas, son) =>
    supabase.from("arc_return_requests")
      .select("status,refund_amount,reason,created_at,resolved_at")
      .eq("organization_id", organization.id)
      .gte("created_at", new Date(iadeIstatistikBaslangici(istatistikAni)).toISOString())
      .order("created_at", { ascending: false })
      .range(bas, son) as unknown as PromiseLike<{ data: IstatistikIadesi[] | null; error: { message: string } | null }>,
  );

  const [listeSonucu, talepSayimi, gorunumler, istatistikSonucu, ...sayimlar] = await Promise.all([
    listeSorgusu.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    /*
      Mağaza HİÇ iade talebi almış mı? Şeritteki sayılar arama ve dönem
      süzgecinden geçtiği için sıfır olmaları hem hiç talep olmamasını
      hem sonuçsuz aramayı anlatabiliyor; boş ekran ikisine farklı şey
      söylemeli.
    */
    supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    gorunumleriOku(supabase, organization.id, "iadeler"),
    istatistikPenceresi,
    ...DURUMLAR.map(([key]) => sayimSorgusu(key)),
  ]);

  /* Son sayfanın ötesine gidilirse PostgREST PGRST103 döner: boş liste say. */
  if (listeSonucu.error && listeSonucu.error.code !== "PGRST103") throw new Error("İade talepleri okunamadı: " + listeSonucu.error.message);
  /* Sayım düşerse "hiç talep yok" VARSAYILMIYOR: dolu bir mağazaya
     taleplerinin kaybolduğunu düşündürürdü. */
  if (talepSayimi.error) throw new Error("Talep sayısı okunamadı: " + talepSayimi.error.message);
  if (istatistikSonucu.rows.length === 0 && (talepSayimi.count ?? 0) > 0) {
    /* Pencere boş ama kayıt var: altı aydan eski talepler. Hata değil. */
  }

  const sayilar = Object.fromEntries(DURUMLAR.map(([key], sira) => [key, sayimlar[sira]?.count ?? 0])) as Record<DurumKey, number>;
  const toplam = listeSonucu.count ?? sayilar[filter];
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / PAGE_SIZE));

  type TalepSatiri = {
    id: string;
    order_id: string;
    items: unknown;
    reason: string | null;
    status: string;
    refund_amount: number | null;
    created_at: string;
  };
  const talepler = (listeSonucu.data ?? []) as unknown as TalepSatiri[];

  /*
    İADE NEREYE DÖNECEK? Ekranda yalnızca ürün adı ve tutar olsaydı
    operasyoncu her talep için sipariş detayına gidip hangi tedarikçiden
    ve hangi paketten geldiğine bakmak zorunda kalırdı; iki tedarikçiyle
    çalışıldığı için bu her talepte tekrarlanan bir arama demekti.

    Tek turda çekiliyor: talep başına sorgu, elli talepte elli tur olurdu.
  */
  type SiparisOzeti = {
    id: string; order_number: string; status: string; total: number; shipping: number | null;
    customer_name: string | null; customer_email: string | null;
  };
  const siparisIdleri = [...new Set(talepler.map((talep) => talep.order_id))];
  const [{ data: siparisSatirlari, error: siparisHatasi }, { data: siparisKalemleri }, { data: gonderiSatirlari }] = siparisIdleri.length
    ? await Promise.all([
        supabase.from("arc_orders").select("id,order_number,status,total,shipping,customer_name,customer_email")
          .eq("organization_id", organization.id).in("id", siparisIdleri),
        supabase.from("arc_order_items").select("id,order_id,sku")
          .eq("organization_id", organization.id).in("order_id", siparisIdleri),
        supabase.from("arc_shipments").select("id,order_id,sequence,status,carrier_name,tracking_number,arc_shipment_items(order_item_id)")
          .eq("organization_id", organization.id).in("order_id", siparisIdleri),
      ])
    : [{ data: [], error: null }, { data: [] }, { data: [] }];
  /*
    Sipariş okunamazsa HATA: müşteri adı, tutar ve kargo bedeli oradan
    geliyor. Yutulsaydı liste her talebi "Sipariş bulunamadı · ₺0,00"
    diye gösterirdi — yani yanlış değil, emin emin yanlış.
  */
  if (siparisHatasi) throw new Error("İadelerin siparişleri okunamadı: " + siparisHatasi.message);
  const siparisById = new Map(((siparisSatirlari ?? []) as SiparisOzeti[]).map((siparis) => [siparis.id, siparis]));

  /* Tedarikçi sipariş kaleminde saklı değil, varyanttan geliyor. */
  const skular = [...new Set(((siparisKalemleri ?? []) as Array<{ sku: string | null }>).map((k) => k.sku).filter((x): x is string => Boolean(x)))];
  const { data: varyantlar } = skular.length
    ? await supabase.from("arc_product_variants").select("sku,supplier").eq("organization_id", organization.id).in("sku", skular)
    : { data: [] };
  const tedarikciBySku = new Map(((varyantlar ?? []) as Array<{ sku: string; supplier: string | null }>).map((v) => [v.sku, v.supplier]));

  const kalemlerBySiparis = new Map<string, SiparisKalemiEslesme[]>();
  for (const kalem of (siparisKalemleri ?? []) as Array<{ id: string; order_id: string; sku: string | null }>) {
    const liste = kalemlerBySiparis.get(kalem.order_id) ?? [];
    liste.push({ id: kalem.id, sku: kalem.sku, tedarikci: kalem.sku ? tedarikciBySku.get(kalem.sku) ?? null : null });
    kalemlerBySiparis.set(kalem.order_id, liste);
  }

  const gonderilerBySiparis = new Map<string, GonderiEslesme[]>();
  for (const satir of (gonderiSatirlari ?? []) as Array<{ id: string; order_id: string; sequence: number; status: string; carrier_name: string | null; tracking_number: string | null; arc_shipment_items: { order_item_id: string }[] | null }>) {
    const liste = gonderilerBySiparis.get(satir.order_id) ?? [];
    liste.push({
      id: satir.id, sequence: satir.sequence, status: satir.status,
      carrier_name: satir.carrier_name, tracking_number: satir.tracking_number,
      kalemIdleri: (satir.arc_shipment_items ?? []).map((k) => k.order_item_id),
    });
    gonderilerBySiparis.set(satir.order_id, liste);
  }

  const an = simdi();
  const satirlar: IadeSatiri[] = talepler.map((talep) => {
    const siparis = siparisById.get(talep.order_id) ?? null;
    /*
      KALEMLER DİZİ Mİ? `items` jsonb ve müşterinin tarayıcısından gelen
      bir listeyi taşıyor; nesne ya da metin geldiğinde `.reduce`
      sayfanın tamamını çökertirdi. Boş dizi saymak doğru: tutar sıfır
      görünür ama ekran açılır ve talep sonuçlandırılabilir.
    */
    const kalemler = (Array.isArray(talep.items) ? talep.items : []) as Array<{ name?: string; sku?: string; quantity?: number; total?: number }>;
    const kalemToplami = kalemler.reduce((sum, kalem) => sum + Number(kalem.total ?? 0), 0);
    /* Tutar sunucudakiyle AYNI fonksiyondan: ekranda yazan ile gönderilen ayrışmasın. */
    const hesap = calculateRefund({
      itemsTotal: kalemToplami,
      orderTotal: siparis?.total ?? 0,
      shipping: siparis?.shipping,
      orderStatus: siparis?.status,
    });
    const yonler = kalemler.map((kalem) =>
      iadeYonu(kalem.sku, kalemlerBySiparis.get(talep.order_id) ?? [], gonderilerBySiparis.get(talep.order_id) ?? []),
    );
    const tamamlandi = talep.status === "tamamlandi";
    const bekliyor = talep.status === "beklemede" || talep.status === "onaylandi";
    return {
      id: talep.id,
      siparisId: talep.order_id,
      siparisNo: siparis?.order_number ?? "Sipariş bulunamadı",
      /* Ad "Adı Soyadı" biçiminde: vitrinde müşteri kendisi yazıyor ve
         aynı listede BÜYÜK ve küçük harfli adlar yan yana duruyordu. */
      musteri: formatPersonName(siparis?.customer_name) || siparis?.customer_email || "Misafir müşteri",
      eposta: siparis?.customer_name ? siparis?.customer_email ?? "" : "",
      tarih: dateFormat.format(new Date(talep.created_at)),
      /* Adet eksik ya da bozuksa bir sayılıyor: kalem var, adedi bilinmiyor. */
      kalemAdedi: kalemler.reduce((toplam, kalem) => {
        const adet = Number(kalem.quantity);
        return toplam + (Number.isFinite(adet) && adet > 0 ? adet : 1);
      }, 0),
      kalemOzeti: kalemler.map((kalem) => kalem.name ?? kalem.sku ?? "Ürün").join(" · ") || "Kalem bilgisi yok",
      /* Tamamlanan talepte GÖNDERİLEN tutar, ötekinde hesaplanan. */
      tutar: money.format((tamamlandi ? Number(talep.refund_amount ?? 0) : hesap.amount) / 100),
      tutarAlt: tamamlandi ? "iade edildi" : hesap.shippingRefund > 0 ? "kargo bedeli dahil" : null,
      durum: iadeRozeti(talep.status),
      bekleyenSaat: bekliyor ? Math.max(0, Math.floor((an - Date.parse(talep.created_at)) / 3_600_000)) : null,
      tedarikciler: iadeTedarikcileri(yonler),
      onaylanabilir: talep.status === "beklemede",
      tamamlanabilir: talep.status === "onaylandi",
    };
  });

  const istatistik = iadeIstatistikleri(istatistikSonucu.rows, istatistikAni);
  const filtreli = Boolean(search) || period !== "all";
  const hicTalepYok = (talepSayimi.count ?? 0) === 0;

  return (
    <main className="talep cari ekip talepler teklifler liste-sayfa iade-listesi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">İadeler</small>
          <h1>İade talepleri</h1>
          <p className="talep-bas-alt">
            {sayilar.beklemede
              ? `${sayilar.beklemede.toLocaleString("tr-TR")} talep karar bekliyor${istatistik.enYasliBekleyenSaat !== null && istatistik.enYasliBekleyenSaat >= 48 ? ` · en eskisi ${Math.floor(istatistik.enYasliBekleyenSaat / 24)} gündür açık` : ""}.`
              : "Karar bekleyen talep yok."}
          </p>
        </div>
        <div className="talep-bas-eylem">
          <Link prefetch={false} className="panel-secondary" href="/siparisler">← Siparişler</Link>
        </div>
      </header>

      <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
        <dl>
          {DURUMLAR.map(([key, label]) => (
            <div
              key={key}
              className={[
                filter === key ? "is-active" : "",
                /* Bekleyen talep varken sütun uyarı rengine geçiyor: bu
                   ekranın tek acil işi o. */
                key === "beklemede" && sayilar[key] ? "is-uyari" : "",
              ].filter(Boolean).join(" ") || undefined}
            >
              <dt>{label}</dt>
              <dd>
                <Link prefetch={false} href={listHref(durum, { filter: key, page: 1 })} aria-current={filter === key ? "page" : undefined}>
                  {sayilar[key].toLocaleString("tr-TR")}
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </nav>

      {/* Solda liste, sağda istatistikler: sipariş listesiyle aynı ızgara. */}
      <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="İade talepleri listesi">
          <div className="ekip-suzgec talep-suzgec">
            {PERIODS.map(([key, label]) => (
              <Link prefetch={false} key={key} href={listHref(durum, { period: key, page: 1 })} className={period === key ? "is-active" : undefined} aria-current={period === key ? "page" : undefined}>{label}</Link>
            ))}
            <form className="talep-ara" role="search">
              {filter !== "beklemede" ? <input type="hidden" name="filter" value={filter} /> : null}
              {period !== "all" ? <input type="hidden" name="period" value={period} /> : null}
              <input name="q" defaultValue={search} placeholder="Sipariş no, müşteri veya e-posta" aria-label="İade taleplerinde ara" />
            </form>
            <GorunumKaydet liste="iadeler" aktifSorgu={aktifSorgu} gorunumler={gorunumler} canManage={canResolve} />
          </div>

          {aramaDaraldi ? (
            <p className="list-hint">Arama en çok {ARAMA_TAVANI} siparişi kapsıyor; daha fazlası varsa aramayı daraltın.</p>
          ) : null}

          <KayitliGorunumler liste="iadeler" gorunumler={gorunumler} aktifSorgu={aktifSorgu} canManage={canResolve} />

          <IadeTablosu
            key={JSON.stringify(params)}
            satirlar={satirlar}
            canResolve={canResolve}
            bos={
              <div className="crm-empty-state talep-bos-kutu">
                <h2>{hicTalepYok ? "Henüz iade talebi yok" : filtreli ? "Bu ölçütlere uygun talep yok" : "Bu durumda talep yok"}</h2>
                <p>
                  {hicTalepYok
                    ? "Müşteriler iade talebini mağazadaki sipariş sayfasından oluşturur; yeni talepler “Bekleyenler”e düşer."
                    : filtreli
                      ? "Durumu, dönemi veya aramayı değiştirin. Sipariş numarası, müşteri adı ve e-postada arama yapılır."
                      : "Bu durumda bekleyen iş yok. Başka bir duruma geçebilirsiniz."}
                </p>
                {filtreli ? (
                  <div className="crm-empty-actions">
                    <Link prefetch={false} className="panel-secondary" href={listHref({ q: "", filter, period: "all", page: 1 }, {})}>Süzgeci temizle</Link>
                  </div>
                ) : null}
              </div>
            }
          >
            {sayfaSayisi > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {page > 1
                  ? <Link prefetch={false} href={listHref(durum, { page: page - 1 })}>← Önceki</Link>
                  : <span aria-disabled="true">← Önceki</span>}
                <b>{page} / {sayfaSayisi} · {toplam.toLocaleString("tr-TR")} talep</b>
                {page < sayfaSayisi
                  ? <Link prefetch={false} href={listHref(durum, { page: page + 1 })}>Sonraki →</Link>
                  : <span aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </IadeTablosu>
        </section>

        <IstatistikKarti
          kapsam={istatistikSonucu.truncated ? "son 6 ay · ilk 20.000 talep" : "son 6 ay · süzgeçten bağımsız"}
          kutular={[
            {
              ad: "Son 30 gün",
              deger: istatistik.son30.toLocaleString("tr-TR"),
              alt: degisimYazisi(istatistik.talepDegisimi) ?? "talep",
              /* Artan iade İYİ haber değil: ton tersine çevrildi. */
              ton: istatistik.talepDegisimi !== null && istatistik.talepDegisimi > 0 ? "uyari" : undefined,
            },
            {
              ad: "İade edilen · 30 gün",
              deger: tamPara(istatistik.iade30),
              alt: degisimYazisi(istatistik.iadeDegisimi) ?? "gönderilen para",
              ton: istatistik.iadeDegisimi !== null && istatistik.iadeDegisimi > 0 ? "uyari" : undefined,
            },
            {
              ad: "Ortalama karar",
              deger: istatistik.ortalamaKararSaati === null ? "—" : istatistik.ortalamaKararSaati < 24 ? `${istatistik.ortalamaKararSaati} sa` : `${Math.round(istatistik.ortalamaKararSaati / 24)} gün`,
              alt: istatistik.enYasliBekleyenSaat === null ? "bekleyen yok" : `en eski bekleyen ${istatistik.enYasliBekleyenSaat < 24 ? `${istatistik.enYasliBekleyenSaat} sa` : `${Math.floor(istatistik.enYasliBekleyenSaat / 24)} gün`}`,
              ton: (istatistik.enYasliBekleyenSaat ?? 0) >= 48 ? "uyari" : undefined,
            },
            {
              ad: "Ret oranı",
              deger: istatistik.redOrani === null ? "—" : `%${istatistik.redOrani}`,
              alt: `${istatistik.red30} ret · 30 gün`,
            },
          ]}
          gruplar={[
            { baslik: "Son 6 ay · iade edilen", satirlar: istatistik.aylik.map((ay) => ({ ad: ay.ad, adet: ay.tutar, etiket: `${kisaPara(ay.tutar)} · ${ay.adet}` })) },
            { baslik: "Sebebe göre · 30 gün", satirlar: istatistik.sebepler.slice(0, 6).map((s) => ({ ad: s.sebep, adet: s.adet })) },
          ]}
        />
      </div>
    </main>
  );
}
