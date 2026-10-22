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

  return { kabul: true, metin };
}

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
    "- Do not invent details that are not in the Turkish text.",
    "- If a description is empty, return an empty string for it.",
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
    "- Do not invent details.",
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
