/**
 * CSV'deki tutarı kuruşa çevirir.
 *
 * - İki tür ayırıcı varsa sondaki ondalıktır: "1.234,56" (Türkçe)
 *   ve "1,234.56" (İngilizce) ikisi de 123456 kuruş.
 * - Tek tür ayırıcı varsa ve son grup tam 3 haneyse binliktir:
 *   "1.234" = 1.234 ₺ (Türkçe binlik), "1.234.567" = 1.234.567 ₺.
 *   Önceden "1.234" 1,23 ₺ okunuyordu.
 * - Aksi hâlde ondalıktır: "12,50" ve "12.5" = 12,50 ₺.
 *
 * Geçersiz ya da boş değer 0 döner; eksi tutar 0'a çekilir.
 */
export function parseMoneyToCents(value: string | undefined | null) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const groups = raw.split(lastComma >= 0 ? "," : ".");
    const thousands = groups.length > 2 || groups[groups.length - 1].length === 3;
    normalized = thousands ? groups.join("") : groups.join(".");
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

/*
  FORM ALANINDAKİ TUTAR (16.10.2026).

  Panelin para alanları `Number(formData.get(...))` ile okunuyordu:
  Türkçe'de doğal olan "1.500" (bin beş yüz) 1,5 oluyor ve fiyat, kargo
  ücreti, iade tutarı BİNDE BİRİNE iniyordu; "1.234,56" NaN olup
  reddediliyordu. `type="number"` kutusu bunu engellemiyor: Chrome
  tr-TR'de "1.500" yazılınca değer yine "1.500" gidiyor.

  parseMoneyToCents okunamayanı 0 sayıyor; form için bu yetmez — "abc"
  yazan kişiye sessizce "0 ₺ kaydedildi" denirdi. Burada boş alan 0,
  okunamayan ya da eksi girdi null: çağıran reddeder.
*/
export function formTutari(value: FormDataEntryValue | string | null | undefined): number | null {
  const ham = String(value ?? "").replace(/\s/g, "").replace(/₺|TL$/i, "");
  if (!ham) return 0;
  if (!/^[0-9.,]+$/.test(ham) || !/[0-9]/.test(ham)) return null;
  return parseMoneyToCents(ham);
}
