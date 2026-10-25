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

/*
  HEDEF GRUP UYDURMA DENETİMİ — DÜŞMENİN TERSİ.

  `hedefGrubuKoruyor` yalnızca bir yönü sınıyordu: kaynakta varsa
  çeviride de olmalı. Ters yön açıktı ve canlıda ölçüldü
  (23.10.2026, 199 çevrili üründe 5 kayıt):

    "Basic Regular Fit Mint Yeşili Tişört" → "Men's Basic ..."
    "Biker Sporcu Şort - Bej"              → "Women's Biker ..."

  Kaynakta cinsiyet YOK; model uydurdu. Koleksiyonlarda aynısı
  olmuştu ("Göz" → "Men's Makeup"), yani bu modelin bilinen bir
  eğilimi.

  ZARARI: unisex bir ürünü erkek ürünü diye listelemek, müşterinin
  yanlış ürün alması ve iade demek — düşen hedef grubuyla aynı
  zarar, ters yönden.

  ÇOCUK ÜRÜNÜ İSTİSNA: "Kız Çocuk" çevirisi "Girls'" oluyor ve
  "girl" sözcüğü kadın desenine takılmıyor, ama "Çocuk Unisex" gibi
  adlarda model "Kids'" derken bazen "Boys'" diyebiliyor — kaynakta
  çocuk geçiyorsa cinsiyet eklemesi bu denetimin dışında kalıyor,
  çünkü hedef grup zaten doğru taşınmış sayılıyor ve ayrımı burada
  zorlamak doğru çevirileri atardı.
*/
export function hedefGrubuUydurmuyor(kaynak: string, ceviri: string): boolean {
  const k = kaynak.toLocaleLowerCase("tr");
  const c = ceviri.toLowerCase();

  /*
    Kaynakta herhangi bir yaş/cinsiyet işareti varsa denetim dışı.

    ÖN EK EŞLEŞMESİ, TAM SÖZCÜK DEĞİL: Türkçe ekli bir dil ve
    "Kadınlar Günü" kalıbı `\bkadın\b` ile eşleşmiyordu. Sonuç yanlış
    pozitifti — "8 Mart Dünya Kadınlar Günü Baskılı Tişört"ün doğru
    çevirisi "International Women's Day" ifadesini TAŞIMAK zorunda
    ve denetim onu "uydurma" sayıyordu.
  */
  if (/(kadın|erkek|çocuk|kız|bebek|unisex)/.test(k)) return true;

  return !/\b(men|men's|mens|women|women's|womens|ladies|boys?|girls?)\b/.test(c);
}

