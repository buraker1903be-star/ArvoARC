/**
 * Ziyaret kaynağının okunabilir adı.
 *
 * Kayıtta duran şey ham: `utm_source` değeri ya da yönlendiren
 * sitenin konağı ("l.instagram.com", "www.google.com.tr",
 * "t.co"). Listede bunları olduğu gibi göstermek aynı platformu
 * üç ayrı satıra bölüyor ve "l.instagram.com" kimseye bir şey
 * söylemiyor.
 *
 * SAF: ağ ya da veritabanı yok, testi tests/ziyaret-kaynagi.test.ts.
 */

/*
  Eşleşme PARÇAYA bakıyor, tam ada değil: Google'ın ülke alan
  adları (google.com.tr, google.de) ve Instagram'ın yönlendirme
  konakları (l.instagram.com) aynı platform.
*/
const PLATFORMLAR: Array<[RegExp, string]> = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)instagram\.com$|^instagram$|^ig$/, "Instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$|^facebook$|^fb$/, "Facebook"],
  [/(^|\.)tiktok\.com$|^tiktok$/, "TikTok"],
  /* t.co Twitter/X'in kısaltma alan adı: tıklama oradan geliyor. */
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|^t\.co$|^twitter$|^x$/, "X"],
  [/(^|\.)youtube\.com$|^youtu\.be$|^youtube$/, "YouTube"],
  [/(^|\.)pinterest\.|^pinterest$/, "Pinterest"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$|^linkedin$/, "LinkedIn"],
  [/whatsapp|^wa\.me$/, "WhatsApp"],
  [/(^|\.)bing\.com$|^bing$/, "Bing"],
  [/(^|\.)yandex\./, "Yandex"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)telegram\.|^t\.me$/, "Telegram"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/^(mail|outlook|gmail)\.|(^|\.)yahoo\./, "E-posta"],
];

/**
 * Ham kaynaktan platform adı.
 *
 * Boş değer "Doğrudan": adres çubuğuna yazarak, yer iminden ya da
 * uygulama içinden gelinmiş. Uydurma bir etiket ("Bilinmeyen")
 * koymak onu bir platform gibi gösterirdi.
 */
export function kaynakAdi(ham: string | null | undefined): string {
  const deger = (ham ?? "").trim().toLowerCase();
  if (!deger) return "Doğrudan";

  for (const [desen, ad] of PLATFORMLAR) {
    if (desen.test(deger)) return ad;
  }

  /*
    Tanınmayan kaynak OLDUĞU GİBİ gösteriliyor, "Diğer" diye
    toplanmıyor: hangi siteden geldiğini görmek, o sitenin adını
    bilmekten daha değerli. Yalnızca "www." atılıyor.
  */
  return deger.replace(/^www\./, "");
}
