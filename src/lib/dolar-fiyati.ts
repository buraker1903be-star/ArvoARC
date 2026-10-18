/**
 * TL fiyatından dolar fiyatı.
 *
 * NEDEN SAF BİR DOSYA: aynı hesabı iki taraf yapıyor — vitrin
 * fiyatı gösterirken, ArvoARC siparişi hesaplarken. İkisi
 * ayrılırsa müşteri ödemede başka tutar görür; bu depoda o sapma
 * bir kez yaşandı (17 Eylül 2026, kargo ve havale kuralı).
 * Kural burada ve testi var.
 *
 * KÂR PAYI KURA GÖMÜLÜ DEĞİL, ÜSTÜNE EKLENİYOR. İkisi tek sayı
 * olsaydı "kur ne, kârım ne" sorusu yanıtsız kalırdı ve kur
 * güncellenirken kâr payının da yeniden hesaplanması gerekirdi.
 */

export type DolarAyari = {
  /** 1 USD kaç TL. */
  kur: number;
  /** Dolar fiyatına eklenen yüzde. */
  karPayi: number;
};

/**
 * Kuruş (TL) → sent (USD).
 *
 * YUKARI YUVARLANIYOR. Aşağı yuvarlamak her üründe bir sentlik
 * zarar demek ve binlerce üründe o zarar birikir; müşteri
 * açısından fark bir sent. Kuruş hesabında da aynı yön tutuluyor
 * (ArvoARC her yerde kuruş tamsayısı kullanıyor).
 *
 * Kur yoksa ya da sıfırsa `null`: uydurma bir kurla fiyat
 * göstermek, ödenenden farklı bir rakam göstermektir. Çağıran
 * taraf null görünce yurtdışı fiyatını hiç göstermiyor.
 */
export function dolarSenti(
  kurus: number,
  ayar: DolarAyari | null | undefined,
): number | null {
  const kur = Number(ayar?.kur ?? 0);
  if (!Number.isFinite(kur) || kur <= 0) return null;

  const kar = Number(ayar?.karPayi ?? 0);
  const carpan = 1 + (Number.isFinite(kar) ? kar : 0) / 100;
  if (carpan <= 0) return null;

  const dolar = (kurus / 100 / kur) * carpan;
  return Math.ceil(dolar * 100);
}

/** Sent → "$1,234.56". Yurtdışı vitrini İngilizce yazımla. */
export function dolarYazisi(sent: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(sent / 100);
}