/*
  GİYSİ TÜRÜ MEKANİK OLARAK ZORLANIYOR.

  Sözlük yalnızca İSTEMDE duruyordu, yani modele bir öneriydi ve
  7b onu düzenli olarak yok sayıyor. Canlıda ölçüldü (23.10.2026,
  199 çevrili ürün):

    "Çocuk Selanik Yaka Nakışlı Kazak" → "Kids' ... Jacket"   (0/4)
    "Çocuk Yakalı Parçalı Kürk"        → "... Mink"           (1/2)
    "... Kanguru Cepli Hırka"          → "... Hoodie"         (5/7)

  Hepsi geçerli İngilizce, yani diğer denetimler göremiyor — ama
  ürünün NE OLDUĞUNU yanlış söylüyor. Kazak bekleyip ceket alan
  müşteri iade ediyor.

  YALNIZCA GİYSİ TÜRÜ, özellik değil: "nakışlı" yerine "printed"
  yazılması can sıkıcı ama müşteri yanlış ürün almıyor. Tür yanlışsa
  alıyor.

  BİRDEN ÇOK KARŞILIK KABUL: "kazak" için hem "jumper" hem "sweater"
  doğru. Tek karşılığa zorlamak doğru çevirileri atardı.

  KÜRK ASTARI İSTİSNA: "kürk astarlı mont" bir mont ve çevirisinde
  "fur" geçmek zorunda değil (kargo ağırlığı betiğindeki ayrımın
  aynısı, scripts/urun-agirliklari.sql).
*/
/*
  SINIR `\b` DEĞİL, UNICODE BAKIŞI.

  JavaScript'te `\b` ASCII sözcük karakterine göre çalışıyor ve
  "ş", "ç", "ü" sözcük karakteri SAYILMIYOR. Sonuç: `\bşort` ve
  `\bçorap` HİÇ eşleşmiyordu — iki denetim yazıldığı günden beri
  ölüydü ve hiçbir yerde hata vermiyordu (23.10.2026'da ölçüldü).
  `kürk`, `hırka`, `kazak` ASCII harfle başladığı için çalışıyordu;
  kusuru örtmesi de bu yüzden.
*/
const GIYSI_TURU: Array<{ tr: RegExp; en: RegExp; ad: string }> = [
  { tr: /(?<![\p{L}\d])kürk(?!\s*astarl)/u, en: /\bfur/, ad: "kürk → fur" },
  { tr: /(?<![\p{L}\d])kazak/u, en: /\b(jumper|sweater|pullover|knit)/, ad: "kazak → jumper" },
  { tr: /(?<![\p{L}\d])hırka/u, en: /\bcardigan/, ad: "hırka → cardigan" },
  /*
    "T-SHIRT" GÖMLEK DEĞİL. Düz `\bshirt` kalıbı "T-Shirt" ve
    "Sweatshirt" içindeki "shirt"i de yakalıyordu, yani "Erkek
    Gömlek" → "Men's T-Shirt" denetimden GEÇİYORDU — sözlüğün
    uyardığı karışıklığın ta kendisi ("gömlek → shirt NOT t-shirt").
  */
  { tr: /(?<![\p{L}\d])gömlek/u, en: /(?<![a-z-])shirt/, ad: "gömlek → shirt" },
  { tr: /(?<![\p{L}\d])elbise/u, en: /\bdress/, ad: "elbise → dress" },
  { tr: /(?<![\p{L}\d])tayt/u, en: /\b(leggings|tights)/, ad: "tayt → leggings" },
  { tr: /(?<![\p{L}\d])tulum/u, en: /\b(jumpsuit|overall|playsuit)/, ad: "tulum → jumpsuit" },
  { tr: /(?<![\p{L}\d])çorap/u, en: /\bsocks/, ad: "çorap → socks" },
  { tr: /(?<![\p{L}\d])şort/u, en: /\bshorts/, ad: "şort → shorts" },
  { tr: /(?<![\p{L}\d])yelek/u, en: /\b(gilet|waistcoat|vest)/, ad: "yelek → gilet" },
  { tr: /(?<![\p{L}\d])etek/u, en: /\bskirt/, ad: "etek → skirt" },
  { tr: /(?<![\p{L}\d])pijama/u, en: /\b(pyjama|pajama)/, ad: "pijama → pyjamas" },
];

