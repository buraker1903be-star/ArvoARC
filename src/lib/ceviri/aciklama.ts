/*
  ÜRÜN AÇIKLAMASININ İNGİLİZCESİ — MODELE SORULMUYOR.

  Bu katalogda açıklama düzyazı değil, bir HTML TABLOSU: ürün
  özellikleri ve beden çizelgesi. Ortalama 2.285 karakter.

      Cinsiyet: Unisex · Kumaş: 30/1 Pamuk Polyester
      S Beden  49-69 Kiloya Uygun · M Beden  69-79 Kiloya Uygun

  MODELE SORMAK İKİ KEZ YANLIŞTI (23.10.2026'da ölçüldü):

  1. BECEREMİYOR. Beş ürünlük bir partide 7b model ~13.000 karakter
     okuyup o kadarını tablo olarak geri üretmek zorunda; 195 üründe
     yalnızca BİRİNİN açıklaması yazılabildi.
  2. RİSKLİ. Tablodaki sayılar beden-kilo eşlemesi. Model "49-69"u
     "49-59" yapsa hiçbir yerde görünmezdi ve müşteri yanlış beden
     alırdı.

  Sözcük dağarcığı DAR ve kapalı: 3.411 açıklamada kırk kadar etiket
  neredeyse her şeyi kapsıyor. Böyle bir metin için eşleme tablosu
  modelden hem hızlı hem KESİN — her sayı birebir korunuyor çünkü
  sayılara hiç dokunulmuyor.

  HTML'E DOKUNULMUYOR: yalnızca metin düğümleri çevriliyor. Etiket,
  öznitelik ve biçim olduğu gibi kalıyor; tablo bozulmuyor.

  KAPSAM EŞİĞİ VAR. Türkçe sözcüklerin yeterince büyük bir kısmı
  çevrilemiyorsa çeviri YAZILMIYOR ve vitrin Türkçe açıklamaya
  düşüyor. Yarı Türkçe bir tablo, Türkçe bir tablodan kötü: müşteri
  hangi satıra güveneceğini bilemiyor.
*/

