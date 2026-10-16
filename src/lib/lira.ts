/* Kaynak: ArvoOS/lib/lira.ts (16.10.2026, ArvoARC paneli ArvoOS'un bileşenleriyle yeniden yazılıyor). */
/*
  Kuruşu ekranda okunur liraya çeviren TEK yer.

  Aynı biçimlendirici üç dosyada ayrı ayrı yazılmıştı (abonelik-bildirimi,
  odeme-baglantisi, renewal-reminders) ve üçünün seçenekleri birbirinden
  farklıydı: biri `minimumFractionDigits`, biri `maximumFractionDigits`
  kullanıyordu, yani aynı tutar gönderilen postada "1.500 ₺", ödeme
  bağlantısında "1.500,00 ₺" görünüyordu. Para biçimi müşteriye giden bir
  şey; iki ekranda iki türlü yazılması "hangisi doğru" sorusunu doğuruyor.

  Para kuruş cinsinden tamsayıdır (AGENTS.md); burada yalnızca gösterim
  yapılır, hesap yapılmaz.
*/
const BICIM = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 249_00 kuruş → "249,00 ₺" */
export const liraYaz = (kurus: number): string => BICIM.format(Math.round(kurus) / 100);
