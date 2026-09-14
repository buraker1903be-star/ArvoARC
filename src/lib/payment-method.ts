/*
  Havale siparişleri PayTR'dan geçmiyor; para iadesi de PayTR'dan
  yapılamaz. Vitrin ödeme servisi (api/storefront/odeme) bu
  siparişlerin metadata'sına "Banka havalesi / EFT" yazıyor.
*/
export function isBankTransfer(metadata: unknown) {
  const method = (metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).payment_method : null) ?? "";
  return String(method).toLocaleLowerCase("tr-TR").includes("havale");
}