/** Başlık ve etiket hücreleri: tam eşleşme (küçük harfe indirgenmiş). */
const ETIKETLER = new Map<string, string>([
  ["ürün özellikleri", "PRODUCT DETAILS"],
  ["ürün beden tablosu", "SIZE CHART"],
  ["ürün beden tablosuü", "SIZE CHART"],
  ["cinsiyet", "Gender"],
  ["kumaş", "Fabric"],
  ["i̇p kumaş", "Fabric"],
  ["kalıp", "Fit"],
  ["detay", "Detail"],
  ["üst detay", "Top detail"],
  ["alt detay", "Bottom detail"],
  ["pantolon detay", "Trouser detail"],
  ["şort detay", "Shorts detail"],
  ["şort alt detay", "Shorts detail"],
  ["t-shirt detay", "T-shirt detail"],
  ["sezon", "Season"],
  ["not", "Note"],
  ["i̇plik", "Yarn"],
  ["ürün", "Product"],
  ["ürün cinsi", "Product type"],
  ["ürün hikayesi", "Product story"],
  ["ürün hikayesi / açıklama", "Product story"],
  ["beden", "Size"],
  ["standart beden", "One size"],
  ["açıklama", "Description"],
  ["renk", "Colour"],
  ["yaka", "Neckline"],
  ["kol", "Sleeve"],
  ["boy", "Length"],
  ["marka", "Brand"],
  ["menşei", "Origin"],
  ["materyal", "Material"],
  /* Tek başına bir sütun başlığı: "Kilo". Kalıplar "… Kiloya
     Uygun" biçimini tanıyor, çıplak başlığı değil. */
  ["kilo", "Weight"],
  /*
    İKİNCİ ÖLÇÜM (25.10.2026): 497 ürünün açıklaması %85 kapsam
    eşiğini geçemiyordu ve kapanmayan 853 benzersiz hücrenin 454'ü
    KISA ETİKET/DEĞER'di — gözlük, saat, parfüm ve pijama
    kategorileri kataloğa sonradan girmiş, tablo ise yalnızca
    giyim sözcüklerini tanıyordu.

    Buradakiler o ölçümün en sık geçenleri. Düzyazı cümleleri
    BİLEREK yok: onları sözcük sözcük çevirmek bozuk İngilizce
    üretir (dosyanın başındaki gerekçe).
  */
  ["materyal bileşeni", "Material composition"],
  ["ürün tipi", "Product type"],
  ["ürün bilgileri", "Product information"],
  ["kutu içeriği", "Box contents"],
  ["paket içeriği", "Package contents"],
  ["takım içeriği", "Set contents"],
  ["iade koşulları", "Returns policy"],
  ["iade şartları", "Returns policy"],
  ["cayma hakkı ve iade", "Right of withdrawal and returns"],
  ["özellik", "Feature"],
  ["öne çıkan özellikler", "Key features"],
  ["kullanım alanı", "Use"],
  ["kullanım şekli", "How to use"],
  ["kullanım talimatı", "Instructions for use"],
  ["kullanım tarzı", "Use"],
  ["kullanım sezonu", "Season"],
  ["akşam kullanımı", "Evening wear"],
  ["bakım talimatları (genel)", "Care instructions (general)"],
  ["çerçeve rengi", "Frame colour"],
  ["çerçeve formu", "Frame shape"],
  ["çerçeve üretim yeri", "Frame made in"],
  ["cam özelliği", "Lens feature"],
  ["cam şekli", "Lens shape"],
  ["cam üretim bilgisi", "Lens made in"],
  ["şişe tipi", "Bottle type"],
  ["cam şişe", "Glass bottle"],
  ["şeffaf cam şişe", "Clear glass bottle"],
  ["koku yoğunluğu", "Fragrance strength"],
  ["sprey başlıklı", "Spray cap"],
  ["garanti süresi", "Warranty period"],
  ["batarya türü", "Battery type"],
  ["düğme pil", "Button cell"],
  ["su geçirmezlik", "Water resistance"],
  ["gönderim şekli", "Delivery"],
  ["kutulu gönderim sağlanır", "Delivered boxed"],
  ["çap", "Diameter"],
  ["sürdürülebilirlik", "Sustainability"],
  ["menşe", "Origin"],
  ["türkiye", "Turkey"],
  ["ithal", "Imported"],
  ["çelik", "Steel"],
  ["gümüş", "Silver"],
  ["nakış işlemeli", "Embroidered"],
  ["kuşaklı", "Belted"],
  ["günlük", "Everyday"],
  ["pijama takımı", "Pyjama set"],
  ["interlok", "Interlock"],
  ["beli lastıklı", "Elasticated waist"],
  ["arkası cepli", "Back pocket"],
  ["manşetli kol", "Cuffed sleeve"],
  ["parçalı tasarım", "Panelled design"],
  ["önden tam düğmeli", "Full button front"],
  ["önden tam fermuarlı", "Full zip front"],
  ["kontrast şerit detaylı", "Contrast stripe detail"],
  ["dokulu keten görünüm", "Textured linen look"],
  ["yünlü dokuma kaşmir", "Woven wool cashmere"],
  ["likralı fitilli kaşkorse", "Ribbed lycra jersey"],
  ["likrali fitilli kaşkorse", "Ribbed lycra jersey"],
  ["uv400 korumalı", "UV400 protection"],
]);

