/*
  Türkiye UTC+3 ve yaz saati uygulamıyor: gün sınırları sabit
  ofsetle hesaplanır. Sunucu UTC'de çalıştığı için setUTCHours ile
  bulunan "gece yarısı" Türkiye'de 03:00'tü; gece siparişleri bir
  önceki güne yazılıyordu.
*/
export const DAY = 86_400_000;
export const TR_OFFSET = 3 * 3_600_000;

/** Verilen anın Türkiye saatine göre gün başlangıcı (epoch ms). */
export const trDayStart = (ms: number) => Math.floor((ms + TR_OFFSET) / DAY) * DAY - TR_OFFSET;
