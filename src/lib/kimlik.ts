/*
  KİMLİK BİÇİMİ: BOZUK ADRES "KAYIT YOK"TUR, ÇÖKME DEĞİL.

  Detay sayfaları adresten gelen kimliği doğrudan sorguya veriyordu.
  Postgres uuid olmayan bir değeri reddediyor (22P02, "invalid input
  syntax for type uuid") ve sayfa okuma hatasını fırlattığı için
  kullanıcı çökme ekranı görüyordu. 16.10.2026'da canlıda ölçüldü:
  /siparisler/bozuk-kimlik, /urunler/bozuk-kimlik ve
  /koleksiyonlar/bozuk-kimlik üçü birden "Bir sorun oluştu" veriyordu.
  Var olmayan ama biçimi doğru bir kimlik zaten doğru davranıyor
  (notFound), yani ayrım yalnızca biçimde.

  Gerçekçi yol bağlantının kırpılması: sipariş adresi WhatsApp'ta ya da
  e-postada satır sonuna denk gelince yarım gidiyor.

  Denetim sorguya GİTMEDEN yapılıyor; müşteri anahtarı gibi uuid
  olmayan parametreler bu denetimden geçmez (/musteriler/[key] bir
  slug taşıyor ve zaten doğru davranıyor).
*/
const UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adresten gelen değer uuid biçiminde mi? */
export function kimlikMi(deger: string | undefined | null): boolean {
  return typeof deger === "string" && UUID_DESENI.test(deger);
}