/*
  ÇOK SÖZCÜKLÜ İFADELER ÖNCE. Tek tek çevrilse anlam bozulurdu:
  "Kiloya Uygun" sözcük sözcük "to weight suitable" olurdu.
*/
/*
  SINIR `\b` DEĞİL, UNICODE BAKIŞI — "ş", "ü", "ğ" ASCII sözcük
  karakteri sayılmıyor. `\bselanik\s+örgü\b` kalıbı bu yüzden hiç
  eşleşmiyordu: "ü"den sonra `\b` sınır bulamıyor.
*/
const IFADELER: Array<[RegExp, string]> = [
  /*
    "KILOYA" İKİ YAZIMLA GEÇİYOR. Katalogda hem "Kiloya" hem
    "Kıloya" (noktasız ı) var ve `/i` bayrağı Türkçe İ/ı çiftini
    katlamıyor — düz `kiloya` kalıbı 300 hücreyi kaçırıyordu.
  */
  /*
    KİLO SATIRININ YEDİ YAZIMI (25.10.2026'da yazılmış çevirilerde
    ölçüldü). Eski kalıp yalnızca "50-65 Kiloya Uygun"u tanıyordu;
    katalogda ayrıca "Kiloaya" (yazım hatası), "85-95Kiloya"
    (boşluksuz), "50 - 59 Kg Uygundur." ve "45 – 50 Kg Uygun"
    (uzun tire) var. Tanınmayan yazımlarda "Uygundur" İngilizce
    metnin ortasında Türkçe duruyordu — 370 üründe, 1.150 geçiş —
    ve kapsam denetimi bunu göremiyordu çünkü "uygundur" Türkçeye
    özgü harf taşımıyor (TURKCE_ASCII notu).

    Önceki sınır `(?<![\p{L}\d])` idi ve rakamdan hemen sonra gelen
    "Kiloya"yı ELİYORDU: "85-95Kiloya Uygun" hiç eşleşmedi. Sınır
    harfe indirildi; rakam zaten bu satırın normal komşusu.
  */
  [/(?<!\p{L})k[ıi]lo(a)?ya\s+uygun(dur)?\.?(?![\p{L}\d])/giu, "kg"],
  [/(?<![\p{L}\d])kg\s+uygun(dur)?\.?(?![\p{L}\d])/giu, "kg"],
  /* "11-13 Yaşa Uygun" tablonun en sık hücresi (1.501 kez). */
  [/(?<![\p{L}\d])ya[şs]a?\s+uygun(?![\p{L}\d])/giu, "years"],
  /*
    "… İÇİN UYGUNDUR" — KİLO VE YAŞ (25.10.2026'da ölçüldü).

    Tabloda beden satırı dört yazımla geçiyor: "Kiloya Uygun"
    (zaten vardı), "Kilo İçin Uygundur", "kg için uygundur." ve
    yaş karşılıkları. Yalnızca ilki tanındığı için "50-65 Kilo
    İçin Uygundur" hücresinde üç sözcük çevrilmeden kalıyor ve
    tek bir beden tablosu ürünü eşiğin altına düşürüyordu —
    yalnızca kilo satırları 300'den fazla geçişti.

    "İÇİN" DE BÜYÜK İ İLE YAZILIYOR: kalıbın kendisi ilk hâlinde
    `i[çc]in` diyordu ve başlık biçimli hücreyi hiç görmedi —
    aşağıdaki "Su İtici" notuyla aynı tuzak, aynı dosyada iki kez.
    Testi olmasaydı kural ölü doğacaktı.

    Karşılık "kg": "Kiloya Uygun" için seçilen biçimin aynısı,
    yoksa aynı tablonun iki satırı iki ayrı dille yazılırdı.
    Sayılara dokunulmuyor; betiğin rakam denetimi bunu her
    kayıtta sınıyor.
  */
  [/(?<![\p{L}\d])k[ıi]lo\s+[iİ][çc][iİ]n\s+uygundur\.?(?![\p{L}\d])/giu, "kg"],
  [/(?<![\p{L}\d])kg\s+[iİ][çc][iİ]n\s+uygundur\.?(?![\p{L}\d])/giu, "kg"],
  [/(?<![\p{L}\d])ya[şs]\s+[iİ][çc][iİ]n\s+uygundur\.?(?![\p{L}\d])/giu, "years"],
  [/(?<![\p{L}\d])ya[şs]a\s+uygundur\.?(?![\p{L}\d])/giu, "years"],
  [/(?<![\p{L}\d])(\d+)\s*-\s*(\d+)\s+ya[şs](?![\p{L}\d])/giu, "ages $1-$2"],
  [/(?<![\p{L}\d])standart\s+beden(?![\p{L}\d])/giu, "one size"],
  /* Büyük harf duyarlı: "S Beden" → "size S". Sözcük düzeyinde
     çevrilseydi "S size" olurdu, yani sıra ters. */
  [/(?<![\p{L}\d])([A-Z0-9]{1,3})\s+[Bb]eden(?![\p{L}\d])/gu, "size $1"],
  [/(?<![\p{L}\d])bisiklet\s+yaka(sı|lı|s[ıi])?(?![\p{L}\d])/giu, "crew neck"],
  [/(?<![\p{L}\d])biskilet\s+yaka(?![\p{L}\d])/giu, "crew neck"],
  [/(?<![\p{L}\d])polo\s+yaka(lı)?(?![\p{L}\d])/giu, "polo collar"],
  [/(?<![\p{L}\d])balıkçı\s+yaka(lı)?(?![\p{L}\d])/giu, "roll neck"],
  [/(?<![\p{L}\d])yarım\s+boğazlı(?![\p{L}\d])/giu, "half turtleneck"],
  [/(?<![\p{L}\d])kanguru\s+cep(li)?(?![\p{L}\d])/giu, "kangaroo pocket"],
  [/(?<![\p{L}\d])tam\s+kalıp(?![\p{L}\d])/giu, "regular fit"],
  [/(?<![\p{L}\d])regular\s+tam\s+kalıp(?![\p{L}\d])/giu, "regular fit"],
  [/(?<![\p{L}\d])regular\s+kalıp(?![\p{L}\d])/giu, "regular fit"],
  [/(?<![\p{L}\d])dar\s+kalıp(?![\p{L}\d])/giu, "slim fit"],
  [/(?<![\p{L}\d])bol\s+kalıp(?![\p{L}\d])/giu, "relaxed fit"],
  [/(?<![\p{L}\d])ön\s+ve\s+arka\s+baskılı(?![\p{L}\d])/giu, "front and back print"],
  [/(?<![\p{L}\d])ön\s+bask[ıi](lı)?(?![\p{L}\d])/giu, "front print"],
  [/(?<![\p{L}\d])arka\s+bask[ıi](lı)?(?![\p{L}\d])/giu, "back print"],
  [/(?<![\p{L}\d])kol\s+ve\s+etek\s+riban(a|alı)(?![\p{L}\d])/giu, "ribbed cuffs and hem"],
  [/(?<![\p{L}\d])yaka\s*,?\s*kol\s*,?\s*etek\s+ribanalı(?![\p{L}\d])/giu, "ribbed neck, cuffs and hem"],
  [/(?<![\p{L}\d])yaka\s*,?\s*kol\s*,?\s*etek\s+kendinden\s+dokuma(?![\p{L}\d])/giu, "self-woven neck, cuffs and hem"],
  [/(?<![\p{L}\d])bisiklet\s+yakalı\s*,?\s*ribanalı(?![\p{L}\d])/giu, "ribbed crew neck"],
  [/(?<![\p{L}\d])üç\s+iplik\s+içi\s+pamuklu(?![\p{L}\d])/giu, "three-thread cotton-backed"],
  [/(?<![\p{L}\d])iki\s+iplik(?![\p{L}\d])/giu, "two-thread"],
  [/(?<![\p{L}\d])üç\s+iplik(?![\p{L}\d])/giu, "three-thread"],
  [/(?<![\p{L}\d])beli\s+(bağacıklı|bağcıklı)(?![\p{L}\d])/giu, "drawstring waist"],
  [/(?<![\p{L}\d])beli\s+last[ıi]kli(?![\p{L}\d])/giu, "elasticated waist"],
  [/(?<![\p{L}\d])kapşon\s+ip\s+bagacıklı(?![\p{L}\d])/giu, "drawstring hood"],
  [/(?<![\p{L}\d])kapüşonlu\s+ve\s+kordon\s+ipli(?![\p{L}\d])/giu, "hooded with drawstring"],
  [/(?<![\p{L}\d])kapşon\s+içi\s+astarlı(?![\p{L}\d])/giu, "lined hood"],
  [/(?<![\p{L}\d])içi\s+kapitone\s+astarlı(?![\p{L}\d])/giu, "quilted lining"],
  [/(?<![\p{L}\d])içi\s+astarlı(?![\p{L}\d])/giu, "lined"],
  [/(?<![\p{L}\d])tam\s+fermuarlı(?![\p{L}\d])/giu, "full zip"],
  [/(?<![\p{L}\d])yarım\s+fermuarlı(?![\p{L}\d])/giu, "half zip"],
  [/(?<![\p{L}\d])kalın\s+fitilli\s+örgü(?![\p{L}\d])/giu, "chunky ribbed knit"],
  /* "Selanik Örgü" tek bir örgü türü; sözcük sözcük çevrilince
     "milano knit knit" gibi tekrar çıkıyordu. */
  [/(?<![\p{L}\d])selanik\s+örgü(sü)?(?![\p{L}\d])/giu, "milano knit"],
  [/(?<![\p{L}\d])süprem\s+penye(?![\p{L}\d])/giu, "single jersey"],
  [/(?<![\p{L}\d])sporcu\s+atlet(i)?(?![\p{L}\d])/giu, "sports vest"],
  [/(?<![\p{L}\d])mikro\s+su\s+itici\s+özelli(ğ|g)i\s+var(?![\p{L}\d])/giu, "water-repellent finish"],
  [/(?<![\p{L}\d])su\s+itici(?![\p{L}\d])/giu, "water-repellent"],
  [/(?<![\p{L}\d])su\s+geçirmez(?![\p{L}\d])/giu, "waterproof"],
  [/(?<![\p{L}\d])unisex\s+çocuk(?![\p{L}\d])/giu, "unisex kids"],
  [/(?<![\p{L}\d])çocuk\s+ve\s+garson(?![\p{L}\d])/giu, "kids and junior"],
  [/(?<![\p{L}\d])kısa\s+kol(lu)?(?![\p{L}\d])/giu, "short sleeve"],
  [/(?<![\p{L}\d])uzun\s+kol(lu)?(?![\p{L}\d])/giu, "long sleeve"],
  [/(?<![\p{L}\d])double\s+oversize(?![\p{L}\d])/giu, "double oversize"],
  /* "Flota Cepli" ve "Boru Paça" tek birer giysi terimi; sözcük
     sözcük çevrilince "patch pocket" yerine "patch with pockets"
     gibi bozuk karşılıklar çıkıyordu. */
  [/(?<![\p{L}\d])flota\s+cep(li)?(?![\p{L}\d])/giu, "patch pocket"],
  [/(?<![\p{L}\d])boru\s+pa[çc]a(lı|li)?(?![\p{L}\d])/giu, "straight leg"],
  /*
    "Su İtici" BÜYÜK İ İLE DE YAZILIYOR ve `/i` bayrağı onu küçük
    i'ye katlamıyor: `su\s+itici` kalıbı başlık biçimli hücreyi
    ("Su İtici Mikro") hiç görmüyordu. Aynı tuzak "kiloya" için
    bu dosyada zaten yazılı; burada gözden kaçmıştı.
  */
  [/(?<![\p{L}\d])su\s+[iİ]tici(?![\p{L}\d])/giu, "water-repellent"],
];

