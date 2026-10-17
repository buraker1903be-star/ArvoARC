import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { trLocalToIso } from "@/lib/tr-time";
import { KNot } from "@/components/arvo-ui/k-ui";
import { gunYazisi, okumaBasi, oncekiDonem, raporDonemi, sonAltiAy } from "@/lib/rapor-donemi";
import { gunAnahtari, raporOzeti, type RaporIadesi, type RaporKalemi, type RaporSiparisi } from "@/lib/rapor-istatistik";
import {
  Defter, GostergeKarti, Simge, cssDegisken, dusum, oranSinirla, paraYaz, payi, yuzde,
  type DefterSatiri, type Gosterge, type SeriNoktasi,
} from "@/components/os/rapor-parcalari";
import { YazdirDugmesi } from "@/components/os/yazdir-dugmesi";
import "@/components/arvo-ui/kayit-detay.css";
import "@/components/os/raporlar.css";

/*
  RAPORLAR (17.10.2026 yeniden yazıldı).

  Kaynak düzen: ArvoOS/app/panel/finance/raporlar. Kurum sahibinin
  isteği "ArvoOS panelindeki raporlar sayfası gibi olsun": aynı dönem
  seçici, aynı gösterge kartları, aynı defter tabloları, aynı huni.
  İçerik ticarete çevrildi — ArvoOS satış hattını (lead → sözleşme)
  raporluyor, burada sipariş akışı ve ciro var.

  Eskisi "son 30 gün" gibi KAYAN pencerelerdi; muhasebe ayla konuşuyor,
  dönem artık takvim ayı (lib/rapor-donemi). Bütün sayılar
  lib/rapor-istatistik'te hesaplanıyor ve test ediliyor; bu dosya
  yalnızca okuyup çiziyor.
*/

export const metadata: Metadata = { title: "Raporlar" };

const fark = (simdi: number, once: number) => (once ? Math.round(((simdi - once) / once) * 100) : null);

/* Karşılaştırma oku: artış iyi, azalış kötü diye RENKLENDİRİLMİYOR —
   iade tutarının artması iyi değil. Yön okunur, yorumu kartın notunda. */
