/*
  ÇEVİRİ DENETİMİ — SAF.

  Çeviri KENDİ SUNUCUNDAKİ açık ağırlıklı bir modelden geliyor (kurum
  sahibinin kararı: ücret yok ve ürün verisi dışarı çıkmıyor).
  Bedeli kalitenin DEĞİŞKEN olması: açık modeller Türkçe metni olduğu
  gibi geri verebiliyor, "Here is the translation:" diye
  konuşabiliyor, markdown çitiyle sarabiliyor ya da cümleyi yarıda
  bırakabiliyor.

  Bu yüzden çıktı YAZILMADAN ÖNCE denetleniyor ve kuşkulu olan
  ATILIYOR. Yarım ya da Türkçe kalmış bir "İngilizce" ürün adı,
  çevirisiz bir üründen kötü: çevirisiz ürün Türkçe adıyla görünüyor
  ve bu dürüst; "Kadin 3 Iplik Sardonsuz" gibi bir şey ise hem
  anlaşılmaz hem özensiz.

  SAF: ağ yok, yalnızca metin kararı. Böylece kural sınanabiliyor —
  müşterinin okuduğu ürün adını üreten bir kuralın testi olmalı.
*/

/** Ürün adı en fazla bu kadar: katalogdaki en uzun Türkçe ad ~120. */
export const AD_SINIRI = 200;
/** Açıklama en fazla bu kadar; daha uzunu modelin uydurduğunu gösteriyor. */
export const ACIKLAMA_SINIRI = 4000;

/*
  TÜRKÇEYE ÖZGÜ HARFLER. "ı", "ş", "ğ" ve "İ" İngilizce metinde
  geçmiyor; biri varsa model çevirmemiş ya da yarım çevirmiş.

  "ö", "ü", "ç" BİLEREK YOK: İngilizcede alıntı sözcüklerde
  geçebiliyor (ör. marka adları, "façade") ve onları reddetmek
  doğru çevirileri de atardı.
*/
const TURKCE_HARF = /[ışğİıŞĞ]/;