/** Tek sözcükler. Bulunmayan sözcük OLDUĞU GİBİ kalıyor. */
const SOZCUKLER = new Map<string, string>([
  ["unisex", "unisex"], ["erkek", "men"], ["kadın", "women"], ["çocuk", "kids"],
  ["kız", "girls"], ["bebek", "baby"], ["garson", "junior"],
  ["oversize", "oversize"], ["regular", "regular"], ["slimfıt", "slim fit"],
  ["slim", "slim"], ["baskılı", "printed"], ["baskı", "print"],
  ["penye", "jersey"], ["pamuk", "cotton"], ["pamuklu", "cotton"],
  ["polyester", "polyester"], ["akrilik", "acrylic"], ["viskon", "viscose"],
  ["elastan", "elastane"], ["likra", "lycra"], ["likralı", "stretch"],
  ["yün", "wool"], ["triko", "knit"], ["örgü", "knit"], ["dokuma", "woven"],
  ["ribanalı", "ribbed"], ["ribana", "ribbed"], ["fitilli", "ribbed"],
  ["kapüşonlu", "hooded"], ["kapşonlu", "hooded"], ["kapşon", "hood"],
  ["kapüşon", "hood"], ["fermuarlı", "zipped"], ["fermuar", "zip"],
  ["düğmeli", "buttoned"], ["cepli", "with pockets"], ["cep", "pocket"],
  ["kolsuz", "sleeveless"], ["yakalı", "collared"], ["yaka", "neckline"],
  ["boğazlı", "turtleneck"], ["astarlı", "lined"], ["astar", "lining"],
  ["kapitone", "quilted"], ["lastikli", "elasticated"], ["lastıkli", "elasticated"],
  ["bağcıklı", "drawstring"], ["bağacıklı", "drawstring"], ["nakışlı", "embroidered"],
  ["desenli", "patterned"], ["düz", "plain"], ["çizgili", "striped"],
  ["yaz", "summer"], ["kış", "winter"], ["bahar", "spring"], ["sonbahar", "autumn"],
  ["mevsim", "season"], ["yazlık", "summer"], ["kışlık", "winter"],
  ["siyah", "black"], ["beyaz", "white"], ["gri", "grey"], ["lacivert", "navy"],
  ["bordo", "burgundy"], ["bej", "beige"], ["haki", "khaki"], ["füme", "charcoal"],
  ["kırmızı", "red"], ["mavi", "blue"], ["yeşil", "green"], ["sarı", "yellow"],
  ["pembe", "pink"], ["mor", "purple"], ["kahve", "brown"], ["turuncu", "orange"],
  ["yaş", "years"], ["beden", "size"], ["kalıp", "fit"], ["detay", "detail"],
  ["kumaş", "fabric"], ["iplik", "thread"], ["var", "yes"], ["yok", "no"],
  ["ve", "and"], ["ile", "with"], ["içi", "inner"], ["ön", "front"],
  ["arka", "back"], ["üst", "top"], ["alt", "bottom"], ["kol", "sleeve"],
  ["etek", "hem"], ["boy", "length"], ["uzun", "long"], ["kısa", "short"],
  ["kalın", "thick"], ["ince", "thin"], ["yumuşak", "soft"], ["rahat", "comfortable"],
  ["standart", "standard"], ["şardonsuz", "unbrushed"], ["şardonlu", "brushed"],
  ["pike", "piqué"], ["süprem", "single jersey"], ["kendinden", "self"],
  /*
    TABLO VERİSİNDE KALAN EN SIK SÖZCÜKLER (23.10.2026'da 3.411
    açıklama taranarak ölçüldü). Düzyazı sözcükleri ("sağlar",
    "kazandırır", "zamansız") BİLEREK yok: onları sözcük sözcük
    çevirmek bozuk İngilizce üretir ve kapsam eşiği o açıklamaları
    zaten eliyor.
  */
  ["yakası", "collar"], ["paça", "leg"], ["paçalı", "legged"],
  ["çepli", "with pockets"], ["ipli", "drawstring"], ["ip", "drawstring"],
  ["bagacıklı", "drawstring"], ["üç", "three"], ["iki", "two"], ["dört", "four"],
  ["dik", "stand-up"], ["selanik", "milano knit"], ["gömlek", "shirt"],
  ["şort", "shorts"], ["takım", "set"], ["yarım", "half"], ["iç", "inner"],
  ["parça", "piece"], ["parçalı", "panelled"], ["geniş", "wide"],
  ["dar", "slim"], ["bol", "relaxed"], ["sıcak", "warm"], ["tutan", "keeping"],
  ["ambalajı", "packaging"], ["ambalaj", "packaging"], ["adet", "pieces"],
  ["kumaşı", "fabric"], ["kalıbı", "fit"], ["detayı", "detail"],
  ["tişört", "t-shirt"], ["sweatshirt", "sweatshirt"], ["hırka", "cardigan"],
  ["kazak", "jumper"], ["mont", "coat"], ["ceket", "jacket"], ["yelek", "gilet"],
  ["atlet", "vest top"], ["tayt", "leggings"], ["elbise", "dress"],
  ["pantolon", "trousers"], ["eşofman", "tracksuit"], ["çorap", "socks"],
  /*
    TÜRKÇE HARFİ OLMAYAN DEĞERLER (25.10.2026). Yazılmış 2.451
    İngilizce açıklama tarandı; bunlar metnin içinde Türkçe
    duruyordu ve kapsam denetimi hiçbirini görmüyordu
    (TURKCE_ASCII notu). Yalnızca ETİKET/DEĞER sözcükleri burada;
    düzyazı parçaları bilerek dışarıda, onlar modele gidiyor.
  */
  ["kompakt", "compact"], ["kompak", "compact"], ["compack", "compact"],
  ["kordon", "drawstring"], ["beli", "waist"], ["kollar", "sleeves"],
  ["kollarda", "sleeves"], ["kolunda", "sleeve"], ["yandan", "side"],
  ["mikro", "micro"], ["kalite", "quality"], ["ilik", "buttonhole"],
  ["dokulu", "textured"], ["deri", "leather"], ["derisi", "leather"],
  ["polyemid", "polyamide"], ["silim", "slim"], ["keten", "linen"],
  ["petekli", "honeycomb"], ["cepler", "pockets"], ["file", "mesh"],
  ["pens", "darts"], ["pantalon", "trousers"], ["hakiki", "genuine"],
  ["suni", "faux"], ["cizgili", "striped"], ["lastik", "elastic"],
  ["kesim", "cut"], ["tilki", "fox"], ["kolej", "college"],
  ["koyun", "sheep"], ["su", "water"], ["sol", "left"], ["tam", "full"],
]);

