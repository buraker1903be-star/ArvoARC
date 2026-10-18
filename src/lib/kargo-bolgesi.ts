/**
 * Yurtdışı kargo bölgesi.
 *
 * Tek bir "yurtdışı ücreti" uzak ülkelerde zarar ettiriyor, ülke
 * ülke tarife ise iki yüz satırlık bir tablo demek. Bölge ikisinin
 * arası.
 *
 * SAF: tarife listesi dışarıdan geliyor, testi var.
 */

export type Bolge = {
  label: string;
  /** ISO ülke kodları. Boş dizi = "öteki her yer". */
  countries: string[];
  /** Kargo ücreti (USD sent). */
  fee_cents: number;
  /** Bu tutarın üstünde ücretsiz (sent). 0 = eşik yok. */
  free_over_cents: number;
  sira: number;
};

/**
 * Ülkenin bölgesi.
 *
 * SIRA ÖNEMLİ: önce ülkeyi AÇIKÇA sayan bölgeler aranıyor,
 * bulunamazsa "öteki her yer" (boş ülke listesi) bölgesine
 * düşülüyor. Ters sırada olsaydı genel bölge, kendi ülkesi için
 * ayrı tarifesi olan bir yeri de yutardı.
 */
export function bolgeBul(
  bolgeler: Bolge[],
  ulkeKodu: string | null | undefined,
): Bolge | null {
  const kod = (ulkeKodu ?? "").trim().toUpperCase();
  const sirali = [...bolgeler].sort((a, b) => a.sira - b.sira);

  if (kod) {
    const tam = sirali.find((b) =>
      b.countries.some((c) => c.trim().toUpperCase() === kod),
    );
    if (tam) return tam;
  }

  return sirali.find((b) => b.countries.length === 0) ?? null;
}

/**
 * Kargo ücreti (sent).
 *
 * BÖLGE BULUNAMAZSA `null` — sıfır DEĞİL. Sıfır "kargo ücretsiz"
 * demek olurdu; tarifesi tanımlanmamış bir ülkeye bedava kargo
 * sözü vermek, o siparişin maliyetini üstlenmek demek. Çağıran
 * taraf null görünce o ülkeye satış yapmıyor.
 */
export function kargoSenti(
  bolgeler: Bolge[],
  ulkeKodu: string | null | undefined,
  sepetSenti: number,
): number | null {
  const bolge = bolgeBul(bolgeler, ulkeKodu);
  if (!bolge) return null;

  if (bolge.free_over_cents > 0 && sepetSenti >= bolge.free_over_cents) {
    return 0;
  }
  return bolge.fee_cents;
}
