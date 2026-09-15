/*
  Havale siparişleri PayTR'dan geçmiyor; para iadesi de PayTR'dan
  yapılamaz. Vitrin ödeme servisi (api/storefront/odeme) bu
  siparişlerin metadata'sına "Banka havalesi / EFT" yazıyor.
*/
/* Havale bu süreden uzun ödenmezse "süresi geçti" sayılır (Operasyon, Genel Bakış, bildirimler). */
export const TRANSFER_STALE_HOURS = 72;

export function isBankTransfer(metadata: unknown) {
  const method = (metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).payment_method : null) ?? "";
  return String(method).toLocaleLowerCase("tr-TR").includes("havale");
}
