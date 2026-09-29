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

  Aynı dosyada ADRES DEFTERİ de var: gelen bir isteğin hangi kiracıya
  ait olduğu. Giden adresle aynı kuralı paylaşmaları şart — iki yerde
  iki kural olsaydı panelin "adresin bu" dediği yerden gelen istek
  reddedilirdi.

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

/* "www." aynı mağazanın ikinci adı; şema ve yol atılıyor. */
export function konakSadelestir(deger: string): string {
  const semali = deger.includes("://") ? deger : `https://${deger}`;
  try {
    return new URL(semali).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return deger.toLowerCase().replace(/^www\./, "");
  }
}

export type VitrinSatiri = {
  organization_id: string;
  custom_domain?: string | null;
  domain_verified_at?: string | null;
  platform_subdomain?: string | null;
  storefront_url?: string | null;
};

/*
  ADRES DEFTERİ — konak → kurum.

  İKİ KUSUR BURADAN ÇIKTI (29.09.2026'da üretildi):

  1) ALT ALAN ADI ÇIPLAK EŞLEŞTİRİLİYORDU. Ayarlarda "salon-beta"
     yazıyor, isteğin konağı ise "salon-beta.shop.arvo-os.com";
     ikisi eşleşmediği için TEK adresi alt alan adı olan mağaza —
     yani kiracı açılışının verdiği adres — hiçbir vitrin ucundan
     geçemiyordu: sepet, kupon ve kimlik istekleri reddediliyordu.

  2) storefront_url TEKİL DEĞİL. Bir kiracı oraya başka bir mağazanın
     alan adını yazabiliyordu ve eşleşme "listede önce gelen" ile
     bulunuyordu; sıra veritabanından geldiği için rakibin vitrininden
     gelen sipariş yabancı bir kuruma yazılabilir, tahsilat da o
     kurumun PayTR hesabına gidebilirdi.

  KURAL. Önce KANITLI adresler yazılıyor: doğrulanmış özel alan adı ve
  platform alt alan adı (ikisinin de tekillik kısıtı var). storefront_url
  yalnızca BOŞTA KALAN konakları dolduruyor — eski mağazalar çalışmaya
  devam etsin diye. İki kayıt aynı konağı iddia ederse konak defterden
  DÜŞÜYOR: yanlış mağazaya yazmaktansa isteği reddetmek yeğdir.
*/
export function vitrinDefteri(satirlar: VitrinSatiri[]): Map<string, string> {
  const defter = new Map<string, string>();
  const cakisan = new Set<string>();
  const yaz = (konak: string, kurum: string) => {
    if (cakisan.has(konak)) return;
    const onceki = defter.get(konak);
    if (onceki && onceki !== kurum) {
      defter.delete(konak);
      cakisan.add(konak);
      return;
    }
    defter.set(konak, kurum);
  };

  for (const satir of satirlar) {
    const ozel = (satir.custom_domain ?? "").trim();
    if (ozel && (satir.domain_verified_at ?? "").trim()) yaz(konakSadelestir(ozel), satir.organization_id);
    const altAlan = (satir.platform_subdomain ?? "").trim();
    if (altAlan) yaz(konakSadelestir(altAlanAdresi(altAlan)), satir.organization_id);
  }

  /* İkinci geçiş: kanıtlı adresler yerini aldıktan SONRA. */
  const eskiler = new Map<string, string | null>();
  for (const satir of satirlar) {
    const eski = (satir.storefront_url ?? "").trim();
    if (!eski) continue;
    const konak = konakSadelestir(eski);
    if (defter.has(konak) || cakisan.has(konak)) continue;
    /* Aynı konağı iki eski kayıt iddia ederse kimseye verilmiyor. */
    eskiler.set(konak, eskiler.has(konak) && eskiler.get(konak) !== satir.organization_id ? null : satir.organization_id);
  }
  for (const [konak, kurum] of eskiler) if (kurum) defter.set(konak, kurum);

  return defter;
}
