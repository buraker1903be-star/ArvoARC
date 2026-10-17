import { countsAsRevenue, orderFlow, refundedAmount, revenueAmount } from "@/lib/order-flow";
import { siparisKari } from "@/lib/siparis-kari";
import { sourceLabel } from "@/lib/commerce-labels";
import { trToday } from "@/lib/tr-time";

/*
  RAPOR HESABI (17.10.2026). Saf modül; testi tests/rapor-istatistik.test.ts.

  Raporlar sayfasının BÜTÜN sayıları burada üretiliyor: ekran yalnızca
  çiziyor. Sebebi, para raporlanan bir ekranda hesabın test edilebilir
  olması — eski analitik sayfasında hesap da çizim de aynı dosyadaydı
  ve tek bir satırı bile sınanamıyordu.

  Kurallar ortak modüllerden geliyor, burada yeniden yazılmıyor:
  ciroya sayılan sipariş `countsAsRevenue`, iade edilen tutar
  `refundedAmount`, kâr `siparisKari` (maliyeti eksik kalemde kâr
  HESAPLANMIYOR). Gün sınırı Türkiye saatiyle (`trToday`).
*/

export type RaporSiparisi = {
  id: string;
  status: string | null;
  payment_status: string | null;
  total: number;
  subtotal: number | null;
  shipping: number | null;
  source: string | null;
  /* Kupon indirimi (metadata.discount) ve havale indirimi ayrı
     alanlarda duruyor; sipariş detayı da ikisini toplayarak gösteriyor. */
  discount?: unknown;
  transfer_discount?: unknown;
  refunded_amount?: unknown;
  created_at: string;
};
export type RaporKalemi = { order_id: string; product_name: string | null; sku: string | null; quantity: number; total: number; cost_price: number | null };
export type RaporIadesi = { status: string | null; reason: string | null; refund_amount: number | null; created_at: string };
export type Ay = { bas: string; son: string; ad: string; simdiki: boolean };

