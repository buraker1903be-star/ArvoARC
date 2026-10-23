/**
 * Tedarikçi ürününün adresi: ad + tedarikçi kodu.
 *
 * Saf dosya (tarzyeri.ts "server-only"); testi tests/urun-slugu.test.ts.
 */

/** Ürün adından URL uyumlu slug üretir. */
export function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/*
  KOD DA AYNI KURALDAN GEÇER (23.10.2026). Eskiden kod yalnızca küçük
  harfe çevrilip ekleniyordu; tedarikçi bir ürünün kodunu "TR- 11006"
  diye boşluklu gönderdi ve adres "…-siyah-tr- 11006" oldu. O ürünün
  sayfası 404 veriyordu ve site haritasında Google'a bozuk adres
  gidiyordu. Düzgün kodların ("TR-11090" → "tr-11090") adresi değişmiyor.
*/
export function urunSlugu(ad: string, kod: string) {
  return `${slugify(ad)}-${slugify(kod)}`;
}