/*
  MODEL KONUŞMASI. Açık modeller yanıtı cümleyle sarmaya meyilli;
  bu kalıplar çıktının çeviri DEĞİL sohbet olduğunu gösteriyor.
*/
const KONUSMA = [
  /^\s*(here\s+is|here's|sure[,!]|certainly|of\s+course|translation\s*:)/i,
  /^\s*```/,
  /\bas\s+an\s+ai\b/i,
  /^\s*(işte|buyurun)/i,
];

/*
  HEDEF GRUP KORUNMALI — MEKANİK DENETİM.

  Canlıda ölçüldü: "Çocuk Unisex Baskılı T-Shirt" → "Unisex Crew Neck
  T-Shirt". "Çocuk" DÜŞTÜ ve bu ciddi: çocuk bedeni bir ürünü
  yetişkin ürünü gibi listelemek, müşterinin yanlış ürün almasıyla
  sonuçlanır ve iade kaçınılmaz.

  Bu hata anlamsal ama MEKANİK OLARAK YAKALANABİLİR: kaynak adı
  bilinen bir hedef grup sözcüğüyle başlıyorsa, çevirinin
  karşılığını TAŞIMASI gerekiyor. Taşımıyorsa çeviri reddediliyor ve
  ürün Türkçe adıyla kalıyor — dürüst olan bu.

  SIRA ÖNEMLİ: "Erkek Çocuk" (boys) "Erkek" ile BAŞLIYOR; uzun
  ifadeler önce aranıyor, yoksa erkek çocuk ürünü "Men's" sayılırdı.
*/
const HEDEF_GRUPLAR: Array<[RegExp, string[]]> = [
  [/^kız\s+çocuk/i, ["girl"]],
  [/^erkek\s+çocuk/i, ["boy"]],
  [/^çocuk/i, ["kid", "child", "junior"]],
  [/^bebek/i, ["baby", "infant"]],
  [/^kadın/i, ["women", "woman", "ladies"]],
  [/^erkek/i, ["men", "man"]],
];

/** Kaynak hedef grupla başlıyorsa çeviri karşılığını taşıyor mu? */
export function hedefGrubuKoruyor(kaynak: string, ceviri: string): boolean {
  const temiz = kaynak.trim();
  for (const [desen, karsiliklar] of HEDEF_GRUPLAR) {
    if (!desen.test(temiz)) continue;
    const dusuk = ceviri.toLowerCase();
    return karsiliklar.some((k) => dusuk.includes(k));
  }
  /* Hedef grupla başlamayan ad bu denetimin dışında. */
  return true;
}

export type CeviriKarari =
  | { kabul: true; metin: string }
  | { kabul: false; sebep: string };

/**
 * Bir çeviri satırı kabul edilebilir mi?
 *
 * `kaynak` Türkçe özgün metin: çıktı ONUNLA AYNIYSA model çevirmemiş
 * demektir ve yazmak, çevirdiğini sanıp bir daha dönmemek olurdu.
 */
export function ceviriKarari(
  ham: unknown,
  kaynak: string,
  sinir: number,
  /*
    Hedef grup denetimi yalnızca ADA uygulanıyor: açıklama metninde
    "Kadın" sözcüğü geçmek zorunda değil ve zorlamak doğru
    çevirileri atardı.
  */
  hedefGrubuSina = false,
): CeviriKarari {
  if (typeof ham !== "string") return { kabul: false, sebep: "metin değil" };

  /* Model bazen tırnak ya da çit ekliyor; kırpmak çeviriyi
     kurtarıyor ve anlamını değiştirmiyor. */
  const metin = ham
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/, "")
    .replace(/^["'“]|["'”]$/g, "")
    .trim();

  if (metin === "") return { kabul: false, sebep: "boş" };
  if (metin.length > sinir) return { kabul: false, sebep: `${sinir} karakteri aştı` };

  for (const desen of KONUSMA) {
    if (desen.test(metin)) return { kabul: false, sebep: "çeviri değil, model konuşmuş" };
  }

  if (TURKCE_HARF.test(metin)) return { kabul: false, sebep: "Türkçe harf kalmış" };

  /* Kaynakla aynıysa çeviri yapılmamış. Karşılaştırma büyük/küçük
     harf ve boşluk duyarsız: "Şort" → "Şort " de çeviri değil. */
  if (metin.toLocaleLowerCase("tr").replace(/\s+/g, " ") ===
      kaynak.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ")) {
    return { kabul: false, sebep: "kaynakla aynı" };
  }

  if (hedefGrubuSina && !hedefGrubuKoruyor(kaynak, metin)) {
    return { kabul: false, sebep: "hedef grup düştü (çocuk/kadın/erkek)" };
  }

  return { kabul: true, metin };
}

/*
  TERİM SÖZLÜĞÜ — İSTEMİN İÇİNE GİRİYOR.

  NEDEN VAR: 7b'lik bir model genel çeviride iyi ama MAĞAZANIN
  terimlerinde yanılıyor. Canlıda ölçüldü (22.10.2026): "Kürk" →
  "Coats". Kürk "coat" değil, fur — ve bu ticari olarak yanlış,
  mağazanın en pahalı kategorisini yanlış adlandırıyor ve müşteriye
  ürünün ne olduğunu yanlış söylüyor.

  BU HATA DENETİMİN GÖREMEDİĞİ TÜRDEN: çıktı geçerli İngilizce,
  Türkçe harf yok, kaynaktan farklı. Mekanik denetim anlam hatasını
  yakalayamaz — o yüzden sözlük İSTEME konuyor (hatayı baştan
  önlemek) ve panelde elle düzeltme duruyor (kaçanı düzeltmek).

  Liste KISA tutuluyor: 7b modelin bağlamı sınırlı ve uzun bir
  sözlük, asıl işi (ürün adını çevirmeyi) bastırıyor. Yalnızca
  modelin YANILDIĞI ya da mağazaya özgü terimler.
*/
export const TERIMLER: Array<[string, string]> = [
  ["kürk", "fur (NOT coat)"],
  ["şardonsuz", "unbrushed"],
  ["şardonlu", "brushed"],
  ["3 iplik", "three-thread fleece"],
  ["2 iplik", "two-thread fleece"],
  ["pike", "piqué"],
  ["bisiklet yaka", "crew neck"],
  ["eşofman altı", "joggers"],
  ["lastikli", "elasticated"],
  ["bağcıklı", "drawstring"],
  ["yağmurluk", "raincoat"],
  ["tişört", "t-shirt"],
  ["şort", "shorts"],
  ["takım", "set"],
  ["beden", "size"],
  ["yelek", "gilet (NOT coat)"],
  ["kapüşonlu", "hooded"],
  ["cepli", "with pockets"],
  ["vizon", "mink"],
  /*
    RENKLER AÇIKÇA YAZILIYOR. Canlıda ölçüldü: "Füme" → "Fleece".
    Füme bir RENK (antrasit), model onu kumaş sandı; müşteri
    "fleece" okuyup antrasit bir ürün alırdı. Renk, müşterinin
    gözüyle doğruladığı ilk özellik ve yanlış olamaz.
  */
  ["füme", "charcoal"],
  ["bej", "beige"],
  ["lacivert", "navy"],
  ["haki", "khaki"],
  ["vizon rengi", "taupe"],
  ["antrasit", "anthracite"],
  ["ekru", "ecru"],
  ["bordo", "burgundy"],
  ["turkuaz", "turquoise"],
  ["mint yeşili", "mint green"],
];

const terimSatirlari = () =>
  TERIMLER.map(([tr, en]) => `- "${tr}" -> ${en}`).join("\n");

/** Ürün için istem; model JSON döndürüyor. */
export function urunIstemi(
  urunler: Array<{ slug: string; name: string; description: string | null }>,
): string {
  /*
    AÇIKLAMA KIRPILIYOR (1.500 karakter): tedarikçi açıklamaları HTML
    ve tekrar dolu, tamamını göndermek küçük bir modelin bağlamını
    doldurup adı bile çevirmemesine yol açıyordu. Kırpılan kısım
    zaten ürün sayfasında Türkçe duruyor.
  */
  const liste = urunler.map((urun) => ({
    slug: urun.slug,
    name: urun.name,
    description: (urun.description ?? "").replace(/<[^>]*>/g, " ").trim().slice(0, 1500),
  }));

  return [
    "Translate Turkish e-commerce product texts into natural English.",
    "",
    "Rules:",
    "- Output ONLY a JSON array, no prose, no markdown fences.",
    '- Each item: {"slug": "...", "name": "...", "description": "..."}',
    "- Keep the slug EXACTLY as given.",
    "- Keep product attributes (sizes, colours, materials, counts).",
    "- Use the wording a UK/US clothing retailer would use.",
    "- Use the possessive for gendered items: \"Men's\", \"Women's\", \"Kids'\".",
    "- Do not invent details that are not in the Turkish text.",
    "- Keep EVERY attribute from the Turkish name, including the",
    "  audience (Women's / Men's / Kids') and the colour after the dash.",
    "",
    "Glossary (use these exact English terms):",
    terimSatirlari(),
    "- If a description is empty, return an empty string for it.",
    "",
    /*
      ÇALIŞILMIŞ ÖRNEK — soyut sözlükten daha etkili.

      Canlıda ölçüldü: sözlükte "yelek -> gilet (NOT coat)" yazdığı
      hâlde 7b model "Kürk Yelek"i "Fur Coat" diye çevirdi. Küçük
      modeller kuralı okuyup ÖRNEĞİ taklit ediyor; iki tam örnek, on
      satır kuraldan çok iş görüyor.

      Örnekler mağazanın gerçek hata yaptığı iki noktayı gösteriyor:
      hedef grubun korunması ve giysi türünün doğruluğu.
    */
    "Examples:",
    'Turkish: "Çocuk Unisex Baskılı T-Shirt - Siyah"',
    'English: "Kids\' Unisex Printed T-Shirt - Black"',
    'Turkish: "Kadın Gerçek Vizon Kürk Yelek Kapüşonlu - Kahverengi"',
    'English: "Women\'s Real Mink Fur Gilet Hooded - Brown"',
    "",
    JSON.stringify(liste),
  ].join("\n");
}

/** Koleksiyon için istem. */
export function koleksiyonIstemi(
  koleksiyonlar: Array<{ slug: string; title: string; description: string | null }>,
): string {
  return [
    "Translate Turkish e-commerce category names into natural English.",
    "",
    "Rules:",
    "- Output ONLY a JSON array, no prose, no markdown fences.",
    '- Each item: {"slug": "...", "title": "...", "description": "..."}',
    "- Keep the slug EXACTLY as given.",
    "- Use short category names a clothing retailer would use",
    '  (e.g. "Kadın" -> "Women", "Fırsatlar" -> "Sale").',
    "- Use the possessive for gendered categories: \"Men's T-Shirts\".",
    "- Do not invent details.",
    "",
    "Glossary (use these exact English terms):",
    terimSatirlari(),
    "",
    JSON.stringify(
      koleksiyonlar.map((k) => ({
        slug: k.slug,
        title: k.title,
        description: (k.description ?? "").slice(0, 600),
      })),
    ),
  ].join("\n");
}

/**
 * Modelin yanıtından JSON dizisi.
 *
 * Çit ve etraftaki konuşma TEMİZLENİYOR ama uydurulmuyor: ilk `[`
 * ile son `]` arası alınıyor. Açık modeller JSON'u cümleyle sarmaya
 * meyilli ve bütün partiyi bu yüzden atmak, çalışan bir çeviriyi
 * boşa harcamak olurdu.
 */
export function jsonCikar(yanit: string): unknown[] | null {
  const bas = yanit.indexOf("[");
  const son = yanit.lastIndexOf("]");
  if (bas < 0 || son <= bas) return null;
  try {
    const veri = JSON.parse(yanit.slice(bas, son + 1));
    return Array.isArray(veri) ? veri : null;
  } catch {
    return null;
  }
}
