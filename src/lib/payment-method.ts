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

/*
  MANUEL SİPARİŞİN ÖDEME TÜRÜ (17.10.2026).

  Panelden açılan sipariş metadata'ya hiçbir şey yazmıyordu ve ekran
  `payment_method ?? "Kredi kartı"` diyerek hepsini KART gösteriyordu —
  oysa pencerenin kendi tanımı "telefonla veya elden alınan sipariş",
  yani çoğu nakit ya da havale. Muhasebe tarafında yanlış duruyordu.

  Değer SERBEST METİN olarak saklanıyor (vitrin de öyle yazıyor), o
  yüzden izinli etiketler burada sabit: forma gelen başka bir metin
  kabul edilmiyor. Havale etiketi vitrinle BİREBİR aynı olmalı —
  havale akışları (ödeme onayı, 72 saat kuralı, iade reddi) metinde
  "havale" arıyor.
*/
export const HAVALE_ETIKETI = "Banka havalesi / EFT";

/*
  KART ETİKETİ DE YAZILIYOR (18.10.2026).

  Kartlı siparişler metadata'ya ödeme yöntemi YAZMIYORDU; ekranlar
  `payment_method ?? "Kredi kartı"` diyerek yokluğu "kart" olarak
  okuyordu. Yani "kart" ile "yöntem hiç kaydedilmemiş" aynı şeye
  iniyordu: yeni bir yöntem eklenip yazılmayı unutursa sessizce
  KART görünür ve muhasebe tarafında yanlış durur — manuel
  siparişlerde tam bu olmuştu.

  Yeni siparişler yöntemi açıkça taşıyor. Eski satırlarda alan boş
  kalıyor ve ekranlardaki `?? "Kredi kartı"` yedeği onlar için
  duruyor; geçmişi bu varsayımla yeniden yazmak, varsayımı veriye
  dönüştürmek olurdu.
*/
export const KART_ETIKETI = "Kredi kartı";

export const MANUEL_ODEME_TURLERI = [
  { deger: "Nakit", etiket: "Nakit" },
  { deger: HAVALE_ETIKETI, etiket: "Banka havalesi / EFT" },
  { deger: KART_ETIKETI, etiket: "Kredi kartı" },
] as const;

/** Formdan gelen değeri izinli etiketlere eşler; tanımadığını atar. */
export function manuelOdemeTuru(deger: FormDataEntryValue | string | null | undefined): string | null {
  const metin = String(deger ?? "").trim();
  return MANUEL_ODEME_TURLERI.some((t) => t.deger === metin) ? metin : null;
}

/*
  SANAL POS'TAN İADE EDİLEMEYEN SİPARİŞ.

  Havale için zaten böyleydi (para PayTR'dan geçmedi). NAKİT de aynı
  kümede: elden alınan parayı sanal POS iade edemez ve denense
  sağlayıcı hatası dönerdi — operasyoncu da sebebini ekranda göremezdi.
  Havaleye özel ekranlar (ödeme onayı, 72 saat uyarısı) yine yalnızca
  isBankTransfer'a bakıyor; burası SADECE iade yolu için.
*/
export function saglayicidanIadeEdilemez(metadata: unknown) {
  const method = (metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).payment_method : null) ?? "";
  const metin = String(method).toLocaleLowerCase("tr-TR");
  return metin.includes("havale") || metin.includes("nakit");
}
