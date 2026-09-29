/*
  MAĞAZA ADRESİ — vitrinin hangi adreste açıldığı, tek yerde.

  Sonek üç ayrı dosyada elle yazılıydı (ayarlar sayfası, ayarlar
  eylemi, önizleme). Platform alan adı bir gün değişirse üçünün
  birden değişmesi gerekirdi ve biri unutulursa panel, mağazanın
  gerçekte açılmadığı bir adresi gösterirdi.

  SIRALAMA ÇÖZÜCÜYLE AYNI. Veritabanındaki arc_storefront_org önce
  DOĞRULANMIŞ özel alan adına, sonra platform alt alan adına bakıyor;
  buradaki sıra da öyle. Doğrulanmamış özel alan adı adres sayılmıyor:
  DNS bağlanmadan o adres açılmıyor ve panelde "adresin bu" demek
  kullanıcıyı 404'e gönderirdi.

  storefront_url yalnızca EN SON çare: eski mağazaların adresi orada
  duruyor. Çözücü onu bilerek tanımıyor (tekillik kısıtı yok, komşunun
  alan adı yazılabilirdi); burada okumak zararsız, çünkü soru "bu
  salonun kendi adresi ne" — kimlik değil, bağlantı.

  Saf dosya; testi tests/magaza-adresi.test.ts.
*/

export const ALT_ALAN_SONEKI = "shop.arvo-os.com";

export const altAlanAdresi = (altAlan: string) => `${altAlan}.${ALT_ALAN_SONEKI}`;

export type MagazaAdresAyari = {
  custom_domain?: string | null;
  domain_verified_at?: string | null;
  platform_subdomain?: string | null;
  storefront_url?: string | null;
} | null;

const dolu = (deger: unknown) => (typeof deger === "string" ? deger.trim() : "");

/* Dağıtım adresleri kalıcı değil: silinen bir Vercel dağıtımı
   önizlemeyi 404'e çeviriyor ve editörü kullanılamaz yapıyordu. */
function gecerliUrl(deger: string): string | null {
  try {
    const url = new URL(deger);
    if (url.protocol !== "https:") return null;
    if (url.hostname.endsWith(".vercel.app")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Mağazanın açık adresi; hiçbiri yoksa null. */
export function magazaAdresi(ayar: MagazaAdresAyari): string | null {
  const ozel = dolu(ayar?.custom_domain);
  if (ozel && dolu(ayar?.domain_verified_at)) return `https://${ozel.toLowerCase()}`;
  const altAlan = dolu(ayar?.platform_subdomain);
  if (altAlan) return `https://${altAlanAdresi(altAlan.toLowerCase())}`;
  const eski = dolu(ayar?.storefront_url);
  return eski ? gecerliUrl(eski) : null;
}