/** Türkçeye özgü harf taşıyan sözcük (çevrilmemiş olanı saymak için). */
const TURKCE_SOZCUK = /[ışğİıŞĞçöüÇÖÜ]/;

/*
  TÜRKÇE AMA TÜRKÇE HARFİ YOK — KAPSAMIN KÖR NOKTASI (25.10.2026).

  "Çevrilmemiş mi?" sorusu tek ölçütle yanıtlanıyordu: sözcükte
  ı/ş/ğ/ç/ö/ü var mı. Yoksa "zaten İngilizce ya da marka adı"
  sayılıp kapsama BİLE GİRMİYORDU. Oysa katalogdaki Türkçe
  sözcüklerin bir kısmı salt ASCII: "uygundur", "kompakt",
  "modelin", "bedendir", "kordon", "flota".

  Bedeli ölçüldü: yazılmış 2.451 İngilizce açıklamanın 370'inde
  Türkçe metin duruyordu ("50 - 59 Kg Uygundur." 90 üründe) ve
  kapsam oranı bunların hiçbirini görmediği için satırlar
  sorunsuz yazılmıştı. Eşik %85'ti ama ölçtüğü şey eksikti.

  Buradaki sözcükler çevrilmiyor — bilerek: çoğu düzyazı
  parçası ("modelin üzerindeki ürün … bedendir") ve sözcük sözcük
  çevirmek bozuk İngilizce üretir. Sayılmaları yetiyor: hücre
  kapanmamış görünüyor, ürün eşiğin altında kalıyor ve modele
  gidiyor (scripts/aciklama-modelle.mjs).
*/
const TURKCE_ASCII = new Set([
  "uygun", "uygundur", "kilo", "kiloya", "kiloaya", "beden", "bedeni", "bedendir",
  "modelin", "mankenin", "boyu", "bir", "osy", "adet", "adetir", "renk", "urun",
  "sade", "stil", "model", "modelidir", "rahat", "kombin", "kombinlerde",
]);

