import { countsAsRevenue, revenueAmount } from "./order-flow";
import { DAY, TR_OFFSET, trDayStart } from "./tr-time";

/*
  SİPARİŞ LİSTESİNİN SAĞINDAKİ İSTATİSTİKLER (16.10.2026, ArvoOS'un iş
  listesindeki kart). Saf hesap: sayfa siparişleri pencereden okuyup
  buraya veriyor, kart yalnızca çiziyor.

  Ciro tanımı order-flow'dan (countsAsRevenue / revenueAmount): Ana
  Ekran ve Analitik de onu kullanıyor. Burada ikinci bir tanım olsaydı
  üç ekran aynı ay için üç ayrı ciro gösterebilirdi.

  Pencereler Türkiye gününe göre: "son 30 gün" bugünün gün başından 29
  gün geri, aylar Türkiye takvim ayı. UTC'ye göre kesilseydi gece
  00:00–03:00 arasındaki siparişler önceki güne/aya düşerdi.
*/

export type IstatistikSiparisi = {
  total: number;
  status: string | null;
  payment_status: string | null;
  refunded_amount?: unknown;
  created_at: string;
  source: string | null;
};

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_SAYISI = 6;

/** Türkiye takviminde, bugünün ayından `geri` ay önceki ayın ilk anı (epoch ms). */
function ayBasi(an: number, geri: number) {
  const yerel = new Date(an + TR_OFFSET);
  return Date.UTC(yerel.getUTCFullYear(), yerel.getUTCMonth() - geri, 1) - TR_OFFSET;
}

/** Kartın ihtiyaç duyduğu en eski an: altı ayın başı ya da önceki 30 günün başı, hangisi eskiyse. */
export function istatistikBaslangici(an: number) {
  return Math.min(ayBasi(an, AY_SAYISI - 1), trDayStart(an) - 59 * DAY);
}

export function siparisIstatistikleri(siparisler: IstatistikSiparisi[], an: number) {
  const bugun = trDayStart(an);
  const son30Basi = bugun - 29 * DAY;
  const onceki30Basi = bugun - 59 * DAY;

  const aylar = Array.from({ length: AY_SAYISI }, (_, i) => {
    const geri = AY_SAYISI - 1 - i;
    const bas = ayBasi(an, geri);
    return { bas, son: ayBasi(an, geri - 1), ad: AYLAR[new Date(bas + TR_OFFSET).getUTCMonth()], adet: 0, ciro: 0 };
  });

  let son30 = 0, onceki30 = 0, ciro30 = 0, ciroOnceki30 = 0, ciroyaSayilan30 = 0, kapanan30 = 0;
  const kaynaklar = new Map<string, number>();

  for (const siparis of siparisler) {
    const ms = Date.parse(siparis.created_at);
    if (Number.isNaN(ms)) continue;
    const ciro = revenueAmount(siparis);
    const sayilir = countsAsRevenue(siparis.status, siparis.payment_status);

    if (ms >= son30Basi) {
      son30 += 1;
      ciro30 += ciro;
      if (sayilir) ciroyaSayilan30 += 1;
      else kapanan30 += 1;
      const kaynak = siparis.source ?? "";
      kaynaklar.set(kaynak, (kaynaklar.get(kaynak) ?? 0) + 1);
    } else if (ms >= onceki30Basi) {
      onceki30 += 1;
      ciroOnceki30 += ciro;
    }

    const ay = aylar.find((a) => ms >= a.bas && ms < a.son);
    if (ay) {
      ay.adet += 1;
      ay.ciro += ciro;
    }
  }

  /** Önceki dönem boşsa yüzde anlamsız: null. */
  const degisim = (simdi: number, once: number) => (once ? Math.round(((simdi - once) / once) * 100) : null);

  return {
    son30,
    onceki30,
    siparisDegisimi: degisim(son30, onceki30),
    ciro30,
    ciroDegisimi: degisim(ciro30, ciroOnceki30),
    ciroyaSayilan30,
    ortalamaSepet: ciroyaSayilan30 ? Math.round(ciro30 / ciroyaSayilan30) : null,
    kapanan30,
    kapananOrani: son30 ? Math.round((kapanan30 / son30) * 100) : null,
    aylik: aylar.map(({ ad, adet, ciro }) => ({ ad, adet, ciro })),
    kaynaklar: [...kaynaklar.entries()].sort((a, b) => b[1] - a[1]).map(([kaynak, adet]) => ({ kaynak, adet })),
  };
}
