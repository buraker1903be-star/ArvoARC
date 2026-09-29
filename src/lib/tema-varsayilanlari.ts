/*
  TEMA VARSAYILANLARI — kiracıdan türeyen, yayınlanmaya elverişli metinler.

  Varsayılanlar ArvoCulture'ın METİNLERİYDİ ve sayfanın içine gömülüydü:
  marka adı ("ARVOCULTURE · APPAREL & BEAUTY"), o markanın sloganları
  ("Kendini giy.", "İki dünya. Tek yaşam kültürü."), o markanın
  koleksiyon bağlantıları (/koleksiyon/giyim), o markanın renkleri ve —
  en kötüsü — BAŞKA BİR MAĞAZANIN KUPON KODU ("İlk siparişinde ARVO10
  koduyla %10 indirim").

  Yeni bir salon Mağaza Tasarımı'nı açtığında bunları görüyor, "Taslağı
  kaydet"e bastığında da kendi temasına yazıyordu. Çok kiracılı bir
  üründe ikinci salonun vitrini, var olmayan bir kuponu duyuruyor ve
  404 veren bağlantılar gösteriyor olurdu.

  KURAL: VARSAYILAN, OLDUĞU GİBİ YAYINLANSA DA DOĞRU OLMALI.
  Başka markanın adı yok, olmayan kupon yok, 404 veren bağlantı yok,
  tutamayacağımız vaat yok ("hızlı teslimat" gibi). Genel bir metin
  kabul edilebilir; YANLIŞ metin değil.

  Bağlantılar mağazanın köküne ("/") gidiyor: yeni salonun henüz
  koleksiyonu yok ve tema eylemindeki href() zaten tanımadığı değeri
  "/" yapıyor.

  Saf dosya; testi tests/tema-varsayilanlari.test.ts.
*/

export type TemaKimligi = {
  magazaAdi: string;
  /** arc_store_settings.primary_color, yoksa kurumunki. */
  anaRenk?: string | null;
  vurguRenk?: string | null;
  arkaRenk?: string | null;
};

/* Renk yoksa nötr bir çift: koyu metin, altın vurgu, beyaz zemin.
   Markası olmayan bir mağazada bunlar "varsayılan" gibi okunuyor. */
export const NOTR_ANA = "#111827";
export const NOTR_VURGU = "#B28A49";
export const NOTR_ARKA = "#FFFFFF";

const renk = (deger: string | null | undefined, yedek: string) =>
  typeof deger === "string" && /^#[0-9A-Fa-f]{6}$/.test(deger.trim()) ? deger.trim().toUpperCase() : yedek;

export function temaVarsayilanlari(kimlik: TemaKimligi) {
  const ad = String(kimlik.magazaAdi ?? "").trim() || "Mağaza";
  return {
    announcement: `${ad} · özenle seçilmiş ürünler`,
    hero_eyebrow: ad.toLocaleUpperCase("tr-TR"),
    hero_title: "Seçkimizi",
    hero_emphasis: "keşfedin.",
    hero_description: "Mağazamızdaki ürünleri inceleyin, beğendiklerinizi sepete ekleyin.",
    primary_cta_label: "Ürünleri keşfet",
    primary_cta_href: "/",
    secondary_cta_label: "Koleksiyonlar",
    secondary_cta_href: "/",
    featured_eyebrow: "ÖNE ÇIKANLAR",
    featured_title: "Öne çıkan ürünler.",
    /*
      Kampanya bölümü KAPALI başlıyor: yeni mağazanın kampanyası yok ve
      boş bir kampanya şeridi, olmayan bir indirimi duyurmaktan daha
      iyi ama yine de gürültü. Kullanıcı kampanyasını kurunca açıyor.
    */
    campaign_title: "Kampanyanız burada görünür.",
    campaign_description: "İndirimlerinizi duyurmak için bu bölümü açın.",
    show_campaign: false,
    manifest_title: "Hakkımızda.",
    manifest_description: "Mağazanızı birkaç cümleyle tanıtın.",
    apparel_title: "Koleksiyonlarımız",
    apparel_description: "Seçtiğimiz ürünler.",
    beauty_title: "Yeni gelenler",
    beauty_description: "Kataloğa son eklenenler.",
    /* Dördü de tutabileceğimiz sözler: kargo hızı gibi bir vaat yok. */
    trust_one: "Güvenli ödeme",
    trust_two: "Özenli paketleme",
    trust_three: "Kolay iade",
    trust_four: "Müşteri desteği",
    footer_tagline: `${ad} · güvenli alışveriş`,
    primary_color: renk(kimlik.anaRenk, NOTR_ANA),
    accent_color: renk(kimlik.vurguRenk, NOTR_VURGU),
    background_color: renk(kimlik.arkaRenk, NOTR_ARKA),
  };
}
