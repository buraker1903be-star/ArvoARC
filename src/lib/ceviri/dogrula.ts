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
  TÜRKÇE KALMIŞ MI? — İKİ ÖLÇÜT, BİRİ YETMİYOR.

  Önce tek bir kural vardı: çıktıda "ı", "ş", "ğ" varsa reddet.
  Mantığı şuydu — bu harfler İngilizce metinde geçmiyor, yani model
  çevirmemiş. Baskı kuralı eklenince (22.10.2026) bu kural KENDİ
  KURALIMLA ÇELİŞTİ: modele "özel adları Türkçe bırak" diyoruz ve
  doğru çeviri artık Türkçe harf TAŞIYOR —

    "1 Mayıs Emek ve Dayanışma Bayrağı Printed Crew Neck T-Shirt"

  Bu doğru bir İngilizce ürün adı ve eski kural onu atıyordu.

  Yerine iki ölçüt:

  1. ÇEVRİLMESİ GEREKEN KELİME KALMIŞ MI. Sözlükteki Türkçe
     karşılıklar (tişört, gömlek, şort, yaka…) çıktıda geçmemeli:
     geçiyorsa model giysiyi çevirmemiş. Özel adlar bu listede
     olmadığı için geçebiliyor.

  2. ORAN. Kelimelerin yarısından fazlası Türkçeye özgü harf
     taşıyorsa metin toptan çevrilmemiş demektir. Korunan bir ifade
     adın küçük bir bölümü; bütünü değil.

  "ö", "ü", "ç" ikisinde de yok: İngilizcede alıntı sözcüklerde ve
  özel adlarda geçiyor ("Atatürk", "façade").
*/
const TURKCE_HARF = /[ışğİıŞĞ]/;

/*
  ÇEVRİLMESİ ZORUNLU SÖZCÜKLER — KATALOĞUN KENDİ SÖZCÜKLERİ.

  Liste tahminle yazılmadı: 3.442 ürün adındaki sözcükler sıklığa göre
  sayıldı ve Türkçe olanlar buraya alındı (en sıkı: "erkek" 1765,
  "baskılı" 1761, "yaka" 1605, "tişört" 1116). İngilizce olarak geçen
  sözcükler (shirt, sweatshirt, hoodie, oversize, regular, unisex,
  basic, premium, polo, slim, fit) BİLEREK yok — onlar zaten İngilizce.

  TAM SÖZCÜK aranıyor, ön ek değil: "gri" ön ek olarak arandığında
  İngilizce "Grid" baskısını, "alt" ise "Alternative"i reddedecekti.
  Çekimli biçimler bu yüzden tek tek yazılı (kol/kollu/kolsuz,
  yaka/yakalı) — hangileri geçiyorsa katalog söyledi.

  Bir baskı konusu bu sözcüklerden birini taşıyorsa (ör. "Kadın
  Hakları") kayıt reddediliyor. Bu bilinçli: ATLAMAK, YANLIŞ YAZMAKTAN
  İYİDİR — atlanan ürün Türkçe adıyla görünüyor, o dürüst; yanlış
  yazılan ürün sessizce yanlış kalıyor (22.10.2026'da koleksiyonlarda
  tam bu oldu, "Yağlar" → "Women's T-Shirts").
*/
const CEVRILMELI = [
  // Hedef grubu
  "erkek", "kadın", "çocuk", "kız", "bebek", "unisex ürün",
  // Giysi türü
  "tişört", "gömlek", "kazak", "hırka", "yelek", "kürk", "mont", "ceket",
  "pantolon", "şort", "eşofman", "takım", "atlet", "çorap", "triko",
  // Kesim ve ayrıntı
  "yaka", "yakalı", "kol", "kollu", "kolsuz", "kısa", "uzun", "yarım",
  "bisiklet", "boğazlı", "kapüşonlu", "fermuarlı", "düğmeli", "bağcıklı",
  "cepli", "kanguru", "kalıp", "paça", "lastikli", "kapitone", "astarlı",
  "balıkçı", "üst", "alt", "arka", "düz",
  // Kumaş ve doku
  "pamuklu", "iplik", "dokuma", "dokulu", "kumaş", "fitilli", "likralı",
  "desenli", "baskılı", "yumuşak", "kalın", "itici",
  // Renk
  "siyah", "beyaz", "gri", "bej", "lacivert", "bordo", "füme", "kırmızı",
  "haki", "mavisi", "yeşili", "mavi", "yeşil", "sarı", "pembe", "mor",
  // Mevsim ve kullanım
  "yazlık", "kışlık", "günlük", "rahat",
  // Alan adları
  "bakım", "beden", "renk", "ürün", "koku",
];

