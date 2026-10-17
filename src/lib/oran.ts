/*
  YÜZDE YUVARLAMA (17.10.2026).

  3.257 / 3.264 = %99,8 → yuvarlanınca %100 oluyor ve ekran "hepsi
  yayında" diyor; oysa yedi ürün dışarıda. Aynı tuzağın tersi de var:
  binde bir oran %0 çıkıp "hiç yok" diye okunuyor.

  Kural: yuvarlama UÇLARI UYDURMAZ. %100 yalnızca gerçekten hepsiyse,
  %0 yalnızca gerçekten sıfırsa yazılır; aradaki değerler en yakın
  tam sayıya yuvarlanır ama 1–99 aralığına sıkıştırılır.

  Saf; testi tests/oran.test.ts.
*/
export function yuzdeOrani(deger: number, taban: number): number | null {
  if (!taban) return null;
  if (deger <= 0) return 0;
  if (deger >= taban) return 100;
  const ham = (deger / taban) * 100;
  return Math.min(99, Math.max(1, Math.round(ham)));
}
