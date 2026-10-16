/*
  GİRİŞ HATASININ ANLAMI (16.10.2026).

  Giriş işlemi Supabase'in her hatasını "E-posta veya şifre hatalı"
  diye gösteriyordu. O gün yerel sunucu Supabase'e hiç ulaşamıyordu
  (TLS sertifikası doğrulanamadı, "fetch failed") ve kullanıcı doğru
  şifresini defalarca yazıp "hatalı" gördü — şifresini sıfırlamaya
  gidebilirdi. Ağ hatası, hız sınırı ve gerçek kimlik hatası üç ayrı
  durum; kullanıcıya üç ayrı şey söylenmeli.

  Saf modül: birim testi tests/giris-hatasi.test.ts.
*/
export type GirisHatasi = "invalid-credentials" | "server-error" | "too-many";

export function girisHataKodu(hata: { message?: string; status?: number; code?: string; name?: string } | null | undefined): GirisHatasi {
  if (!hata) return "invalid-credentials";
  const ileti = String(hata.message ?? "").toLowerCase();
  if (hata.status === 429 || hata.code === "over_request_rate_limit" || /rate limit|too many/.test(ileti)) return "too-many";
  /* Ağ: supabase-js bağlantı kurulamayınca AuthRetryableFetchError ve durum 0 veriyor. */
  if (hata.name === "AuthRetryableFetchError" || hata.status === 0 || /fetch failed|network|econn|timeout/.test(ileti)) return "server-error";
  if ((hata.status ?? 0) >= 500) return "server-error";
  return "invalid-credentials";
}