const sayi = (deger: unknown) => {
  const n = Number(deger ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
/** Zaman damgasının Türkiye günü; aralık karşılaştırmaları bununla. */
export const gunAnahtari = (damga: string) => trToday(Date.parse(damga));

export function raporOzeti(
  siparisler: RaporSiparisi[],
  kalemler: RaporKalemi[],
  iadeler: RaporIadesi[],
  donem: { bas: string; son: string },
  aylar: Ay[],
) {
  const araliktaMi = (damga: string) => {
    const gun = gunAnahtari(damga);
    return gun >= donem.bas && gun <= donem.son;
  };

  const donemSiparisleri = siparisler.filter((s) => araliktaMi(s.created_at));
  const gecerli = donemSiparisleri.filter((s) => countsAsRevenue(s.status, s.payment_status));
  const gecerliKimlikler = new Set(gecerli.map((s) => s.id));

  const netCiro = gecerli.reduce((t, s) => t + revenueAmount(s), 0);
  const brutCiro = gecerli.reduce((t, s) => t + Math.max(0, s.total), 0);
  const iadeTutari = donemSiparisleri.reduce((t, s) => t + refundedAmount(s), 0);
  const urunToplami = gecerli.reduce((t, s) => t + sayi(s.subtotal), 0);
  const kargo = gecerli.reduce((t, s) => t + sayi(s.shipping), 0);
  const indirim = gecerli.reduce((t, s) => t + sayi(s.discount) + sayi(s.transfer_discount), 0);
  const ortalamaSepet = gecerli.length ? Math.round(netCiro / gecerli.length) : 0;

  /* Kalemler sipariş kimliğine göre: kâr ve ürün sıralaması ikisi de buradan. */
  const kalemlerSiparise = new Map<string, RaporKalemi[]>();
  for (const kalem of kalemler) {
    const liste = kalemlerSiparise.get(kalem.order_id);
    if (liste) liste.push(kalem);
    else kalemlerSiparise.set(kalem.order_id, [kalem]);
  }

  let satilanAdet = 0;
  const urunler = new Map<string, { ad: string; sku: string; adet: number; ciro: number }>();
  for (const kalem of kalemler) {
    if (!gecerliKimlikler.has(kalem.order_id)) continue;
    satilanAdet += Math.max(0, kalem.quantity);
    const anahtar = kalem.sku || kalem.product_name || "—";
    const kayit = urunler.get(anahtar);
    if (kayit) {
      kayit.adet += Math.max(0, kalem.quantity);
      kayit.ciro += kalem.total;
    } else urunler.set(anahtar, { ad: kalem.product_name || "Ürün", sku: kalem.sku || "", adet: Math.max(0, kalem.quantity), ciro: kalem.total });
  }
  const enCokSatan = [...urunler.values()].sort((a, b) => b.ciro - a.ciro).slice(0, 10);
  const kalemCirosu = [...urunler.values()].reduce((t, u) => t + u.ciro, 0);

  /*
    KÂR YALNIZCA HESAPLANABİLEN SİPARİŞLERDEN. Maliyeti eksik olan ya
    da kısmi iadeli sipariş `siparisKari`'de null dönüyor; o siparişi
    sıfır kâr saymak toplamı aşağı çeker, hiç saymamak ise marjı
    yanlış tabana böler. Bu yüzden kârın kendi tabanı taşınıyor
    (karTabani) ve ekranda kaç siparişin hesaplanabildiği yazılıyor.
  */
  let kar = 0;
  let karTabani = 0;
  let karliSiparis = 0;
  for (const siparis of gecerli) {
    const kendi = kalemlerSiparise.get(siparis.id) ?? [];
    const sonuc = siparisKari(
      kendi.map((k) => ({ toplamKurus: k.total, adet: k.quantity, maliyetKurus: k.cost_price ?? null })),
      siparis.status,
      siparis.payment_status,
    );
    if (!sonuc) continue;
    kar += sonuc.kurus;
    karTabani += kendi.reduce((t, k) => t + k.total, 0);
    karliSiparis += 1;
  }
  const marj = karTabani ? Math.round((kar / karTabani) * 1000) / 10 : null;
  const maliyet = karTabani - kar;

  /*
    SİPARİŞ AKIŞI HUNİSİ: sipariş bir adıma ULAŞTIYSA ondan öncekilerin
    hepsine de ulaşmıştır (akış doğrusal, lib/order-flow). İptal ve
    iade edilenler akıştan düştükleri için yalnızca "Sipariş alındı"da
    sayılır — düşüş huninin kendisinde görünsün.
  */
  const akisSirasi = new Map<string, number>(orderFlow.map((adim, sira) => [adim.key as string, sira]));
  const huni = orderFlow.map((adim, sira) => ({
    anahtar: adim.key,
    etiket: adim.label,
    adet: donemSiparisleri.filter((s) => (akisSirasi.get(s.status ?? "") ?? -1) >= sira).length,
  }));
  const gecisler = huni.slice(1).map((adim, sira) => ({
    nereden: huni[sira].etiket,
    nereye: adim.etiket,
    oran: huni[sira].adet ? (adim.adet / huni[sira].adet) * 100 : null,
  }));
  const gecerliGecisler = gecisler.filter((g): g is typeof g & { oran: number } => g.oran !== null);
  const enZayifGecis = gecerliGecisler.length ? gecerliGecisler.reduce((a, b) => (b.oran < a.oran ? b : a)) : null;

  /* Satış kaynağı: ciroya göre, ekrandaki etiketle (commerce-labels). */
  const kaynaklar = new Map<string, { ciro: number; adet: number }>();
  for (const siparis of gecerli) {
    const etiket = sourceLabel(siparis.source);
    const kayit = kaynaklar.get(etiket) ?? { ciro: 0, adet: 0 };
    kayit.ciro += revenueAmount(siparis);
    kayit.adet += 1;
    kaynaklar.set(etiket, kayit);
  }
  const kaynakListesi = [...kaynaklar.entries()].map(([etiket, deger]) => ({ etiket, ...deger })).sort((a, b) => b.ciro - a.ciro);

  /* İade sebepleri: dönemde AÇILAN talepler (karar sonraki aya kayabilir). */
  const donemIadeleri = iadeler.filter((i) => araliktaMi(i.created_at));
  const sebepSayaci = new Map<string, number>();
  for (const talep of donemIadeleri) {
    const sebep = (talep.reason ?? "").trim() || "Belirtilmedi";
    sebepSayaci.set(sebep, (sebepSayaci.get(sebep) ?? 0) + 1);
  }
  const sebepler = [...sebepSayaci.entries()].map(([sebep, adet]) => ({ sebep, adet })).sort((a, b) => b.adet - a.adet).slice(0, 6);

  /* Altı aylık eğilim: ay sınırları da Türkiye günüyle. */
  const egilim = aylar.map((ay) => {
    const icinde = siparisler.filter((s) => {
      const gun = gunAnahtari(s.created_at);
      return gun >= ay.bas && gun <= ay.son && countsAsRevenue(s.status, s.payment_status);
    });
    return { ...ay, adet: icinde.length, ciro: icinde.reduce((t, s) => t + revenueAmount(s), 0) };
  });

  return {
    siparisAdedi: donemSiparisleri.length,
    gecerliAdet: gecerli.length,
    iptalAdet: donemSiparisleri.length - gecerli.length,
    netCiro,
    brutCiro,
    urunToplami,
    kargo,
    indirim,
    iadeTutari,
    iadeAdedi: donemIadeleri.length,
    ortalamaSepet,
    satilanAdet,
    kar: karliSiparis ? kar : null,
    maliyet: karliSiparis ? maliyet : null,
    marj,
    karliSiparis,
    karTabani,
    huni,
    gecisler,
    enZayifGecis,
    enCokSatan,
    kalemCirosu,
    kaynaklar: kaynakListesi,
    sebepler,
    egilim,
  };
}

export type RaporOzeti = ReturnType<typeof raporOzeti>;