/** Giysi/özellik sözcüğü çevrilmeden kalmış mı? */
function cevrilmemisKelime(metin: string): string | null {
  const dusuk = metin.toLocaleLowerCase("tr");
  return CEVRILMELI.find((kelime) => new RegExp(`(^|[^\\p{L}])${kelime}([^\\p{L}]|$)`, "u").test(dusuk)) ?? null;
}

/** Kelimelerin yarısından fazlası Türkçe harf taşıyor mu? */
function toptanTurkce(metin: string): boolean {
  const kelimeler = metin.split(/[\s\-/]+/).filter((k) => k.length > 2);
  if (kelimeler.length === 0) return false;
  const turkce = kelimeler.filter((k) => TURKCE_HARF.test(k)).length;
  return turkce / kelimeler.length > 0.5;
}

/*
  MODEL KONUŞMASI. Açık modeller yanıtı cümleyle sarmaya meyilli;
  bu kalıplar çıktının çeviri DEĞİL sohbet olduğunu gösteriyor.
*/
const KONUSMA = [
  /^\s*(here\s+is|here's|sure[,!]|certainly|of\s+course|translation\s*:)/i,
  /^\s*```/,
  /\bas\s+an\s+ai\b/i,
  /*
    "İ" AYRICA YAZILI. `/i` bayrağı büyük İ'yi küçük i'ye KATLAMIYOR
    (ECMAScript büyük harfe çevirerek karşılaştırıyor: "i" → "I",
    "İ" → "İ"), yani `/işte/i` "İşte"yi görmüyordu. Eskiden Türkçe
    harf kuralı bu gevezeliği tesadüfen yakalıyordu; o kural
    daraltılınca "İşte çeviri: Women's Shorts" kabul edildi
    (22.10.2026, testle yakalandı).
  */
  /^\s*([iİ]şte|[bB]uyurun)/,
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

/*
  YANKI DENETİMİ — YANLIŞ KALEME YAZMAYI ENGELLİYOR.

  NEDEN VAR (canlıda ölçüldü, 22.10.2026): kimlik SAYI yapıldıktan
  sonra eşleşme sıraya dayandı ve 7b model partideki BAŞKA kalemin
  cevabını veriyordu. Yazılanlar arasında "Yağlar" → "Women's
  T-Shirts", "Duş Jelleri" → "Bath Mats", "El Kremleri" →
  "Cuticles" vardı. Kırk dokuz koleksiyonun çoğu yanlış yazıldı ve
  geri alınması gerekti.

  Önceki tasarım (slug ile eşleşme) bu hatayı GÖRÜYORDU: model
  slug'ı çevirdiğinde kayıt "yanıtta yok" diye atlanıyordu. Sayıya
  geçmek görünür bir hatayı (atlama) GÖRÜNMEZ bir hataya (yanlış
  veri) çevirdi — bu depoda en pahalı kusur sınıfı tam olarak bu.

  Çözüm: model çeviriyle birlikte KAYNAĞI da geri yazıyor. Yankı
  girdiyle tutmuyorsa kalem karışmış demektir ve çeviri
  reddediliyor. Atlamak yanlış yazmaktan iyidir: atlanan ürün
  Türkçe adıyla görünüyor, yanlış yazılan ürün müşteriye başka bir
  ürünün adını gösteriyor.
*/

/** Karşılaştırma için: boşluk ve harf durumu duyarsız. */
const sadeMetin = (metin: string) =>
  metin.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

/**
 * Modelin yankıladığı kaynak, gönderilen kaynakla aynı mı?
 *
 * TAM EŞİTLİK ARANMIYOR: model tireyi ya da çift boşluğu
 * normalleştirebiliyor ve bunu reddetmek doğru çevirileri atardı.
 * Aranan şey AYNI KALEM olması; bunun için baştaki yirmi karakter
 * yeterli ve fazlası kırılganlık.
 */
export function yankiTutuyor(gonderilen: string, yanki: unknown): boolean {
  if (typeof yanki !== "string") return false;
  const a = sadeMetin(gonderilen);
  const b = sadeMetin(yanki);
  if (a === b) return true;
  const kisa = Math.min(20, a.length, b.length);
  return kisa > 0 && a.slice(0, kisa) === b.slice(0, kisa);
}

/*
  SAYI DENETİMİ — İÇERİK KAYBINI YAKALIYOR.

  NEDEN VAR (canlıda ölçüldü, 22.10.2026): baskılı tişörtlerde model
  ürünün TEK AYIRT EDİCİ ÖZELLİĞİNİ atıyordu:

    "1 Mayıs Emek ve Dayanışma Bayraklı Emekçi Baskılı Bisiklet
     Yaka T-shirt - Siyah"
      → "Unisex Oversized Crew Neck T-Shirt - Black"

  Baskının konusu (1 Mayıs, 10 Kasım Atatürk, "HAKLIYIZ") tamamen
  kayboluyor ve farklı ürünler AYNI ada çöküyor — baskılı bir
  tişörtte müşterinin aldığı şey tam olarak o konu.

  Yankı denetimi bunu göremiyor: kaynak doğru yankılanıyor, kaybolan
  şey çevirinin kendisi.

  SAYILAR EN GÜVENİLİR İŞARET: "1 Mayıs", "10 Kasım", "3 İplik",
  "4 Mevsim" — ay adı çevrilse de SAYI kalmalı. Özel adları
  (Atatürk) aramak daha kırılgan olurdu: model onları
  harfçevirebiliyor. Sayı ya duruyor ya yok.
*/

/** Kaynaktaki sayı öbekleri çeviride de var mı? */
export function sayilariKoruyor(kaynak: string, ceviri: string): boolean {
  const sayilar = kaynak.match(/\d+/g);
  if (!sayilar) return true;
  /* Tekil sayılar yeterli: aynı sayı iki kez geçiyorsa bir kez
     geçmesi de kaybolmadığını gösteriyor. */
  return [...new Set(sayilar)].every((sayi) => ceviri.includes(sayi));
}

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

  const kalan = cevrilmemisKelime(metin);
  if (kalan) return { kabul: false, sebep: `"${kalan}" çevrilmemiş` };
  if (toptanTurkce(metin)) return { kabul: false, sebep: "metin toptan Türkçe kalmış" };

  /*
    MARKA ADININ DOĞRU ÇEVİRİSİ KENDİSİDİR.

    Kaynakta çevrilmesi gereken hiçbir sözcük ve Türkçeye özgü hiçbir
    harf yoksa metin zaten İngilizce ya da bir özel ad: "Aloe Via",
    "Nanogold", "Racine Q10", "Zeitgard". Bunları olduğu gibi
    bırakmak DOĞRU davranış.

    Önceden "kaynakla aynı" diye reddediliyorlardı ve on dört
    koleksiyon çevirisiz kaldı (22.10.2026). Baskı konusuyla aynı
    hata şekli: kendi kuralımız doğru cevabı eliyordu.

    Marka adı çevrilirse ne olur, ölçüldü: model "L-Recapin"i
    "ArvoCulture", "Beauty Diamonds"ı "Beauty", "Mood Infusion"ı
    "Mood" yaptı — biri bizim markamızı başkasının ürününe yazmak.
  */
  const kaynakCevrilmeli =
    cevrilmemisKelime(kaynak) !== null || TURKCE_HARF.test(kaynak);
  if (!kaynakCevrilmeli && sadeMetin(metin) === sadeMetin(kaynak)) {
    return { kabul: true, metin };
  }

  /* Kaynakla aynıysa çeviri yapılmamış. Karşılaştırma büyük/küçük
     harf ve boşluk duyarsız: "Şort" → "Şort " de çeviri değil. */
  if (metin.toLocaleLowerCase("tr").replace(/\s+/g, " ") ===
      kaynak.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ")) {
    return { kabul: false, sebep: "kaynakla aynı" };
  }

  if (hedefGrubuSina && !hedefGrubuKoruyor(kaynak, metin)) {
    return { kabul: false, sebep: "hedef grup düştü (çocuk/kadın/erkek)" };
  }

  if (hedefGrubuSina && !sayilariKoruyor(kaynak, metin)) {
    return { kabul: false, sebep: "sayı düştü (içerik kaybı)" };
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
  /*
    GİYSİ TÜRLERİ — canlıda ölçüldü: model "Gömlek"i "T-Shirt",
    "Hırka"yı "Vest" diye çevirdi. İkisi de ürünün NE OLDUĞUNU
    yanlış söylüyor; müşteri gömlek bekleyip tişört alır.
  */
  ["gömlek", "shirt (NOT t-shirt)"],
  ["hırka", "cardigan"],
  ["atlet", "vest top"],
  ["body", "bodysuit"],
  ["boxer", "boxer shorts"],
  ["çorap", "socks"],
  ["deniz şortu", "swim shorts"],
  ["eşofman", "tracksuit"],
  ["eşofman takımı", "tracksuit set"],
  /*
    "ALT ÜST TAKIM" İÇ GİYİM DEĞİL. Model "Erkek Alt Üst Takım"ı
    "Men's Underwear Set" diye çevirdi (22.10.2026, kuru tur): ürünün
    ne olduğunu yanlış söylüyor ve müşteri iç çamaşırı bekleyip
    takım alır.
  */
  ["alt üst takım", "top and bottom set (NOT underwear)"],
  ["alt", "bottom (NOT underwear)"],
  /*
    KOLEKSİYON TURUNDA ÖLÇÜLEN HATALAR (22.10.2026). Hepsi geçerli
    İngilizceydi, yani mekanik denetim göremedi; hepsi ürünün NE
    OLDUĞUNU yanlış söylüyordu. Aynı sözcükler ürün adlarında da
    geçtiği için 3.290 üründe tekrarlanacaktı.
  */
  ["duş jeli", "shower gel (NOT bath mitt)"],
  ["saç kremi", "conditioner (NOT hair cream)"],
  ["saç dökülmesi", "hair loss"],
  ["elbise", "dress (NOT top)"],
  ["tayt", "leggings"],
  ["tulum", "jumpsuit"],
  ["bere", "beanie (NOT bag)"],
  ["kol saati", "watch (NOT bracelet)"],
  ["alt giyim", "bottoms (NOT underwear)"],
  ["göz çevresi", "eye contour"],
  ["temizleyici", "cleanser (NOT cleaner)"],
  ["dudak", "lip (NOT lipstick)"],
  /*
    MONT, CEKET VE KABAN ÜÇ AYRI ŞEY. Model üçünü de "coat" dedi ve
    üç koleksiyon tek ada çöktü.
  */
  ["ceket", "jacket"],
  ["kaban", "overcoat"],
  ["kazak", "jumper"],
  ["mont", "coat"],
  ["pantolon", "trousers"],
  ["rüzgarlık", "windbreaker"],
  ["sweatshirt", "sweatshirt"],
  ["bakım ürünleri", "care products"],
  ["iç giyim", "underwear"],
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
  const liste = urunler.map((urun, sira) => ({
    /*
      KİMLİK SAYI, SLUG DEĞİL — canlıda ölçüldü.

      Slug gönderildiğinde model onu ÇEVİRİYORDU: "erkek-atlet" →
      "men-atlet". Eşleşme slug'la yapıldığı için otuz kaydın
      yirmisi "yanıtta yok" diye atlandı — çeviri sessizce yarım
      kalıyor, hata da vermiyordu. "Slug'ı aynen koru" demek
      yetmedi; 7b model metni görünce çevirmeye meyilli.

      Sayıyı çevirmeye kalkmıyor.
    */
    id: sira + 1,
    name: urun.name,
    description: (urun.description ?? "").replace(/<[^>]*>/g, " ").trim().slice(0, 1500),
  }));

  return [
    "Translate Turkish e-commerce product texts into natural English.",
    "",
    "Rules:",
    "- Output ONLY a JSON array, no prose, no markdown fences.",
    '- Each item: {"id": <number>, "source": "...", "name": "...", "description": "..."}',
    "- Copy the id number unchanged. Return one item per input id.",
    '- "source" must be the Turkish name copied EXACTLY, character for character.',
    "- Keep product attributes (sizes, colours, materials, counts).",
    "- Use the wording a UK/US clothing retailer would use.",
    "- Use the possessive for gendered items: \"Men's\", \"Women's\", \"Kids'\".",
    "- Do not invent details that are not in the Turkish text.",
    "- Keep EVERY attribute from the Turkish name, including the",
    "  audience (Women's / Men's / Kids') and the colour after the dash.",
    /*
      BASKI KONUSU ÇEVRİLMİYOR, OLDUĞU GİBİ KALIYOR.

      Katalogdaki 3.290 ürünün 1.757'si "Baskılı" ve baskının konusu
      çoğunlukla ÖZEL AD: "1 Mayıs", "10 Kasım Atatürk", "HAKLIYIZ".
      Model bunları çevirmeye kalkınca ya anlamsız bir şey üretiyor
      ya da tamamen atıyordu — ve atınca farklı ürünler aynı ada
      çöküyordu.

      Doğrusu zaten çevirmemek: üzerinde Türkçe yazan bir tişörtün
      İngilizce adı da o Türkçe ifadeyi taşır. "Atatürk Silhouette
      Printed T-Shirt" doğru İngilizce bir ad.
    */
    "- For printed items the PRINT SUBJECT identifies the product.",
    "  Keep proper nouns, dates and slogans EXACTLY as written in",
    '  Turkish ("1 Mayıs", "Atatürk", "HAKLIYIZ") and translate only',
    "  the garment words around them.",
    "  Never reduce two different prints to the same generic name.",
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
    'Input:  {"id": 7, "name": "Çocuk Unisex Baskılı T-Shirt - Siyah"}',
    'Output: {"id": 7, "source": "Çocuk Unisex Baskılı T-Shirt - Siyah", "name": "Kids\' Unisex Printed T-Shirt - Black", "description": ""}',
    'Input:  {"id": 8, "name": "Kadın Gerçek Vizon Kürk Yelek Kapüşonlu - Kahverengi"}',
    'Output: {"id": 8, "source": "Kadın Gerçek Vizon Kürk Yelek Kapüşonlu - Kahverengi", "name": "Women\'s Real Mink Fur Gilet Hooded - Brown", "description": ""}',
    'Input:  {"id": 9, "name": "10 Kasım Atatürk Anma Günü Silüet Baskılı Oversize Bisiklet Yaka T-shirt - Siyah"}',
    'Output: {"id": 9, "source": "10 Kasım Atatürk Anma Günü Silüet Baskılı Oversize Bisiklet Yaka T-shirt - Siyah", "name": "10 Kasım Atatürk Memorial Day Silhouette Printed Oversized Crew Neck T-Shirt - Black", "description": ""}',
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
    '- Each item: {"id": <number>, "source": "...", "title": "...", "description": "..."}',
    "- Copy the id number unchanged. Return one item per input id.",
    '- "source" must be the Turkish title copied EXACTLY, character for character.',
    "- Use short category names a clothing retailer would use",
    '  (e.g. "Kadın" -> "Women", "Fırsatlar" -> "Sale").',
    "- Use the possessive for gendered categories: \"Men's T-Shirts\".",
    "- Do not invent details.",
    "",
    "Glossary (use these exact English terms):",
    terimSatirlari(),
    "",
    JSON.stringify(
      koleksiyonlar.map((k, sira) => ({
        /* Kimlik sayı: model slug'ı çeviriyordu (ürün isteminde
           ayrıntılı gerekçe). */
        id: sira + 1,
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