function Fark({ deger }: { deger: number | null }) {
  if (deger === null) return null;
  return <b className="rpt-delta" data-dir={deger > 0 ? "up" : deger < 0 ? "down" : undefined}>{deger > 0 ? "↑" : deger < 0 ? "↓" : "→"} %{Math.abs(deger)}</b>;
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function suAn() {
  return Date.now();
}

const adet = (n: number) => n.toLocaleString("tr-TR");

export default async function Raporlar({ searchParams }: { searchParams: Promise<{ aralik?: string; baslangic?: string; bitis?: string }> }) {
  const params = await searchParams;
  const { supabase, organization } = await requireTenant();
  const simdi = suAn();
  const donem = raporDonemi(params.aralik, params.baslangic, params.bitis, simdi);
  const aylar = sonAltiAy(simdi);
  /* Okuma penceresi Türkiye gece yarısından başlar; UTC'ye göre
     kesmek ayın ilk siparişlerini dışarıda bırakırdı. */
  const pencere = trLocalToIso(`${okumaBasi(donem, simdi)}T00:00`) ?? new Date(0).toISOString();

  /*
    Siparişler ve iade talepleri 1000'lik sayfalarla okunuyor: tek
    istek Supabase'in satır tavanında kesilir ve rapor sessizce eksik
    çıkardı — hem de paranın raporlandığı ekranda.
  */
  const [siparisSonucu, iadeSonucu] = await Promise.all([
    fetchAllRows<RaporSiparisi>((bas, son) =>
      supabase.from("arc_orders")
        .select("id,status,payment_status,total,subtotal,shipping,source,payment_method:metadata->>payment_method,discount:metadata->discount,transfer_discount:metadata->transfer_discount,refunded_amount:metadata->refunded_amount,created_at")
        .eq("organization_id", organization.id)
        .gte("created_at", pencere)
        .order("created_at", { ascending: false })
        .range(bas, son) as unknown as PromiseLike<{ data: RaporSiparisi[] | null; error: { message: string } | null }>),
    fetchAllRows<RaporIadesi>((bas, son) =>
      supabase.from("arc_return_requests")
        .select("status,reason,refund_amount,created_at")
        .eq("organization_id", organization.id)
        .gte("created_at", pencere)
        .order("created_at", { ascending: false })
        .range(bas, son) as unknown as PromiseLike<{ data: RaporIadesi[] | null; error: { message: string } | null }>),
  ]);

  /*
    Kalemler YALNIZCA dönemdeki siparişler için: kâr ve ürün sıralaması
    onlardan çıkıyor. Kimlik listesi adrese yazıldığı için 150'lik
    parçalara bölünüyor, her parça da kendi içinde sayfalanıyor
    (150 siparişin kalemi 1000 satırı aşabiliyor).
  */
  const donemKimlikleri = siparisSonucu.rows
    .filter((s) => { const gun = gunAnahtari(s.created_at); return gun >= donem.bas && gun <= donem.son; })
    .slice(0, 3000)
    .map((s) => s.id);
  const parcalar = Array.from({ length: Math.ceil(donemKimlikleri.length / 150) }, (_, i) => donemKimlikleri.slice(i * 150, i * 150 + 150));
  const kalemParcalari = await Promise.all(parcalar.map((parca) => fetchAllRows<RaporKalemi>((bas, son) =>
    supabase.from("arc_order_items")
      .select("order_id,product_name,sku,quantity,total,cost_price")
      .eq("organization_id", organization.id)
      .in("order_id", parca)
      .order("id")
      .range(bas, son) as unknown as PromiseLike<{ data: RaporKalemi[] | null; error: { message: string } | null }>)));
  const kalemler = kalemParcalari.flatMap((p) => p.rows);

  const o = raporOzeti(siparisSonucu.rows, kalemler, iadeSonucu.rows, donem, aylar);
  /*
    KARŞILAŞTIRMA yalnızca önceki dönem OKUMA PENCERESİNİN İÇİNDEYSE:
    pencere altı ayla sınırlı ve dışarıda kalan bir dönemi "sıfır"
    saymak, ciroyu sonsuz artmış gösterirdi. Kalem verilmiyor; buradan
    yalnızca sipariş adedi ve net ciro okunuyor.
  */
  const onceki = oncekiDonem(donem);
  const karsilastirilabilir = onceki.bas >= okumaBasi(donem, simdi);
  const oncekiOzet = karsilastirilabilir ? raporOzeti(siparisSonucu.rows, [], [], onceki, aylar) : null;
  const karsilastirmaAdi = donem.anahtar === "bu_yil" ? "Geçen yıla göre" : donem.anahtar === "ozel" ? "Önceki eşit döneme göre" : "Geçen aya göre";
  const karsilastirma = (simdiki: number, oncekiDeger: number | undefined) =>
    oncekiOzet ? <>{karsilastirmaAdi} <Fark deger={fark(simdiki, oncekiDeger ?? 0)} /> · </> : null;
  const kesildi = siparisSonucu.truncated || iadeSonucu.truncated || kalemParcalari.some((p) => p.truncated);

  /* --- Sunum: yukarıdaki özetten türetiliyor, yeni hesap yok --- */
  const seri = (sec: (ay: (typeof o.egilim)[number]) => number, bicim: (n: number) => string): SeriNoktasi[] =>
    o.egilim.map((ay) => ({ ad: ay.ad, deger: sec(ay), etiket: bicim(sec(ay)), simdiki: ay.simdiki }));

  const satisKartlari: Gosterge[] = [
    { etiket: "Sipariş", deger: adet(o.gecerliAdet), not: <>{karsilastirma(o.gecerliAdet, oncekiOzet?.gecerliAdet)}{adet(o.iptalAdet)} iptal/iade · son 6 ay</>, simge: "kutu", ton: "brand", grafik: { tur: "cubuk", seri: seri((ay) => ay.adet, adet) } },
    { etiket: "Net ciro", deger: paraYaz(o.netCiro), not: <>{karsilastirma(o.netCiro, oncekiOzet?.netCiro)}iptal ve iadeler düşülmüş · son 6 ay</>, simge: "para", ton: "success", grafik: { tur: "cubuk", seri: seri((ay) => ay.ciro, paraYaz) } },
    { etiket: "Ortalama sepet", deger: paraYaz(o.ortalamaSepet), not: `${adet(o.gecerliAdet)} geçerli siparişin ortalaması`, simge: "sepet", ton: "info", grafik: { tur: "halka", oran: o.siparisAdedi ? (o.gecerliAdet / o.siparisAdedi) * 100 : null, altyazi: "geçerli sipariş oranı" } },
    /* Halka bir ORAN gösteriyor: "sipariş başına adet" yüzde değil,
       3 ürün/1 sipariş %300 çıkıp halkayı doldururdu. Yerine en çok
       satanın kalem cirosundaki payı — kartın sorusuyla aynı konu. */
    { etiket: "Satılan adet", deger: adet(o.satilanAdet), not: `Geçerli siparişlerde toplam ürün · sipariş başına ${(o.gecerliAdet ? o.satilanAdet / o.gecerliAdet : 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`, simge: "etiket", ton: "gold", grafik: { tur: "halka", oran: o.kalemCirosu && o.enCokSatan[0] ? (o.enCokSatan[0].ciro / o.kalemCirosu) * 100 : null, altyazi: "en çok satanın payı" } },
    { etiket: "İade", deger: paraYaz(o.iadeTutari), not: `${adet(o.iadeAdedi)} talep · brüt cironun ${yuzde(o.brutCiro ? (o.iadeTutari / o.brutCiro) * 100 : 0)}'i`, simge: "geri", ton: o.iadeTutari ? "warning" : "success", grafik: { tur: "gosterge", oran: o.brutCiro ? (o.iadeTutari / o.brutCiro) * 100 : 0 } },
  ];

  const karVar = o.kar !== null && o.maliyet !== null;
  const karlilikKartlari: Gosterge[] = [
    { etiket: "Brüt kâr", deger: karVar ? paraYaz(o.kar!) : "—", not: karVar ? `${adet(o.karliSiparis)} siparişte hesaplanabildi` : "Kalemlerin alış fiyatı girilmemiş", simge: "grafik", ton: !karVar ? "info" : o.kar! >= 0 ? "success" : "danger", tonlu: karVar, grafik: { tur: "yigin", parcalar: [{ ad: "Maliyet", deger: o.maliyet ?? 0, ton: "warning" }, { ad: "Kâr", deger: Math.max(0, o.kar ?? 0), ton: "success" }] } },
    { etiket: "Kâr marjı", deger: o.marj === null ? "—" : yuzde(o.marj), not: "Hesaplanabilen siparişlerin kalem gelirine oranı", simge: "kivilcim", ton: "gold", grafik: { tur: "gosterge", oran: o.marj ?? 0 } },
    { etiket: "Kargo geliri", deger: paraYaz(o.kargo), not: `Tahsil edilen kargo bedeli · cironun ${yuzde(o.brutCiro ? (o.kargo / o.brutCiro) * 100 : 0)}'i`, simge: "kargo", ton: "info", grafik: { tur: "gosterge", oran: o.brutCiro ? (o.kargo / o.brutCiro) * 100 : 0 } },
    { etiket: "İndirim", deger: paraYaz(o.indirim), not: `Kupon ve havale · ürün toplamının ${yuzde(o.urunToplami ? (o.indirim / o.urunToplami) * 100 : 0)}'i`, simge: "etiket", ton: "warning", grafik: { tur: "gosterge", oran: o.urunToplami ? (o.indirim / o.urunToplami) * 100 : 0 } },
    { etiket: "Dönem akışı", deger: paraYaz(o.netCiro), not: "Ürün + kargo − indirim − iade", simge: "para", ton: "brand", grafik: { tur: "selale", adimlar: [{ ad: "Ürün", deger: o.urunToplami, ton: "brand" }, { ad: "Kargo", deger: o.kargo, ton: "info" }, { ad: "İndirim", deger: -o.indirim, ton: "warning" }, { ad: "İade", deger: -o.iadeTutari, ton: "warning" }, { ad: "Net", deger: o.netCiro, ton: "success" }] } },
  ];

  /*
    PAYIN TABANI İNDİRİM ÖNCESİ TOPLAM (ürün + kargo). Net ciroya
    oranlanınca ilk satır %100'ü aşıyordu (%103): indirim düşülmüş bir
    tabana, düşülmemiş bir sayı bölünüyor. Taban indirim öncesi olunca
    her satır aşağı doğru okunuyor: ürün %100, indirim %3, net %97.
  */
  const defterTabani = o.urunToplami + o.kargo;
  const ciroSatirlari: DefterSatiri[] = [
    { etiket: "Ürün toplamı", ipucu: `${adet(o.satilanAdet)} ürün · kargo ve indirim hariç`, tutar: paraYaz(o.urunToplami), pay: payi(o.urunToplami, defterTabani), ton: "brand" },
    { etiket: "Kargo", ipucu: "Müşteriden tahsil edilen kargo bedeli", tutar: paraYaz(o.kargo), pay: payi(o.kargo, defterTabani), ton: "info" },
    { etiket: "İndirim", ipucu: "Kupon ve havale indirimi", tutar: dusum(o.indirim), pay: payi(o.indirim, defterTabani), ton: "warning" },
    { etiket: "İade", ipucu: "Dönem siparişlerinden geri ödenen", tutar: dusum(o.iadeTutari), pay: payi(o.iadeTutari, defterTabani), ton: "warning" },
  ];
  const ciroToplami: DefterSatiri = { etiket: "Net ciro", ipucu: "Ürün + kargo − indirim − iade", tutar: paraYaz(o.netCiro), pay: payi(o.netCiro, defterTabani), ton: "success" };

  const karSatirlari: DefterSatiri[] = [
    { etiket: "Kalem geliri", ipucu: `${adet(o.karliSiparis)} siparişin ürün satırları`, tutar: paraYaz(o.karTabani), pay: o.karTabani ? 100 : null, ton: "brand" },
    { etiket: "Ürün maliyeti", ipucu: "Satış anında donmuş alış fiyatı", tutar: karVar ? dusum(o.maliyet!) : "—", pay: karVar ? payi(o.maliyet!, o.karTabani) : null, ton: "warning" },
  ];
  const karToplami: DefterSatiri = { etiket: "Brüt kâr", ipucu: "Kalem geliri − ürün maliyeti", tutar: karVar ? paraYaz(o.kar!) : "—", pay: o.marj, ton: !karVar ? "info" : o.kar! >= 0 ? "success" : "danger" };

  const enBuyukHuni = Math.max(1, ...o.huni.map((h) => h.adet));
  const enBuyukEgilim = Math.max(1, ...o.egilim.map((ay) => ay.adet));
  const enBuyukSebep = Math.max(1, ...o.sebepler.map((s) => s.adet));
  const enBuyukUrun = Math.max(1, ...o.enCokSatan.map((u) => u.ciro));
  const egilimSiparis = o.egilim.reduce((t, ay) => t + ay.adet, 0);
  const egilimCiro = o.egilim.reduce((t, ay) => t + ay.ciro, 0);
  const bagli = (anahtar: string) => `/analitik?aralik=${anahtar}`;
  const enIyiKaynak = o.kaynaklar[0];

  return <div className="rpt">
    <header className="talep-bas rpt-bas">
      <div className="talep-bas-metin"><small className="panel-kicker">FİNANS</small><h1>Raporlar</h1></div>
      <div className="talep-bas-eylem"><span className="status-pill rpt-range-pill" data-tone="gold">{donem.etiket}</span><YazdirDugmesi /></div>
    </header>

    {kesildi ? <KNot ton="uyari">Bu pencerede 20.000’den fazla kayıt var; rapor en yeni 20.000 kayıtla hesaplandı.</KNot> : null}

    <section className="rpt-toolbar" aria-label="Rapor dönemi">
      <nav className="rpt-segment" aria-label="Hazır dönemler">
        {([["bu_ay", "Bu Ay"], ["gecen_ay", "Geçen Ay"], ["bu_yil", "Bu Yıl"]] as const).map(([anahtar, etiket]) => (
          <Link key={anahtar} prefetch={false} href={bagli(anahtar)} className={donem.anahtar === anahtar ? "is-active" : undefined} aria-current={donem.anahtar === anahtar ? "page" : undefined}>{etiket}</Link>
        ))}
      </nav>
      <form className={`rpt-range-form${donem.anahtar === "ozel" ? " is-active" : ""}`} method="get">
        <input type="hidden" name="aralik" value="ozel" />
        <span className="rpt-range-label">Özel aralık</span>
        <input name="baslangic" type="date" defaultValue={donem.anahtar === "ozel" ? donem.bas : undefined} required aria-label="Başlangıç tarihi" />
        <span className="rpt-range-sep" aria-hidden="true">–</span>
        <input name="bitis" type="date" defaultValue={donem.anahtar === "ozel" ? donem.son : undefined} required aria-label="Bitiş tarihi" />
        <button className="panel-secondary" type="submit">Uygula</button>
      </form>
    </section>

    <section className="rpt-group" aria-labelledby="rpt-satis">
      <h2 className="rpt-group-title" id="rpt-satis">Satış</h2>
      <div className="rpt-widgets">{satisKartlari.map((k) => <GostergeKarti key={k.etiket} gosterge={k} />)}</div>
    </section>
    <section className="rpt-group" aria-labelledby="rpt-karlilik">
      <h2 className="rpt-group-title" id="rpt-karlilik">Kârlılık ve dönem akışı</h2>
      <div className="rpt-widgets">{karlilikKartlari.map((k) => <GostergeKarti key={k.etiket} gosterge={k} />)}</div>
    </section>

    <div className="rpt-grid">
      <section className="rpt-card">
        <header className="rpt-card-head">
          <div><h2>Sipariş akışı</h2><p>Siparişin alınmasından kargoya verilmesine kadar her adımda kalan</p></div>
          <Link href="/siparisler" className="rpt-card-link">Siparişleri aç<span aria-hidden="true"> ›</span></Link>
        </header>
        <ol className="rpt-funnel">
          {o.huni.map((adim, sira) => {
            const gecis = o.gecisler[sira];
            const zayif = Boolean(gecis && o.enZayifGecis && gecis.nereden === o.enZayifGecis.nereden && o.siparisAdedi > 0);
            return <li key={adim.anahtar} className={sira === o.huni.length - 1 ? "is-final" : undefined}>
              <div className="rpt-funnel-row">
                <div className="rpt-funnel-label"><b>{adim.etiket}</b><span>Dönemdeki siparişlerin {o.siparisAdedi ? yuzde((adim.adet / o.siparisAdedi) * 100) : "—"}'i</span></div>
                <div className="rpt-funnel-track"><i style={cssDegisken("--w", `${Math.max(4, (adim.adet / enBuyukHuni) * 100)}%`)} /></div>
                <strong>{adet(adim.adet)}</strong>
              </div>
              {gecis ? <div className={`rpt-funnel-step${zayif ? " is-weak" : ""}`}><span aria-hidden="true">↓</span><b>{gecis.oran === null ? "—" : yuzde(gecis.oran)}</b> sonraki adıma geçti{zayif ? <em>En zayıf geçiş</em> : null}</div> : null}
            </li>;
          })}
        </ol>
        {o.siparisAdedi ? null : <p className="rpt-empty-note">Bu dönemde sipariş yok; akış oranları ilk siparişle birlikte oluşur.</p>}
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head"><div><h2>Bu dönem ne söylüyor?</h2><p>Yönetici için dört kısa not</p></div></header>
        <ul className="rpt-insights">
          <li data-tone="warning"><span className="rpt-insight-icon"><Simge ad="uyari" boy={17} /></span><div><b>En zayıf adım</b><p>{o.enZayifGecis ? `${o.enZayifGecis.nereden} → ${o.enZayifGecis.nereye} geçişi ${yuzde(o.enZayifGecis.oran)}.` : "Yeterli veri yok."}</p></div></li>
          <li data-tone="gold"><span className="rpt-insight-icon"><Simge ad="grafik" boy={17} /></span><div><b>Kârlılık</b><p>{karVar ? `${paraYaz(o.karTabani)} kalem gelirinin maliyeti ${paraYaz(o.maliyet!)}; brüt marj ${yuzde(o.marj ?? 0)}.` : "Kâr hesaplanamıyor: kalemlerin alış fiyatı girilmemiş."}</p></div></li>
          <li data-tone={o.iadeTutari ? "danger" : "success"}><span className="rpt-insight-icon"><Simge ad="geri" boy={17} /></span><div><b>İade yükü</b><p>{o.iadeTutari ? `${paraYaz(o.iadeTutari)} iade edildi; brüt cironun ${yuzde((o.iadeTutari / Math.max(1, o.brutCiro)) * 100)}'i.` : "Bu dönemde iade edilen tutar yok."}</p></div></li>
          <li data-tone="info"><span className="rpt-insight-icon"><Simge ad="kisi" boy={17} /></span><div><b>Satış kaynağı</b><p>{enIyiKaynak ? `Ciro en çok ${enIyiKaynak.etiket} üzerinden geldi: ${paraYaz(enIyiKaynak.ciro)} (${adet(enIyiKaynak.adet)} sipariş).` : "Bu dönemde geçerli sipariş yok."}</p></div></li>
        </ul>
      </section>

      <section className="rpt-card rpt-span-full">
        <header className="rpt-card-head"><div><h2>Ciro ve kâr dökümü</h2><p>Ciroyu oluşturan kalemler ile ürün maliyeti yan yana</p></div></header>
        <div className="rpt-ledgers">
          <Defter baslik="Ciro dökümü" altyazi="Pay: indirim öncesi toplama (ürün + kargo) oranı" satirlar={ciroSatirlari} toplam={ciroToplami} />
          <Defter baslik="Kârlılık" altyazi="Pay: kalem gelirine oranı" satirlar={karSatirlari} toplam={karToplami} />
        </div>
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head">
          <div><h2>6 aylık eğilim</h2><p>Aylara göre sipariş ve net ciro</p></div>
          <div className="rpt-stat"><strong>{adet(egilimSiparis)}</strong><span>sipariş · {paraYaz(egilimCiro)}</span></div>
        </header>
        <div className="rpt-trend" role="img" aria-label={`Altı aylık grafik: ${o.egilim.map((ay) => `${ay.ad} ${ay.adet} sipariş, ${paraYaz(ay.ciro)}`).join("; ")}`}>
          {o.egilim.map((ay) => {
            const enBuyukCiro = Math.max(1, ...o.egilim.map((x) => x.ciro));
            return <div key={ay.bas} className={`rpt-trend-col${ay.simdiki ? " is-current" : ""}`}>
              <div className="rpt-trend-bars">
                <i className="is-lead" style={cssDegisken("--h", `${Math.max(3, oranSinirla((ay.adet / enBuyukEgilim) * 100))}%`)} title={`${adet(ay.adet)} sipariş`} />
                <i className="is-sale" style={cssDegisken("--h", `${Math.max(3, oranSinirla((ay.ciro / enBuyukCiro) * 100))}%`)} title={paraYaz(ay.ciro)} />
              </div>
              <b>{ay.ad}</b>
              <span>{adet(ay.adet)} · {paraYaz(ay.ciro)}</span>
            </div>;
          })}
        </div>
        <div className="rpt-legend"><span><i className="is-lead" />Sipariş</span><span><i className="is-sale" />Ciro</span></div>
        {egilimSiparis ? null : <p className="rpt-empty-note">Son 6 ayda geçerli sipariş kaydı yok.</p>}
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head">
          <div><h2>Neden iade edildi?</h2><p>Bu dönemde açılan iade talepleri</p></div>
          <div className="rpt-stat" data-tone={o.iadeAdedi ? "danger" : "success"}><strong>{adet(o.iadeAdedi)}</strong><span>talep</span></div>
        </header>
        {o.sebepler.length ? <ul className="rpt-lost">
          {o.sebepler.map((satir) => <li key={satir.sebep}>
            <div className="rpt-lost-top"><b>{satir.sebep}</b><span>{adet(satir.adet)} talep</span></div>
            <div className="rpt-lost-track"><i style={cssDegisken("--w", `${(satir.adet / enBuyukSebep) * 100}%`)} /></div>
          </li>)}
        </ul> : <div className="rpt-empty" data-tone="success">
          <span className="rpt-insight-icon"><Simge ad="kalp" boy={20} /></span>
          <b>İade talebi yok</b>
          <p>Bu dönemde müşteriler iade talebi açmadı.</p>
        </div>}
      </section>

      <section className="rpt-card rpt-span-full">
        <header className="rpt-card-head">
          <div><h2>En çok satan ürünler</h2><p>Kalem cirosuna göre ilk 10</p></div>
          <Link href="/urunler" className="rpt-card-link">Katalogu aç<span aria-hidden="true"> ›</span></Link>
        </header>
        {o.enCokSatan.length ? <ol className="rpt-urunler">
          {o.enCokSatan.map((urun, sira) => <li key={urun.sku || urun.ad}>
            <span className="rpt-urun-sira">{sira + 1}</span>
            <span className="rpt-urun-ad"><b>{urun.ad}</b><small>{urun.sku || "SKU yok"} · payı {yuzde(o.kalemCirosu ? (urun.ciro / o.kalemCirosu) * 100 : 0)}</small></span>
            <span className="rpt-urun-iz"><i style={cssDegisken("--w", `${(urun.ciro / enBuyukUrun) * 100}%`)} /></span>
            <span className="rpt-urun-adet">{adet(urun.adet)} adet</span>
            <strong>{paraYaz(urun.ciro)}</strong>
          </li>)}
        </ol> : <p className="rpt-empty-note">Bu dönemde satılan ürün yok.</p>}
      </section>

      <section className="rpt-card">
        <header className="rpt-card-head"><div><h2>Satış kaynağı</h2><p>Net ciroya göre · {gunYazisi(donem.bas)} – {gunYazisi(donem.son)}</p></div></header>
        {o.kaynaklar.length ? <ul className="rpt-kaynaklar">
          {o.kaynaklar.map((kaynak) => <li key={kaynak.etiket}>
            <div className="rpt-lost-top"><b>{kaynak.etiket}</b><span>{adet(kaynak.adet)} sipariş · {paraYaz(kaynak.ciro)}</span></div>
            <div className="rpt-lost-track"><i style={cssDegisken("--w", `${o.netCiro ? (kaynak.ciro / o.netCiro) * 100 : 0}%`)} /></div>
          </li>)}
        </ul> : <p className="rpt-empty-note">Bu dönemde geçerli sipariş yok.</p>}
      </section>

      {/* Ödeme türü manuel siparişte seçiliyor, vitrinde ödeme akışından
          geliyor; boş olan "Kredi kartı" sayılıyor (sipariş detayıyla
          aynı varsayım). Havale ve nakitte para kasaya elden giriyor,
          dağılım o yüzden nakit planlamasının girdisi. */}
      <section className="rpt-card">
        <header className="rpt-card-head"><div><h2>Ödeme türü</h2><p>Net ciroya göre dağılım</p></div></header>
        {o.odemeTurleri.length ? <ul className="rpt-kaynaklar">
          {o.odemeTurleri.map((tur) => <li key={tur.etiket}>
            <div className="rpt-lost-top"><b>{tur.etiket}</b><span>{adet(tur.adet)} sipariş · {paraYaz(tur.ciro)}</span></div>
            <div className="rpt-lost-track"><i style={cssDegisken("--w", `${o.netCiro ? (tur.ciro / o.netCiro) * 100 : 0}%`)} /></div>
          </li>)}
        </ul> : <p className="rpt-empty-note">Bu dönemde geçerli sipariş yok.</p>}
      </section>
    </div>
  </div>;
}
