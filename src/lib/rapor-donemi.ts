import { trToday } from "@/lib/tr-time";

/*
  RAPOR DÖNEMİ (17.10.2026).

  Kaynak kalıp: ArvoOS/app/panel/finance/raporlar (resolveRange).
  Raporlar sayfası "son 30 gün" gibi kayan pencereler yerine TAKVİM
  dönemleri kullanıyor: muhasebe ayla konuşuyor, "bu ay ne sattık"
  sorusunun karşılığı 30 gün değil ayın 1'inden bugüne.

  Her şey TÜRKİYE GÜNÜ anahtarıyla ("YYYY-AA-GG"): sunucu UTC'de
  çalışıyor ve ayın 1'inde 00:00–03:00 arasında gelen sipariş UTC
  gününe göre önceki aya düşerdi (AGENTS.md "Tarih Türkiye saatiyle").

  Geçersiz özel aralık ("?baslangic=abc") sessizce "bu ay"a döner;
  ters girilen aralık düzeltilir — kullanıcıyı hata ekranına
  göndermek yerine anlaşılır olanı yapıyor.
*/
export type DonemAnahtari = "bu_ay" | "gecen_ay" | "bu_yil" | "ozel";
export type Donem = { bas: string; son: string; anahtar: DonemAnahtari; etiket: string };

const GUN = /^\d{4}-\d{2}-\d{2}$/;
export const gecerliGun = (deger?: string | null): deger is string =>
  Boolean(deger && GUN.test(deger) && !Number.isNaN(Date.parse(`${deger}T00:00:00Z`)));

/** Ayın ilk günü; ay taşması serbest (0 = önceki yılın aralığı). */
export const ayBasiAnahtari = (yil: number, ay: number) => new Date(Date.UTC(yil, ay - 1, 1)).toISOString().slice(0, 10);
/** Ayın son günü; ay 1–12, taşma serbest. */
export const ayinSonGunu = (yil: number, ay: number) => new Date(Date.UTC(yil, ay, 0)).toISOString().slice(0, 10);

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const gunYazisi = (gun: string) => { const [y, a, g] = gun.split("-"); return `${g}.${a}.${y}`; };
const ayYazisi = (gun: string) => { const [y, a] = gun.split("-").map(Number); return `${AYLAR[a - 1]} ${y}`; };

export function raporDonemi(aralik?: string, baslangic?: string, bitis?: string, simdi: number = Date.now()): Donem {
  const [yil, ay] = trToday(simdi).split("-").map(Number);
  if (aralik === "gecen_ay") {
    const bas = ayBasiAnahtari(yil, ay - 1);
    return { bas, son: ayinSonGunu(yil, ay - 1), anahtar: "gecen_ay", etiket: ayYazisi(bas) };
  }
  if (aralik === "bu_yil") return { bas: `${yil}-01-01`, son: `${yil}-12-31`, anahtar: "bu_yil", etiket: `${yil}` };
  if (aralik === "ozel" && gecerliGun(baslangic) && gecerliGun(bitis)) {
    const [bas, son] = baslangic <= bitis ? [baslangic, bitis] : [bitis, baslangic];
    return { bas, son, anahtar: "ozel", etiket: `${gunYazisi(bas)} – ${gunYazisi(son)}` };
  }
  const bas = ayBasiAnahtari(yil, ay);
  return { bas, son: ayinSonGunu(yil, ay), anahtar: "bu_ay", etiket: ayYazisi(bas) };
}

/*
  Okuma penceresi: istenen aralık ile altı aylık eğilim grafiğinin
  başlangıcından hangisi eskiyse o. Sorguyu daraltmanın tek amacı
  satır tavanına çarpmamak; gösterilen sayı değişmiyor.
*/
export function okumaBasi(donem: Donem, simdi: number = Date.now()): string {
  const [yil, ay] = trToday(simdi).split("-").map(Number);
  const egilimBasi = ayBasiAnahtari(yil, ay - 5);
  return donem.bas < egilimBasi ? donem.bas : egilimBasi;
}

/** Eğilim grafiği için son altı ayın anahtarları (en eskiden bugüne). */
export function sonAltiAy(simdi: number = Date.now()) {
  const [yil, ay] = trToday(simdi).split("-").map(Number);
  return Array.from({ length: 6 }, (_, sira) => {
    const bas = ayBasiAnahtari(yil, ay - 5 + sira);
    const [y, a] = bas.split("-").map(Number);
    return { bas, son: ayinSonGunu(y, a), ad: AYLAR[a - 1].slice(0, 3), simdiki: sira === 5 };
  });
}