function etiketCevir(metin: string): string | null {
  return ETIKETLER.get(metin.trim().toLocaleLowerCase("tr")) ?? null;
}

export type HucreSonucu = { metin: string; toplam: number; cevrilen: number };

/**
 * Bir hücrenin metnini çevirir. Sayılara, yüzdelere ve bilinmeyen
 * sözcüklere DOKUNMAZ; kaçının çevrildiğini de bildirir.
 */
export function hucreCevir(ham: string): HucreSonucu {
  const etiket = etiketCevir(ham);
  if (etiket) return { metin: ham.replace(ham.trim(), etiket), toplam: 1, cevrilen: 1 };

  let metin = ham;
  for (const [desen, karsilik] of IFADELER) metin = metin.replace(desen, karsilik);

  let toplam = 0;
  let cevrilen = 0;
  metin = metin.replace(/\p{L}[\p{L}'’]*/gu, (sozcuk) => {
    /* Sayı ya da ölçü değil, gerçek bir sözcük mü? */
    const dusuk = sozcuk.toLocaleLowerCase("tr");
    const karsilik = SOZCUKLER.get(dusuk);
    if (karsilik) {
      cevrilen += 1;
      toplam += 1;
      return karsilik;
    }
    /* Zaten İngilizce ya da marka adı olabilir: Türkçeye özgü harf
       taşımıyorsa çevrilmemiş SAYILMIYOR. "Polyester", "ACRYLIC".
       Listedeki sözcükler istisna — Türkçe ama ASCII (yukarıdaki
       gerekçe). */
    if (!TURKCE_SOZCUK.test(sozcuk) && !TURKCE_ASCII.has(dusuk)) return sozcuk;
    toplam += 1;
    return sozcuk;
  });

  return { metin, toplam, cevrilen };
}

