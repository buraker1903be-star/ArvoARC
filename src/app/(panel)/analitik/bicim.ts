/*
  ANALİTİK EKRANLARININ BİÇİMLENDİRMESİ.

  ArvoOS'un analitik modülünden taşındı (22.10.2026): iki panel aynı
  tasarım dilini ve aynı jeton sözlüğünü kullanıyor, bu yüzden ekranlar
  da aynı olmalı. Orada `app/panel/analitik/veri.ts` içindeydi;
  burada ayrı bir dosya, çünkü ArvoARC'ın veri katmanı `server-only`
  ve bu yardımcılar istemci bileşenlerinde de gerekiyor.
*/

/** "1.234" — panelin her yerinde aynı yazım. */
export const sayiYaz = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

const ULKE = (() => {
  try {
    return new Intl.DisplayNames(["tr"], { type: "region" });
  } catch {
    /* Intl bulunmayan bir ortamda kod basılıyor; adın görünmemesi
       sayfanın çizilmemesinden iyi. */
    return null;
  }
})();

/** ISO ülke kodu → Türkçe ad. Bilinmeyen kod olduğu gibi yazılır. */
export function ulkeAdi(kod: string | null | undefined) {
  if (!kod) return "Bilinmiyor";
  try {
    return ULKE?.of(kod) ?? kod;
  } catch {
    return kod;
  }
}

/*
  SAAT TÜRKİYE DİLİMİNDE. Sunucu UTC'de çalışıyor; dilim yazılmazsa
  akış listesi üç saat geriyi gösterir ve gece 00:00–03:00 arasındaki
  ziyaret bir önceki güne düşer. `npm run check:saat-dilimi` bu satırı
  arıyor, o yüzden `timeZone` TEK SATIRDA.
*/
const SAAT = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "14:32:08" — akış listesindeki olay saati. */
export const saatYaz = (iso: string) => SAAT.format(new Date(iso));
