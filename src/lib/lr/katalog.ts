/*
  LR'IN HERKESE AÇIK KATALOG SAYFALARININ OKUNMASI. Saf modül; testi
  tests/lr-katalog.test.ts, örneği tests/fixtures/lr-kategori.html
  (27.09.2026'da canlı sayfadan kırpıldı).

  Neden sunucu tarafı: LR'ın /cms/TR/tr/… kategori sayfaları GİRİŞSİZ
  açılıyor ve müşteri fiyatlarını sunucuda basıyor — bizim tavan
  fiyatımız tam olarak bu. Portalın girişli kısmı (alış fiyatları) hâlâ
  tarayıcı toplayıcısıyla okunuyor; orası CAS SSO'nun arkasında ve
  şifre saklamak gerekirdi.

  Kartın yapısı (aynı gün ölçüldü):
    <article class="product-element">
      … href="…?productAlias=81000-17"
      <h3><a …>Aloe Vera Jel İçecek</a></h3>
      <div class="price sale"><del>2.562,90 ₺</del><span>1.882,90 ₺</span></div>
      <div class="hint">(62.763,33 ₺ 1 l için)</div>

  <del> indirimden ÖNCEKİ fiyat, .hint ise LİTRE fiyatı. İkisini de
  elemek şart: litre fiyatı büyük ambalajlarda ürün fiyatından düşük
  oluyor ve onu fiyat sanmak ürünü zararına satmak demekti.
*/

const KART_RE = /<article[^>]*class="[^"]*product-element[^"]*"[\s\S]*?<\/article>/gi;
const ALIAS_RE = /productAlias=([A-Za-z0-9._-]{2,40})/;
const AD_RE = /<h3[^>]*>([\s\S]*?)<\/h3>/i;
const FIYAT_KUTUSU_RE = /<div[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
const FIYAT_RE = /\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}(?!\d)/g;
/*
  Kategori sayfaları: /cms/<ÜLKE>/<dil>/…/….html — sorgu dizgesiyle de
  olabiliyor: LR oturum belirtecini adrese yazıyor (?casrnc=…) ve
  ".html" ile BİTMEYİ şart koşan bir kalıp o bağlantıları kaçırıyordu.
*/
const KATEGORI_RE = /href="([^"]*\/cms\/[A-Z]{2}\/[a-z]{2}\/[^"]*\.html(?:\?[^"]*)?)"/gi;

export interface LrUrunu {
  /** LR'ın ürün kimliği: taban numara + varyant eki ("81000-17"). */
  sku: string;
  ad: string;
  /** Sayfada yazdığı gibi; kuruşa çevirme parseMoneyToCents'te. */
  fiyat: string;
}

const varliklar: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#039;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };

const metinleştir = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (v) => varliklar[v.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();

export function urunleriAyristir(html: string): { satirlar: LrUrunu[]; atlanan: number } {
  const satirlar: LrUrunu[] = [];
  const gorulen = new Map<string, number>();
  let atlanan = 0;

  for (const kart of String(html ?? "").match(KART_RE) ?? []) {
    const sku = ALIAS_RE.exec(kart)?.[1];
    /*
      Üstü çizili ve birim fiyat kartın gövdesinden ÇIKARILIYOR; geri
      kalan metinde yalnızca geçerli fiyat kalıyor.
    */
    const govde = kart
      .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, " ")
      .replace(/<div[^>]*class="[^"]*\bhint\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ");

    const kutular = [...govde.matchAll(FIYAT_KUTUSU_RE)].flatMap((m) => metinleştir(m[1]).match(FIYAT_RE) ?? []);
    /* Fiyat kutusu bulunamazsa kartın tamamından okunuyor (kalıp değişebilir). */
    const fiyatlar = kutular.length ? kutular : metinleştir(govde).match(FIYAT_RE) ?? [];

    if (!sku || !fiyatlar.length) { atlanan += 1; continue; }
    const ad = metinleştir(AD_RE.exec(kart)?.[1] ?? "").slice(0, 160);
    const satir = { sku, ad, fiyat: fiyatlar[0] };

    /* Aynı ürün birkaç kategoride görünüyor; sonuncu kazanıyor. */
    const yer = gorulen.get(sku);
    if (yer === undefined) { gorulen.set(sku, satirlar.length); satirlar.push(satir); }
    else satirlar[yer] = satir;
  }
  return { satirlar, atlanan };
}

/**
 * Sayfadaki kategori bağlantıları, mutlak adres olarak.
 *
 * YALNIZCA AYNI SUNUCU: bağlantı listesi LR'ın sayfasından geliyor ve
 * dışarıdaki bir adrese istek atmak, sayfaya konan herhangi bir
 * bağlantının sunucumuzu oraya yönlendirmesi demekti.
 */
export function kategoriBaglantilari(html: string, temel: string): string[] {
  const kok = new URL(temel);
  const adresler = new Set<string>();
  for (const eslesme of String(html ?? "").matchAll(KATEGORI_RE)) {
    let adres: URL;
    try {
      adres = new URL(eslesme[1].replace(/&amp;/g, "&"), temel);
    } catch {
      continue;
    }
    if (adres.host !== kok.host || adres.protocol !== "https:") continue;
    adres.hash = "";
    /* Oturum belirteci adrese yazılıyor (casrnc); aynı sayfa iki kez gezilmesin. */
    adres.searchParams.delete("casrnc");
    adresler.add(adres.toString());
  }
  return [...adresler];
}
