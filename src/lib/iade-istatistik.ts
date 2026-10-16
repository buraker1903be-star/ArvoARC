import { DAY, TR_OFFSET, trDayStart } from "./tr-time";

/*
  İADE LİSTESİNİN SAĞINDAKİ İSTATİSTİKLER (16.10.2026).

  Sipariş listesi bu karta kavuştuğunda iade ekranı hâlâ kart kart
  akan bir yığındı: kaç talep geldiği, ne kadar paranın geri gittiği
  ve kararın ne kadar beklediği hiçbir yerde yazmıyordu. Oysa iade,
  mağazanın en pahalı işlemi — ölçülmeyen tek yer olmamalı.

  Saf hesap: sayfa talepleri pencereden okuyup buraya veriyor, kart
  yalnızca çiziyor (siparis-istatistik.ts ile aynı biçim).

  Pencereler Türkiye gününe göre; UTC'ye göre kesilseydi gece
  00:00–03:00 arasındaki talepler önceki güne/aya düşerdi.

  İADE EDİLEN PARA `refund_amount`tan, kalem toplamından DEĞİL: kalem
  toplamı talebin istediği, refund_amount gerçekten gönderilen tutar.
  Değer kaybı kesintisi yapıldığında ikisi ayrışıyor ve kasadan çıkan
  para ikincisidir.

  BEKLEME SÜRESİ yalnızca KARAR VERİLMİŞ taleplerde ölçülüyor
  (resolved_at): hâlâ bekleyen bir talebin süresi her saniye uzuyor ve
  ortalamayı kendi yaşıyla sürüklerdi. Karar bekleyenlerin en yaşlısı
  ayrıca veriliyor — ortalama değil o sayı acildir.
*/

export type IstatistikIadesi = {
  status: string | null;
  refund_amount: number | null;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
};

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_SAYISI = 6;

/** Türkiye takviminde, bugünün ayından `geri` ay önceki ayın ilk anı (epoch ms). */
function ayBasi(an: number, geri: number) {
  const yerel = new Date(an + TR_OFFSET);
  return Date.UTC(yerel.getUTCFullYear(), yerel.getUTCMonth() - geri, 1) - TR_OFFSET;
}

/** Kartın ihtiyaç duyduğu en eski an: altı ayın başı ya da önceki 30 günün başı, hangisi eskiyse. */
export function iadeIstatistikBaslangici(an: number) {
  return Math.min(ayBasi(an, AY_SAYISI - 1), trDayStart(an) - 59 * DAY);
}

/** Karar bekleyen durumlar: talep hâlâ masada. */
const BEKLEYEN = new Set(["beklemede", "onaylandi"]);

export function iadeIstatistikleri(talepler: IstatistikIadesi[], an: number) {
  const bugun = trDayStart(an);
  const son30Basi = bugun - 29 * DAY;
  const onceki30Basi = bugun - 59 * DAY;

  const aylar = Array.from({ length: AY_SAYISI }, (_, i) => {
    const geri = AY_SAYISI - 1 - i;
    const bas = ayBasi(an, geri);
    return { bas, son: ayBasi(an, geri - 1), ad: AYLAR[new Date(bas + TR_OFFSET).getUTCMonth()], adet: 0, tutar: 0 };
  });

  let son30 = 0, onceki30 = 0, iade30 = 0, iadeOnceki30 = 0, red30 = 0, karar30 = 0;
  let kararSuresiToplam = 0, kararSayisi = 0, enYasliBekleyen: number | null = null;
  const sebepler = new Map<string, number>();

  for (const talep of talepler) {
    const ms = Date.parse(talep.created_at);
    if (Number.isNaN(ms)) continue;
    /* Gönderilen para: yalnızca tamamlanmış talepte vardır. */
    const tutar = talep.status === "tamamlandi" ? Math.max(0, Number(talep.refund_amount ?? 0) || 0) : 0;

    if (ms >= son30Basi) {
      son30 += 1;
      iade30 += tutar;
      if (talep.status === "reddedildi") red30 += 1;
      if (!BEKLEYEN.has(talep.status ?? "")) karar30 += 1;
      const sebep = (talep.reason ?? "").trim() || "Belirtilmedi";
      sebepler.set(sebep, (sebepler.get(sebep) ?? 0) + 1);
    } else if (ms >= onceki30Basi) {
      onceki30 += 1;
      iadeOnceki30 += tutar;
    }

    if (BEKLEYEN.has(talep.status ?? "")) {
      /* En yaşlı bekleyen: en KÜÇÜK oluşma anı. */
      if (enYasliBekleyen === null || ms < enYasliBekleyen) enYasliBekleyen = ms;
    } else if (talep.resolved_at) {
      const karar = Date.parse(talep.resolved_at);
      /* Saat geri alınmış ya da bozuk damga ortalamayı eksiye çekmesin. */
      if (!Number.isNaN(karar) && karar >= ms) {
        kararSuresiToplam += karar - ms;
        kararSayisi += 1;
      }
    }

    const ay = aylar.find((a) => ms >= a.bas && ms < a.son);
    if (ay) {
      ay.adet += 1;
      ay.tutar += tutar;
    }
  }

  /** Önceki dönem boşsa yüzde anlamsız: null. */
  const degisim = (simdi: number, once: number) => (once ? Math.round(((simdi - once) / once) * 100) : null);

  return {
    son30,
    onceki30,
    talepDegisimi: degisim(son30, onceki30),
    iade30,
    iadeDegisimi: degisim(iade30, iadeOnceki30),
    /** Ortalama iade tutarı: yalnızca para gönderilmiş talepler üzerinden. */
    ortalamaKararSaati: kararSayisi ? Math.round(kararSuresiToplam / kararSayisi / 3_600_000) : null,
    red30,
    redOrani: karar30 ? Math.round((red30 / karar30) * 100) : null,
    /** Karar bekleyenin en yaşlısı, saat. Yoksa null. */
    enYasliBekleyenSaat: enYasliBekleyen === null ? null : Math.floor((an - enYasliBekleyen) / 3_600_000),
    aylik: aylar.map(({ ad, adet, tutar }) => ({ ad, adet, tutar })),
    sebepler: [...sebepler.entries()].sort((a, b) => b[1] - a[1]).map(([sebep, adet]) => ({ sebep, adet })),
  };
}