export type AciklamaSonucu = { html: string; kapsam: number };

/**
 * HTML açıklamayı çevirir. Etiket ve özniteliklere dokunmaz;
 * yalnızca metin düğümlerini çevirir.
 */
export function aciklamaCevir(ham: string, sozluk?: ReadonlyMap<string, string>): AciklamaSonucu {
  let toplam = 0;
  let cevrilen = 0;

  /* Etiketleri olduğu gibi bırakıp aradaki metni çeviriyoruz.
     Düzenli ifade burada yeterli: girdi kendi panelimizden gelen
     basit bir tablo, iç içe betik ya da yorum yok. */
  const html = ham.replace(/(^|>)([^<]+)(?=<|$)/g, (tam, onek: string, govde: string) => {
    if (!govde.trim()) return tam;
    /*
      HAZIR KARŞILIK VARSA O KULLANILIYOR (25.10.2026).

      Eşleme tablosu kapalı bir dağarcık tanıyor: etiketler,
      değerler, beden satırları. Tablonun içindeki DÜZYAZI
      paragrafları ("günlük kullanımda şıklık kazandırır") sözcük
      sözcük çevrilemiyor — bozuk İngilizce üretir, dosyanın
      başındaki gerekçe. 25.10.2026'da ölçüldü: eşiği geçemeyen
      497 ürünün kapanmayan 853 hücresinin 399'u böyle cümleydi.

      Sözlük o cümlelerin MODELDEN gelen karşılığını taşıyor
      (scripts/aciklama-modelle.mjs). Burası saf kalıyor: ağ yok,
      karar yok — verilen karşılığı yerine koyuyor.

      Karşılığı olan hücre TAM kapsanmış sayılıyor; kapsam oranı
      zaten "bilinmeyen bir şey kaldı mı" sorusunun ölçüsü.
    */
    const hazir = sozluk?.get(govde.trim().replace(/\s+/g, " "));
    if (hazir !== undefined) {
      toplam += 1;
      cevrilen += 1;
      return onek + govde.replace(govde.trim(), hazir);
    }
    const sonuc = hucreCevir(govde);
    toplam += sonuc.toplam;
    cevrilen += sonuc.cevrilen;
    return onek + sonuc.metin;
  });

  return { html, kapsam: toplam === 0 ? 1 : cevrilen / toplam };
}

