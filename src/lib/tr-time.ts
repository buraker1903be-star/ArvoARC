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

/**
 * datetime-local değeri ("2026-09-20T10:00") Türkiye saati olarak
 * okunur. `new Date(değer)` sunucunun saatini (Vercel'de UTC)
 * kullanıyordu: 10:00'da başlaması gereken kampanya 13:00'te
 * başlıyordu. Geçersiz tarihte (31 Şubat gibi) null döner.
 */
export function trLocalToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - TR_OFFSET;
  const local = new Date(ms + TR_OFFSET);
  if (local.getUTCMonth() !== Number(month) - 1 || local.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) return null;
  return new Date(ms).toISOString();
}