/** Giysi türü doğru çevrilmiş mi? Değilse hangi terim olduğunu söyler. */
export function giysiTuruDogru(kaynak: string, ceviri: string): string | null {
  const k = kaynak.toLocaleLowerCase("tr");
  const c = ceviri.toLowerCase();
  for (const { tr, en, ad } of GIYSI_TURU) {
    if (tr.test(k) && !en.test(c)) return ad;
  }
  return null;
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

  if (hedefGrubuSina && !hedefGrubuUydurmuyor(kaynak, metin)) {
    return { kabul: false, sebep: "hedef grup UYDURULDU (kaynakta yok)" };
  }

  if (hedefGrubuSina) {
    const tur = giysiTuruDogru(kaynak, metin);
    if (tur) return { kabul: false, sebep: `giysi türü yanlış (${tur})` };
  }

  /*
    SAYI DENETİMİ HER METİNDE — AÇIKLAMADA DAHA DA GEREKLİ.

    Önceden yalnızca adlarda çalışıyordu (`hedefGrubuSina` ile aynı
    bayrağa bağlıydı) ve açıklama denetimsizdi. Oysa bu katalogda
    açıklama bir BEDEN TABLOSU:

      "S Beden 49-69 Kiloya Uygun · M Beden 69-79 Kiloya Uygun"

    Model bir kiloyu değiştirse kimse görmezdi ve müşteri yanlış
    beden alırdı. Türkçe kalan bir tablo, yanlış kilolu bir
    tablodan İYİDİR: biri görünür bir eksik, diğeri görünmeyen bir
    hata.

    Hedef grup denetimi açıklamada hâlâ YOK ve bu bilinçli: açıklama
    metninde "Kadın" sözcüğünün geçmesi zorunlu değil.
  */
  if (!sayilariKoruyor(kaynak, metin)) {
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
export function urunIstemi(urunler: Array<{ name: string }>): string {
  /*
    İSTEM YALNIZCA ADLARI İSTİYOR (25.10.2026).

    Önceden aynı istemde açıklama da isteniyordu ve iki şey birden
    bozuluyordu:

    1. AÇIKLAMA HİÇ GELMİYORDU. Üç çalışılmış örneğin üçünde de
       `"description": ""` yazıyordu; 7b model kuralı değil ÖRNEĞİ
       taklit ediyor ve her kaydın açıklamasını boş döndürüyordu.
       Ölçüldü: 1.500–2.600 karakterlik beş Türkçe açıklama
       gönderildi, beşine de `""` geldi ve `finish_reason` "stop"tu
       — yani kesilme değil, model gerçekten yazmıyordu. Betiğin
       raporunda bu "1.956 kayıt boş" diye görünüyordu ve bir model
       kusuru sanılıyordu.

    2. AD DA ÇEVRİLMİYORDU. Beş ürünün açıklaması istemi 13 KB'a
       çıkarıyor ve küçük modelin dikkatini dağıtıyordu. Aynı on
       ürün iki istemle ölçüldü: açıklamalı istemde 0/10 kabul
       (onunun da yanıtı hiç gelmedi), adlara odaklı istemde 8/10 —
       kalan iki ret de haklıydı (şort → "Short", kazak →
       "Jacket").

    Açıklama zaten MODELE SORULMUYOR olmalıydı: bu katalogda
    açıklama bir beden-kilo tablosu ve `lib/ceviri/aciklama.ts`
    onu eşleme tablosuyla, hem hızlı hem KESİN çeviriyor
    (scripts/aciklama-ingilizce.mjs). İki yol aynı alana
    yazıyordu; biri çalışmıyor, öteki çalışıyordu.
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
  }));

  return [
    "Translate Turkish clothing product NAMES into natural English.",
    "",
    "Rules:",
    "- Output ONLY a JSON array, no prose, no markdown fences.",
    '- Each item: {"id": <number>, "source": "...", "name": "..."}',
    "- Copy the id number unchanged. Return one item per input id.",
    '- "source" must be the Turkish name copied EXACTLY, character for character.',
    "- Keep EVERY attribute from the Turkish name: audience, garment type,",
    "  fabric, fit, neckline, sleeve, pocket and the colour after the dash.",
    "- Use the wording a UK/US clothing retailer would use.",
    "- Use the possessive for gendered items: \"Men's\", \"Women's\", \"Kids'\".",
    /*
      SAYI KURALI İSTEME YAZILI, ÇÜNKÜ EN SIK RET SEBEBİ BUYDU.
      Denetim sayı düşmesini zaten yakalıyor ("sayı düştü (içerik
      kaybı)") ama yakalamak kaydı ATIYOR; istemde söylemek
      kaydı KURTARIYOR. Katalogda sayı ürünün kendisi: "3 İplik"
      kumaş kalınlığı, "2'li" takım adedi, "10 Kasım" bir tarih.
    */
    "- Numbers are part of the product (\"3 İplik\" is a fabric type,",
    "  \"2'li\" means a 2-piece set, \"10 Kasım\" is a date).",
    "  Never drop, merge or change a number.",
    /*
      HEDEF GRUBU UYDURMAK da sık ret sebebiydi: model
      "Basic Regular Fit Gri Tişört"e kendiliğinden "Men's"
      ekliyordu. Kaynakta olmayan bir hedef grup, kadın ürününü
      erkek ürünü gibi listelemek demek.
    */
    "- Do NOT add an audience word (Men's/Women's/Kids') if the Turkish",
    "  name does not have one.",
    "- Do not invent details that are not in the Turkish text.",
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
    "",
    /*
      ÇALIŞILMIŞ ÖRNEKLER — soyut sözlükten daha etkili.

      Canlıda ölçüldü: sözlükte "yelek -> gilet (NOT coat)" yazdığı
      hâlde 7b model "Kürk Yelek"i "Fur Coat" diye çevirdi. Küçük
      modeller kuralı okuyup ÖRNEĞİ taklit ediyor; birkaç tam örnek,
      on satır kuraldan çok iş görüyor.

      Beş örneğin her biri canlıda ÖLÇÜLEN bir ret sebebine karşılık
      geliyor: hedef grubun korunması, giysi türünün doğruluğu,
      hedef grubun uydurulmaması, sayının düşmemesi ve baskı
      konusunun çevrilmemesi.
    */
    "Examples:",
    'Input:  {"id": 1, "name": "Çocuk Unisex Baskılı T-Shirt - Siyah"}',
    'Output: {"id": 1, "source": "Çocuk Unisex Baskılı T-Shirt - Siyah", "name": "Kids\' Unisex Printed T-Shirt - Black"}',
    'Input:  {"id": 2, "name": "Kadın Gerçek Vizon Kürk Yelek Kapüşonlu - Kahverengi"}',
    'Output: {"id": 2, "source": "Kadın Gerçek Vizon Kürk Yelek Kapüşonlu - Kahverengi", "name": "Women\'s Real Mink Fur Gilet Hooded - Brown"}',
    'Input:  {"id": 3, "name": "Basic Regular Fit Gri Tişört"}',
    'Output: {"id": 3, "source": "Basic Regular Fit Gri Tişört", "name": "Basic Regular Fit Grey T-Shirt"}',
    'Input:  {"id": 4, "name": "3 İplik Pamuklu Cepli Kapüşonlu 10 Kasıma Özel Sweatshirt - Siyah"}',
    'Output: {"id": 4, "source": "3 İplik Pamuklu Cepli Kapüşonlu 10 Kasıma Özel Sweatshirt - Siyah", "name": "3 İplik Cotton Pocket Hooded 10 Kasım Special Sweatshirt - Black"}',
    'Input:  {"id": 5, "name": "10 Kasım Atatürk Anma Günü Silüet Baskılı Oversize Bisiklet Yaka T-shirt - Siyah"}',
    'Output: {"id": 5, "source": "10 Kasım Atatürk Anma Günü Silüet Baskılı Oversize Bisiklet Yaka T-shirt - Siyah", "name": "10 Kasım Atatürk Memorial Day Silhouette Printed Oversized Crew Neck T-Shirt - Black"}',
    "",
    JSON.stringify(liste),
  ].join("\n");
}

/*
  AÇIKLAMA PARÇASI İSTEMİ (25.10.2026).

  Ürün açıklaması bir HTML tablosu ve çoğu hücresini eşleme tablosu
  KESİN çeviriyor (lib/ceviri/aciklama). Modele tablonun tamamını
  vermek iki şeyi birden riske atardı: yapıyı (3 KB HTML'i 7b bir
  model bozar) ve sayıları (beden-kilo eşlemesi). Burada yalnızca
  eşleme tablosunun kapatamadığı HÜCRELER soruluyor — çoğu kısa bir
  cümle, medyanı 41 karakter.

  Parçalar ÜRÜNDEN BAĞIMSIZ: aynı cümle 497 üründe 947 kez geçiyor,
  yani benzersiz metin başına bir kez sorulup hepsine yazılıyor.
*/
export function aciklamaParcaIstemi(parcalar: string[]): string {
  return [
    "Translate Turkish e-commerce product detail texts into natural English.",
    "",
    "These are cells from a product specification table: short labels,",
    "values, size rows and one-sentence marketing lines.",
    "",
    "Rules:",
    "- Output ONLY a JSON array, no prose, no markdown fences.",
    '- Each item: {"id": <number>, "source": "...", "text": "..."}',
    "- Copy the id number unchanged. Return one item per input id.",
    '- "source" must be the Turkish text copied EXACTLY, character for character.',
    /*
      SAYI KURALI: hücrelerin bir kısmı beden-kilo tablosu ("50-65
      Kilo İçin Uygundur") ve bir kilo değişirse müşteri yanlış
      beden alır. Betik bunu ayrıca denetliyor ama istemde
      söylemek kaydı kurtarıyor, denetim yalnızca atıyor.
    */
    "- Keep EVERY number exactly as written, in the same order.",
    "- Keep the text the same KIND of thing: a label stays a short label,",
    "  a sentence stays one sentence. Do not expand or summarise.",
    "- Use the wording a UK/US clothing retailer would use.",
    "- Do not invent details that are not in the Turkish text.",
    "- Keep brand names, proper nouns and codes as written.",
    "",
    "Glossary (use these exact English terms):",
    terimSatirlari(),
    "",
    /*
      ÇALIŞILMIŞ ÖRNEKLER — üçü de gerçek hücre. Ürün adı isteminde
      ölçüldüğü gibi küçük modeller kuralı okuyup ÖRNEĞİ taklit
      ediyor; örnekte boş bir alan bırakmak (orada `description: ""`
      idi) modele "burayı boş geç" diye öğretiyordu.
    */
    "Examples:",
    'Input:  {"id": 1, "text": "Materyal Bileşeni"}',
    'Output: {"id": 1, "source": "Materyal Bileşeni", "text": "Material composition"}',
    'Input:  {"id": 2, "text": "50-65 Kilo İçin Uygundur"}',
    'Output: {"id": 2, "source": "50-65 Kilo İçin Uygundur", "text": "Suitable for 50-65 kg"}',
    'Input:  {"id": 3, "text": "Görsellerde kullanılan aksesuarlar dekor amaçlıdır, ürüne dahil değildir."}',
    'Output: {"id": 3, "source": "Görsellerde kullanılan aksesuarlar dekor amaçlıdır, ürüne dahil değildir.", "text": "Accessories shown in the photographs are for display only and are not included."}',
    "",
    JSON.stringify(parcalar.map((metin, sira) => ({ id: sira + 1, text: metin }))),
  ].join("\n");
}

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
  if (bas >= 0 && son > bas) {
    try {
      const veri = JSON.parse(yanit.slice(bas, son + 1));
      if (Array.isArray(veri)) return veri;
    } catch {
      /* Dizi gibi görünüp ayrışmayan metin: aşağıdaki tek nesne
         yolu denenir, o da tutmazsa parti atlanır. */
    }
  }

  /*
    TEK NESNE DE KABUL EDİLİYOR (25.10.2026).

    İkinci tur kalemleri TEK TEK soruyor ve model tek kalem
    istendiğinde doğal olarak tek NESNE döndürüyor:
    `{"id":1,"source":"ÜRÜN 3 ADETTİR","text":"There are 3 items…"}`.
    Önceden bu "dizi değil" diye reddediliyordu ve ikinci turun
    varlık sebebi olan kayıtlar — çevirisi DOĞRU gelmiş olanlar
    dahil — atılıyordu. Canlıda ölçüldü: 31 parçanın 8'i iki turda
    da geçemedi, üçü yalnızca bu yüzden.

    Tek nesneyi tek elemanlı diziye sarmak sözleşmeyi gevşetmiyor:
    çağıran zaten `id` ile eşleştiriyor ve yankı denetiminden
    geçiriyor, yani yanlış kaleme yazma riski değişmiyor.
  */
  const nBas = yanit.indexOf("{");
  const nSon = yanit.lastIndexOf("}");
  if (nBas < 0 || nSon <= nBas) return null;
  try {
    const veri = JSON.parse(yanit.slice(nBas, nSon + 1));
    return veri && typeof veri === "object" && !Array.isArray(veri) ? [veri] : null;
  } catch {
    return null;
  }
}