/**
 * Eşleme tablosunun TAMAMEN kapatamadığı hücrelerin ham metni
 * (boşlukları sadeleştirilmiş, benzersiz, tabloda göründükleri
 * sırayla). Modele sorulacak parçalar bunlar.
 */
export function kapanmayanHucreler(ham: string): string[] {
  const cikti: string[] = [];
  const gorulen = new Set<string>();
  for (const es of ham.matchAll(/(^|>)([^<]+)(?=<|$)/g)) {
    const govde = es[2];
    if (!govde.trim()) continue;
    const { toplam, cevrilen } = hucreCevir(govde);
    /* `toplam === 0`: içinde Türkçe sözcük yok (sayı, marka adı,
       zaten İngilizce). Sorulacak bir şey de yok. */
    if (toplam === 0 || cevrilen === toplam) continue;
    const anahtar = govde.trim().replace(/\s+/g, " ");
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push(anahtar);
  }
  return cikti;
}

/*
  KAPSAM EŞİĞİ. Türkçe sözcüklerin %85'i çevrilemiyorsa açıklama
  yazılmıyor ve vitrin Türkçe tabloya düşüyor.

  Neden yüksek: tablo kısa ve kapalı bir dağarcık kullanıyor, yani
  düşük kapsam "bilinmeyen bir şey var" demek. Yarı Türkçe bir
  tablo, Türkçe bir tablodan KÖTÜ — müşteri hangi satıra
  güveneceğini bilemiyor.
*/
export const KAPSAM_ESIGI = 0.85;
