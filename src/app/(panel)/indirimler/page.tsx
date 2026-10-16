import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Pencere } from "@/components/os/pencere";
import { createDiscount } from "./actions";
import { fetchAllRows } from "@/lib/fetch-all";
import { indirimIstatistikleri, urunIndirimOzeti, type IstatistikIndirimi } from "@/lib/indirim-istatistik";
import { gorunumSorgusu, INDIRIM_DURUMLARI, INDIRIM_TURLERI } from "@/lib/kayitli-gorunum";
import { gorunumleriOku } from "../gorunumler/oku";
import { GorunumKaydet, KayitliGorunumler } from "@/components/panel/kayitli-gorunumler";
import { IstatistikKarti } from "@/components/arvo-ui/istatistik-karti";
import { IndirimTablosu, type IndirimSatiri } from "./indirim-tablosu";
import { indirimDegeri, indirimDurumu, indirimTuruAdi } from "@/lib/indirim-bicim";
// Liste kalıbı (talep-*, crm-data-table) ve form ızgarası: sayfa kendi CSS'ini import eder.
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "../modules.css";
import "./indirimler.css";

/*
  İNDİRİMLER LİSTESİ.

  16.10.2026'da sipariş listesinin kalıbına geçti. Öncesinde ekran iki
  karttı: bütün kurallar tek sayfada (sorguda LİMİT YOKTU), ürün
  indirimleri ilk 500 varyanttan süzülüyordu ve şeritteki dört sayı o
  anda çekilmiş listeden, BELLEKTE hesaplanıyordu. Kampanya sayısı
  arttıkça sayılar sessizce eksilecekti; arama, süzgeç, sayfalama ve
  kampanya detayı yoktu — yazım hatası olan bir kuponu düzeltmenin tek
  yolu silip yeniden yaratmaktı, o da kullanım sayacını sıfırlıyordu.

  Artık süzme, sayma ve sayfalama SUNUCUDA; karar ve düzenleme
  kampanya detayında (indirimler/[id]).
*/

const PAGE_SIZE = 50;
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const kisaTarih = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });

const DURUMLAR = INDIRIM_DURUMLARI;
const TURLER = INDIRIM_TURLERI;
type DurumKey = (typeof DURUMLAR)[number][0];
type TurKey = (typeof TURLER)[number][0];

type ListeDurumu = { q: string; filter: DurumKey; tur: TurKey; biten: boolean; page: number };

