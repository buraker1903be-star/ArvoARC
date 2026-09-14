/**
 * CSV'deki tutarı kuruşa çevirir.
 *
 * Ondalık ayırıcı, metindeki son ayırıcıdır: "1.234,56" (Türkçe)
 * ve "1,234.56" (İngilizce) ikisi de 123456 kuruş. Öncesinde
 * nokta her zaman ondalık sayılıyordu; Türkçe biçimli bir tutar
 * 1000 kat küçük okunuyordu ("1.234,56" → 1,23 ₺).
 *
 * Tek bir virgül ondalık kabul edilir ("12,50" → 1250).
 * Geçersiz ya da boş değer 0 döner; eksi tutar 0'a çekilir.
 */
export function parseMoneyToCents(value: string | undefined | null) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized = lastComma > lastDot
    ? raw.replace(/\./g, "").replace(",", ".").replace(/,/g, "")
    : raw.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}