function listHref(durum: ListeDurumu, yama: Partial<ListeDurumu>) {
  const sonraki = { ...durum, ...yama };
  const sorgu = new URLSearchParams();
  if (sonraki.q) sorgu.set("q", sonraki.q);
  if (sonraki.filter !== "all") sorgu.set("filter", sonraki.filter);
  if (sonraki.tur !== "all") sorgu.set("tur", sonraki.tur);
  if (sonraki.biten) sorgu.set("biten", "1");
  if (sonraki.page > 1) sorgu.set("page", String(sonraki.page));
  const metin = sorgu.toString();
  return metin ? `/indirimler?${metin}` : "/indirimler";
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın (lint react-hooks/purity). */
function simdi() {
  return Date.now();
}

type Params = { q?: string; filter?: string; tur?: string; biten?: string; page?: string; gorunum?: string; pencere?: string };

export default async function IndirimlerSayfasi({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  const search = (params.q ?? "").replace(/[,()*\\]/g, " ").trim().slice(0, 80);
  const filter: DurumKey = DURUMLAR.some(([key]) => key === params.filter) ? (params.filter as DurumKey) : "all";
  const tur: TurKey = TURLER.some(([key]) => key === params.tur) ? (params.tur as TurKey) : "all";
  const biten = params.biten === "1";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const urunGorunumu = params.gorunum === "urun";
  const durum: ListeDurumu = { q: search, filter, tur, biten, page };
  const aktifSorgu = gorunumSorgusu("indirimler", params as Record<string, string | undefined>);
  const an = simdi();
  const simdiIso = new Date(an).toISOString();

  /*
    Süzgeç hem listeye hem şerit sayılarına aynı biçimde uygulanıyor:
    iki ayrı yerde kurulan süzgeç, listede bir şey gösterip rozette
    başka sayı yazmanın en kolay yolu (AGENTS).

    Arayüz DAR: PostgREST'in sorgu tipi özyinelemeli, fazladan yöntem
    yazıldığında tsc "type instantiation is excessively deep" diyor.
  */
  type Suzulebilir<T> = {
    or(filters: string): T;
    is(column: string, value: null): T;
    not(column: string, operator: string, value: null): T;
    lt(column: string, value: string): T;
  };
  const scoped = <T extends Suzulebilir<T>>(sorgu: T): T => {
    let sonraki = sorgu;
    if (search) sonraki = sonraki.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    if (tur === "kupon") sonraki = sonraki.not("code", "is", null);
    if (tur === "otomatik") sonraki = sonraki.is("code", null);
    /* Süresi geçmiş: bitiş tarihi geçmiş olanlar. Durum alanı bunu
       söylemiyor — kuralı expired'a çeken bir iş yok. */
    if (biten) sonraki = sonraki.lt("ends_at", simdiIso);
    return sonraki;
  };
  const sayimSorgusu = (anahtar: DurumKey) => {
    const sorgu = scoped(supabase.from("arc_discounts").select("id", { count: "exact", head: true }).eq("organization_id", organization.id));
    return anahtar === "all" ? sorgu : sorgu.eq("status", anahtar);
  };

  let listeSorgusu = scoped(
    supabase.from("arc_discounts")
      .select("id,name,code,discount_type,value,minimum_subtotal,usage_limit,usage_count,starts_at,ends_at,status,combinable,created_at", { count: "exact" })
      .eq("organization_id", organization.id),
  );
  if (filter !== "all") listeSorgusu = listeSorgusu.eq("status", filter);
  const from = (page - 1) * PAGE_SIZE;

  /*
    İSTATİSTİK PENCERESİ (sağdaki kart): bütün kurallar, süzgeçten
    bağımsız. Kampanya sayısı sipariş kadar büyümüyor ama sınırsız
    okuma yine de yapılmıyor: sayfalı okuma tavana çarparsa ekranda
    yazıyor.
  */
  const istatistikPenceresi = fetchAllRows<IstatistikIndirimi>((bas, son) =>
    supabase.from("arc_discounts")
      .select("status,code,name,discount_type,value,usage_count,usage_limit,ends_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .range(bas, son) as unknown as PromiseLike<{ data: IstatistikIndirimi[] | null; error: { message: string } | null }>,
  );

  const [listeSonucu, kuralSayimi, bitenSayimi, gorunumler, istatistikSonucu, ...sayimlar] = await Promise.all([
    listeSorgusu.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    /* Mağazanın HİÇ kampanyası var mı? Şerit sayıları süzgeçten geçtiği
       için sıfır olmaları hem boş mağazayı hem sonuçsuz aramayı
       anlatabiliyor; boş ekran ikisine farklı şey söylemeli. */
    supabase.from("arc_discounts").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    /* Şeritteki uyarı sütunu: süzgeçten bağımsız, kurumun tamamı. */
    supabase.from("arc_discounts").select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("status", "active").lt("ends_at", simdiIso),
    gorunumleriOku(supabase, organization.id, "indirimler"),
    istatistikPenceresi,
    ...DURUMLAR.map(([key]) => sayimSorgusu(key)),
  ]);

  /* Son sayfanın ötesine gidilirse PostgREST PGRST103 döner: boş liste say. */
  if (listeSonucu.error && listeSonucu.error.code !== "PGRST103") throw new Error("Kampanyalar okunamadı: " + listeSonucu.error.message);
  if (kuralSayimi.error) throw new Error("Kampanya sayısı okunamadı: " + kuralSayimi.error.message);
  if (bitenSayimi.error) throw new Error("Süresi geçmiş kampanyalar sayılamadı: " + bitenSayimi.error.message);

  const sayilar = Object.fromEntries(DURUMLAR.map(([key], sira) => [key, sayimlar[sira]?.count ?? 0])) as Record<DurumKey, number>;
  const toplam = listeSonucu.count ?? sayilar[filter];
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / PAGE_SIZE));
  const suresiGecmisSayisi = bitenSayimi.count ?? 0;

  type KuralSatiri = {
    id: string; name: string; code: string | null; discount_type: string; value: number;
    minimum_subtotal: number; usage_limit: number | null; usage_count: number | null;
    starts_at: string | null; ends_at: string | null; status: string; combinable: boolean;
  };
  const kurallar = (listeSonucu.data ?? []) as unknown as KuralSatiri[];

  const tarihYazisi = (bas: string | null, son: string | null) => {
    const b = bas ? kisaTarih.format(new Date(bas)) : null;
    const s = son ? kisaTarih.format(new Date(son)) : null;
    if (b && s) return `${b} – ${s}`;
    if (s) return `${s} tarihine kadar`;
    if (b) return `${b} tarihinden beri`;
    return "süresiz";
  };

  const GUN = 86_400_000;
  const satirlar: IndirimSatiri[] = kurallar.map((kural) => {
    const bitis = kural.ends_at ? Date.parse(kural.ends_at) : null;
    const gecerliBitis = bitis !== null && !Number.isNaN(bitis) ? bitis : null;
    const limit = Number(kural.usage_limit ?? 0) || 0;
    const kullanim = Math.max(0, Number(kural.usage_count ?? 0) || 0);
    return {
      id: kural.id,
      ad: kural.name,
      kod: kural.code,
      turEtiketi: indirimTuruAdi(kural.discount_type),
      deger: indirimDegeri(kural.discount_type, kural.value),
      kosul: kural.minimum_subtotal > 0 ? `${money.format(kural.minimum_subtotal / 100)} üzeri` : "alt limitsiz",
      kullanim: limit > 0 ? `${kullanim}/${limit}` : `${kullanim} kullanım`,
      kullanimOrani: limit > 0 ? kullanim / limit : null,
      tarih: tarihYazisi(kural.starts_at, kural.ends_at),
      suresiGecti: gecerliBitis !== null && gecerliBitis < an,
      bitiyor: gecerliBitis !== null && gecerliBitis >= an && gecerliBitis - an <= 7 * GUN,
      durum: indirimDurumu(kural.status),
      aktifMi: kural.status === "active",
    };
  });

  /*
    ÜRÜN İNDİRİMLERİ AYRI GÖRÜNÜM (?gorunum=urun). Farklı bir şey
    anlatıyor: kural değil, varyantın karşılaştırma fiyatı. Eskiden
    aynı sayfada ikinci bir kart olarak duruyordu ve ilk 500 varyantla
    sınırlıydı — sessizce eksilen bir liste. Artık sayfalı okunuyor ve
    tavana çarparsa ekranda yazıyor.

    Süzme bellekte: PostgREST iki SÜTUNU birbiriyle karşılaştıramıyor
    (compare_at_price > price). Doğrusu veritabanında üretilmiş bir
    sütun ya da görünüm olurdu; bugün yok, bu yüzden okuma sayfalı ve
    sınırı görünür.
  */
  type VaryantSatiri = { id: string; product_id: string; title: string | null; sku: string | null; price: number; compare_at_price: number | null };
  const urunSonucu = urunGorunumu
    ? await fetchAllRows<VaryantSatiri>((bas, son) =>
        supabase.from("arc_product_variants")
          .select("id,product_id,title,sku,price,compare_at_price")
          .eq("organization_id", organization.id)
          .is("supplier", null)
          .not("compare_at_price", "is", null)
          .order("updated_at", { ascending: false })
          .range(bas, son) as unknown as PromiseLike<{ data: VaryantSatiri[] | null; error: { message: string } | null }>,
      )
    : { rows: [] as VaryantSatiri[], truncated: false };

  const indirimliVaryantlar = urunSonucu.rows
    .filter((v) => (v.compare_at_price ?? 0) > v.price)
    .map((v) => ({ ...v, oran: Math.round((1 - v.price / (v.compare_at_price ?? v.price)) * 100) }))
    .sort((a, b) => b.oran - a.oran);
  const urunIdleri = [...new Set(indirimliVaryantlar.slice(0, 100).map((v) => v.product_id))];
  const { data: urunler, error: urunHatasi } = urunGorunumu && urunIdleri.length
    ? await supabase.from("arc_products").select("id,name").in("id", urunIdleri).eq("organization_id", organization.id)
    : { data: [], error: null };
  if (urunHatasi) throw new Error("İndirimli ürünler okunamadı: " + urunHatasi.message);
  const urunAdi = new Map(((urunler ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));

  const urunOzeti = urunIndirimOzeti(urunSonucu.rows);
  /* Kartın listesi: en yüksek oranlı altı ÜRÜN (varyant değil; aynı
     ürünün iki varyantı listeyi doldurmasın). */
  const enCokIndirimli = (() => {
    const enIyi = new Map<string, number>();
    for (const varyant of indirimliVaryantlar) {
      const once = enIyi.get(varyant.product_id) ?? 0;
      if (varyant.oran > once) enIyi.set(varyant.product_id, varyant.oran);
    }
    return [...enIyi.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, oran]) => ({ ad: urunAdi.get(id) ?? "Ürün", oran }));
  })();

  const istatistik = indirimIstatistikleri(istatistikSonucu.rows, an);
  const filtreli = Boolean(search) || tur !== "all" || biten;
  const hicKuralYok = (kuralSayimi.count ?? 0) === 0;
  const pencere = canManage && params.pencere === "yeni";

  return (
    <main className="talep cari ekip talepler teklifler liste-sayfa indirim-sayfasi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">İndirimler</small>
          <h1>{urunGorunumu ? "Ürün indirimleri" : "İndirimler"}</h1>
          <p className="talep-bas-alt">
            {urunGorunumu
              ? "Karşılaştırma fiyatı satış fiyatından yüksek olan varyantlar."
              : istatistik.suresiGecmis
                ? `${istatistik.aktif} aktif kural · ${istatistik.suresiGecmis} tanesinin süresi geçmiş.`
                : `${istatistik.aktif} aktif kural · ${istatistik.toplamKullanim.toLocaleString("tr-TR")} kez kullanıldı.`}
          </p>
        </div>
        <div className="talep-bas-eylem">
          {canManage && !urunGorunumu ? (
            <Link prefetch={false} scroll={false} className="panel-primary" href="/indirimler?pencere=yeni">+ Yeni kampanya</Link>
          ) : null}
        </div>
      </header>

      {/*
        İKİ SEKME, AYRI SAYFA DEĞİL. Ürün indirimleri önce başlıktaki bir
        düğmeyle açılıyordu ve kendi başlığı olan ayrı bir ekran gibi
        davranıyordu: kullanıcı "nereye gittim" diye geri düğmesini
        arıyordu. İkisi de aynı listenin iki görünümü — biri kuralları,
        öteki varyantın karşılaştırma fiyatını listeliyor.

        Sekme ADRESTE taşınıyor (bağlantı, düğme değil): yenilenince
        aynı sekme açılıyor ve paylaşılan bağlantı doğru yere gidiyor.
      */}
      <nav className="talep-akis-sekmeler indirim-sekmeler" role="tablist" aria-label="İndirim görünümü">
        <Link prefetch={false} role="tab" aria-selected={!urunGorunumu} className={!urunGorunumu ? "is-active" : undefined} href={listHref(durum, {})}>Kampanyalar</Link>
        <Link prefetch={false} role="tab" aria-selected={urunGorunumu} className={urunGorunumu ? "is-active" : undefined} href="/indirimler?gorunum=urun">Ürün indirimleri</Link>
      </nav>

      {urunGorunumu ? (
        <div className="talep-izgara personel-iki ekip-izgara">
        <section className="panel-card talep-bilgi" aria-label="Ürün indirimleri">
          {urunSonucu.truncated ? (
            <p className="list-hint">Liste ilk 20.000 varyantla sınırlı; daha fazlası varsa burada görünmez.</p>
          ) : null}
          {indirimliVaryantlar.length ? (
            <div className="talep-tablo">
              <table className="crm-data-table" data-cols="urun-indirim">
                <thead>
                  <tr><th>Ürün</th><th>Varyant</th><th className="crm-col-amount">Fiyat</th><th className="crm-col-amount">Eski fiyat</th><th>İndirim</th><th></th></tr>
                </thead>
                <tbody>
                  {indirimliVaryantlar.slice(0, 100).map((varyant) => (
                    <tr key={varyant.id}>
                      <td data-label="Ürün">
                        <Link prefetch={false} className="crm-row-link" href={`/urunler/${varyant.product_id}`}>{urunAdi.get(varyant.product_id) ?? "Ürün"}</Link>
                      </td>
                      <td data-label="Varyant">
                        <span className="crm-cell-main">{varyant.title || "Tek varyant"}</span>
                        <small className="crm-cell-sub crm-table-mono">{varyant.sku}</small>
                      </td>
                      <td className="crm-col-amount" data-label="Fiyat"><b>{money.format(varyant.price / 100)}</b></td>
                      <td className="crm-col-amount" data-label="Eski fiyat"><s>{money.format((varyant.compare_at_price ?? 0) / 100)}</s></td>
                      <td data-label="İndirim"><span className="status-pill" data-tone="success">−%{varyant.oran}</span></td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {indirimliVaryantlar.length > 100 ? (
                <p className="list-hint">{indirimliVaryantlar.length.toLocaleString("tr-TR")} indirimli varyantın ilk 100&apos;ü gösteriliyor; tamamı Ürünler ekranında.</p>
              ) : null}
            </div>
          ) : (
            <div className="crm-empty-state talep-bos-kutu">
              <h2>Aktif ürün indirimi yok</h2>
              <p>Bir varyanta satış fiyatından yüksek karşılaştırma fiyatı girdiğinizde vitrinde üstü çizili fiyat ve indirim rozeti görünür.</p>
              <div className="crm-empty-actions"><Link prefetch={false} className="panel-secondary" href="/urunler">Ürünlere git</Link></div>
            </div>
          )}
        </section>

        {/* Sağdaki kart LİSTELENEN ŞEYİ özetliyor: burada kampanya
            sayıları yanlış özet olurdu (lib/indirim-istatistik). */}
        <IstatistikKarti
          kapsam={urunSonucu.truncated ? "ilk 20.000 varyant" : "karşılaştırma fiyatı girilmiş varyantlar"}
          kutular={[
            { ad: "İndirimli varyant", deger: urunOzeti.varyant.toLocaleString("tr-TR"), alt: `${urunOzeti.urun.toLocaleString("tr-TR")} üründe` },
            { ad: "Ortalama indirim", deger: urunOzeti.ortalamaOran === null ? "—" : `%${urunOzeti.ortalamaOran}`, alt: urunOzeti.enYuksekOran === null ? "indirimli varyant yok" : `en yüksek %${urunOzeti.enYuksekOran}` },
            { ad: "Toplam fark", deger: money.format(urunOzeti.toplamFarkKurus / 100), alt: "liste fiyatına göre" },
            { ad: "Kampanya", deger: istatistik.aktif.toLocaleString("tr-TR"), alt: "aktif sepet kuralı" },
          ]}
          gruplar={[
            { baslik: "En çok indirimli ürün", satirlar: enCokIndirimli.map((u) => ({ ad: u.ad, adet: u.oran, etiket: `%${u.oran}` })) },
          ]}
        />
        </div>
      ) : (
        <>
          <nav className="kayit-serit talep-serit" aria-label="Duruma göre süz">
            <dl>
              {DURUMLAR.map(([key, label]) => (
                <div key={key} className={filter === key ? "is-active" : undefined}>
                  <dt>{label}</dt>
                  <dd>
                    <Link prefetch={false} href={listHref(durum, { filter: key, page: 1 })} aria-current={filter === key ? "page" : undefined}>
                      {sayilar[key].toLocaleString("tr-TR")}
                    </Link>
                  </dd>
                </div>
              ))}
              {/*
                SÜRESİ GEÇMİŞ yalnızca varken: sıfır gösteren bir sütun
                gürültü olurdu. Aktif görünen ama tarihi geçmiş kural
                panelde "Aktif" yazıyor, vitrin uygulamıyor — tek
                söyleyen yer burası (sipariş listesindeki "Sorunlu
                kargo" sütunuyla aynı kalıp).
              */}
              {biten || suresiGecmisSayisi > 0 ? (
                <div className={biten ? "is-active is-tehlike" : "is-tehlike"}>
                  <dt>Süresi geçmiş</dt>
                  <dd>
                    <Link prefetch={false} href={listHref(durum, { biten: !biten, page: 1 })} aria-current={biten ? "page" : undefined}>
                      {suresiGecmisSayisi.toLocaleString("tr-TR")}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </nav>

          <div className="talep-izgara personel-iki ekip-izgara">
            <section className="panel-card talep-bilgi" aria-label="Kampanya listesi">
              <div className="ekip-suzgec talep-suzgec">
                {TURLER.map(([key, label]) => (
                  <Link prefetch={false} key={key} href={listHref(durum, { tur: key, page: 1 })} className={tur === key ? "is-active" : undefined} aria-current={tur === key ? "page" : undefined}>{label}</Link>
                ))}
                <form className="talep-ara" role="search">
                  {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
                  {tur !== "all" ? <input type="hidden" name="tur" value={tur} /> : null}
                  {biten ? <input type="hidden" name="biten" value="1" /> : null}
                  <input name="q" defaultValue={search} placeholder="Kampanya adı veya kupon kodu" aria-label="Kampanyalarda ara" />
                </form>
                <GorunumKaydet liste="indirimler" aktifSorgu={aktifSorgu} gorunumler={gorunumler} canManage={canManage} />
              </div>

              <KayitliGorunumler liste="indirimler" gorunumler={gorunumler} aktifSorgu={aktifSorgu} canManage={canManage} />

              <IndirimTablosu
                key={JSON.stringify(params)}
                satirlar={satirlar}
                canManage={canManage}
                bos={
                  <div className="crm-empty-state talep-bos-kutu">
                    <h2>{hicKuralYok ? "Henüz kampanya yok" : filtreli ? "Bu ölçütlere uygun kampanya yok" : "Bu durumda kampanya yok"}</h2>
                    <p>
                      {hicKuralYok
                        ? "Kupon kodlu ya da sepette kendiliğinden uygulanan bir kampanya oluşturabilirsiniz."
                        : "Durumu, türü veya aramayı değiştirin. Kampanya adı ve kupon kodunda arama yapılır."}
                    </p>
                    <div className="crm-empty-actions">
                      {filtreli ? <Link prefetch={false} className="panel-secondary" href={listHref({ q: "", filter, tur: "all", biten: false, page: 1 }, {})}>Süzgeci temizle</Link> : null}
                      {hicKuralYok && canManage ? <Link prefetch={false} scroll={false} className="panel-primary" href="/indirimler?pencere=yeni">İlk kampanyayı oluştur</Link> : null}
                    </div>
                  </div>
                }
              >
                {sayfaSayisi > 1 ? (
                  <nav className="liste-sayfalar" aria-label="Sayfalar">
                    {page > 1
                      ? <Link prefetch={false} href={listHref(durum, { page: page - 1 })}>← Önceki</Link>
                      : <span aria-disabled="true">← Önceki</span>}
                    <b>{page} / {sayfaSayisi} · {toplam.toLocaleString("tr-TR")} kampanya</b>
                    {page < sayfaSayisi
                      ? <Link prefetch={false} href={listHref(durum, { page: page + 1 })}>Sonraki →</Link>
                      : <span aria-disabled="true">Sonraki →</span>}
                  </nav>
                ) : null}
              </IndirimTablosu>
            </section>

            <IstatistikKarti
              kapsam={istatistikSonucu.truncated ? "ilk 20.000 kampanya" : "bütün kampanyalar · süzgeçten bağımsız"}
              kutular={[
                { ad: "Aktif kural", deger: istatistik.aktif.toLocaleString("tr-TR"), alt: `${istatistik.kuponlu} kupon · ${istatistik.otomatik} otomatik` },
                { ad: "Toplam kullanım", deger: istatistik.toplamKullanim.toLocaleString("tr-TR"), alt: "ödenmiş siparişlerde" },
                {
                  ad: "Bitmek üzere",
                  deger: istatistik.bitiyor.toLocaleString("tr-TR"),
                  alt: istatistik.suresiGecmis ? `${istatistik.suresiGecmis} tanesinin süresi geçmiş` : "7 gün içinde",
                  ton: istatistik.bitiyor || istatistik.suresiGecmis ? "uyari" : undefined,
                },
                {
                  ad: "Limiti doluyor",
                  deger: istatistik.limitiDoluyor.toLocaleString("tr-TR"),
                  alt: "kullanımın %80'i aşıldı",
                  ton: istatistik.limitiDoluyor ? "uyari" : undefined,
                },
              ]}
              gruplar={[
                { baslik: "Türe göre", satirlar: istatistik.turler.map((t) => ({ ad: t.tur, adet: t.adet })) },
                { baslik: "En çok kullanılan", satirlar: istatistik.enCokKullanilan.map((k) => ({ ad: k.ad, adet: k.adet })) },
              ]}
            />
          </div>
        </>
      )}

      {pencere ? (
        <Pencere key="yeni" ust="İndirimler" baslik="Yeni kampanya" kapatAdresi="/indirimler">
          <p className="indirim-pencere-alt">Kupon kodunu boş bırakırsanız kural sepette otomatik uygulanır.</p>
          <form action={createDiscount}>
            <input type="hidden" name="back" value={listHref(durum, {})} />
            <div className="discount-form-grid">
              <label className="wide">Kampanya adı<input name="name" required maxLength={160} placeholder="Örn. 2.000 TL Üzeri Ücretsiz Kargo" /></label>
              <label>İndirim türü<select name="discount_type" defaultValue="percentage"><option value="percentage">Sepette yüzde indirim</option><option value="fixed_amount">Sepette sabit tutar indirimi</option><option value="free_shipping">Ücretsiz kargo</option></select></label>
              <label>İndirim değeri<input name="value" type="text" inputMode="decimal" autoComplete="off" defaultValue="10" /><small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small></label>
              <label>Minimum sepet tutarı (₺)<input name="minimum_subtotal" type="text" inputMode="decimal" autoComplete="off" defaultValue="0" /></label>
              <label>Kupon kodu<input name="code" maxLength={40} placeholder="Örn. ARVO10" /></label>
              <label>Toplam kullanım limiti<input name="usage_limit" type="number" min="1" step="1" placeholder="Limitsiz" /></label>
              <label>Kişi başı kullanım<input name="per_customer_limit" type="number" min="1" step="1" placeholder="Limitsiz" /></label>
              <label>Başlangıç (Türkiye saati)<input name="starts_at" type="datetime-local" /></label>
              <label>Bitiş (Türkiye saati)<input name="ends_at" type="datetime-local" /></label>
              <label className="check-inline"><input name="active" type="checkbox" defaultChecked /> Hemen aktif et</label>
              <label className="check-inline"><input name="combinable" type="checkbox" /> Diğer indirimlerle birleştirilebilir</label>
            </div>
            <div className="product-editor-actions"><span>Kural sepet hesaplama motorunda saklanır; vitrin ve ödeme aynı kuralı uygular.</span><button className="ac-btn ac-btn-primary" type="submit">Kampanyayı oluştur</button></div>
          </form>
        </Pencere>
      ) : null}
    </main>
  );
}
