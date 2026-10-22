/*
  ÇEVİRİ DENETİMİ.

  Çeviri kendi sunucudaki açık ağırlıklı bir modelden geliyor ve
  kalitesi DEĞİŞKEN: Türkçe metni olduğu gibi geri verebiliyor,
  "Here is the translation:" diye konuşabiliyor, markdown çitiyle
  sarabiliyor. Müşterinin okuduğu ürün adını üreten bir kuralın testi
  olmalı.

  ÖLÇÜT: yarım ya da Türkçe kalmış bir "İngilizce" ad, çevirisiz bir
  üründen KÖTÜ — çevirisiz ürün Türkçe adıyla görünüyor ve bu dürüst.
*/
import test from "node:test";
import assert from "node:assert/strict";
import {
  AD_SINIRI,
  ceviriKarari,
  hedefGrubuKoruyor,
  hedefGrubuUydurmuyor,
  giysiTuruDogru,
  jsonCikar,
  koleksiyonIstemi,
  sayilariKoruyor,
  urunIstemi,
  yankiTutuyor,
} from "@/lib/ceviri/dogrula";

const KAYNAK = "Kadın Yazlık Şort";

test("düzgün çeviri kabul ediliyor", () => {
  const karar = ceviriKarari("Women's Summer Shorts", KAYNAK, AD_SINIRI);
  assert.deepEqual(karar, { kabul: true, metin: "Women's Summer Shorts" });
});

test("çevrilmesi gereken sözcük kalmışsa reddediliyor", () => {
  /* Giysi ve özellik sözcükleri çevrilmek ZORUNDA: biri kalmışsa
     model yarım çevirmiş. Liste kataloğun kendi sözcüklerinden
     (3.442 ürün adı sayıldı). */
  for (const metin of ["Kadin Yazlık Shorts", "Women's Şort", "Men's Pamuklu T-Shirt"]) {
    const karar = ceviriKarari(metin, KAYNAK, AD_SINIRI);
    assert.equal(karar.kabul, false, metin);
    assert.match(!karar.kabul ? karar.sebep : "", /çevrilmemiş/);
  }
});

test("metin toptan Türkçe kalmışsa reddediliyor", () => {
  /* Listede olmayan sözcüklerle de olsa toptan çevrilmemiş bir
     metin geçmemeli: kelimelerin yarısından fazlası Türkçeye özgü
     harf taşıyorsa çeviri yapılmamış demektir. */
  const karar = ceviriKarari("Işıltılı parıltı sağlayan karışım", KAYNAK, AD_SINIRI);
  assert.equal(karar.kabul, false);
});

test("BASKI KONUSU TÜRKÇE KALABİLİR", () => {
  /*
    Önceden tek kural vardı: çıktıda "ı", "ş", "ğ" varsa reddet.
    Baskı konusunun (özel ad, tarih, slogan) Türkçe kalması kuralı
    eklenince o kural KENDİ KURALIMIZLA ÇELİŞTİ — aşağıdaki ad
    DOĞRU bir İngilizce ürün adı ve eski kural onu atıyordu
    (22.10.2026'da yerel modelle ölçüldü).

    Baskının üzerindeki yazı çevrilirse ürün yanlış tanıtılır:
    tişörtte "Emek ve Dayanışma" yazıyor, "Labour and Solidarity"
    yazmıyor.
  */
  const kaynak = "1 Mayıs Emek ve Dayanışma Bayraklı Baskılı Bisiklet Yaka T-shirt - Siyah";
  const karar = ceviriKarari(
    "1 Mayıs Emek ve Dayanışma Flag Printed Crew Neck T-Shirt - Black",
    kaynak,
    AD_SINIRI,
    true,
  );
  assert.equal(karar.kabul, true, !karar.kabul ? karar.sebep : "");
});

test("baskı konusu korunurken giysi sözcüğü çevrilmeden kalamaz", () => {
  /* Korunan ifade, çevirmemek için bahane değil: "Tişört" kalmışsa
     kayıt yine reddediliyor. */
  const kaynak = "1 Mayıs Emek ve Dayanışma Baskılı Tişört - Siyah";
  const karar = ceviriKarari(
    "1 Mayıs Emek ve Dayanışma Printed Tişört - Black",
    kaynak,
    AD_SINIRI,
    true,
  );
  assert.equal(karar.kabul, false);
  assert.match(!karar.kabul ? karar.sebep : "", /çevrilmemiş/);
});

test("ö, ü, ç REDDEDİLMİYOR", () => {
  /* İngilizcede alıntı sözcüklerde ve marka adlarında geçebiliyor;
     reddetmek doğru çevirileri de atardı. */
  assert.equal(ceviriKarari("Façade Blue Shorts", KAYNAK, AD_SINIRI).kabul, true);
});

test("model konuşmuşsa reddediliyor", () => {
  for (const metin of [
    "Here is the translation: Women's Shorts",
    "Sure! Women's Shorts",
    "```json",
    "As an AI language model, I cannot",
    "İşte çeviri: Women's Shorts",
  ]) {
    assert.equal(ceviriKarari(metin, KAYNAK, AD_SINIRI).kabul, false, metin);
  }
});

test("çit ve tırnak kırpılıyor, çeviri kurtarılıyor", () => {
  /* Model bazen sarıyor; kırpmak anlamı değiştirmiyor ve çalışan bir
     çeviriyi boşa harcamamak gerekiyor. */
  assert.deepEqual(ceviriKarari('"Women\'s Summer Shorts"', KAYNAK, AD_SINIRI), {
    kabul: true,
    metin: "Women's Summer Shorts",
  });
  assert.deepEqual(ceviriKarari("```\nWomen's Shorts\n```", KAYNAK, AD_SINIRI), {
    kabul: true,
    metin: "Women's Shorts",
  });
});

test("kaynakla aynıysa reddediliyor", () => {
  /*
    Model çevirmemiş. Yazmak, çevirdiğini sanıp o ürüne bir daha
    dönmemek olurdu — sessiz bir eksik.
  */
  assert.equal(ceviriKarari(KAYNAK, KAYNAK, AD_SINIRI).kabul, false);
  /* Boşluk ve harf durumu farkı da "aynı" sayılıyor. */
  assert.equal(ceviriKarari("  kadın  yazlık şort ", KAYNAK, AD_SINIRI).kabul, false);
});

test("boş, metin olmayan ve çok uzun reddediliyor", () => {
  assert.equal(ceviriKarari("", KAYNAK, AD_SINIRI).kabul, false);
  assert.equal(ceviriKarari("   ", KAYNAK, AD_SINIRI).kabul, false);
  assert.equal(ceviriKarari(null, KAYNAK, AD_SINIRI).kabul, false);
  assert.equal(ceviriKarari(42, KAYNAK, AD_SINIRI).kabul, false);
  assert.equal(ceviriKarari("x".repeat(AD_SINIRI + 1), KAYNAK, AD_SINIRI).kabul, false);
});

test("JSON cümlenin içinden çıkarılıyor", () => {
  /* Açık modeller JSON'u cümleyle sarmaya meyilli; bütün partiyi
     atmak çalışan bir çeviriyi boşa harcamak olurdu. */
  const yanit = 'Here you go:\n```json\n[{"slug":"a","name":"A"}]\n```\nHope this helps!';
  assert.deepEqual(jsonCikar(yanit), [{ slug: "a", name: "A" }]);
  assert.equal(jsonCikar("hiç json yok"), null);
  assert.equal(jsonCikar('[{"bozuk":]'), null);
  /* Nesne döndürmüşse dizi değil: reddediliyor. */
  assert.equal(jsonCikar('{"slug":"a"}'), null);
});

test("ürün istemi HTML'i ayıklıyor ve açıklamayı kırpıyor", () => {
  /*
    Tedarikçi açıklamaları HTML ve tekrar dolu; tamamını göndermek
    küçük bir modelin bağlamını doldurup adı bile çevirmemesine yol
    açıyordu.
  */
  const istem = urunIstemi([
    { slug: "a", name: "Şort", description: "<p>" + "x".repeat(3000) + "</p>" },
  ]);
  assert.ok(!istem.includes("<p>"));
  const veri = JSON.parse(istem.slice(istem.indexOf("[{")));
  assert.equal(veri[0].description.length, 1500);
  /*
    KİMLİK SAYI, SLUG DEĞİL. Canlıda ölçüldü: slug gönderildiğinde
    model onu ÇEVİRİYORDU ("erkek-atlet" → "men-atlet") ve eşleşme
    slug'la yapıldığı için elli kaydın yirmisi "yanıtta yok" diye
    atlanıyordu — çeviri sessizce yarım kalıyor, hata da
    vermiyordu. Sayıyı çevirmeye kalkmıyor.
  */
  assert.equal(veri[0].id, 1);
  assert.equal(veri[0].slug, undefined);
});

test("istemler yalnızca JSON istiyor", () => {
  /* Düz yazı dönen bir model partiyi düşürüyor; istemin bunu açıkça
     söylemesi en ucuz korumadır. */
  for (const istem of [
    urunIstemi([{ slug: "a", name: "Şort", description: null }]),
    koleksiyonIstemi([{ slug: "kadin", title: "Kadın", description: null }]),
  ]) {
    assert.match(istem, /ONLY a JSON array/);
    /* Kimlik sayı ve DEĞİŞMEDEN kopyalanmalı: slug'ı "aynen koru"
       demek yetmemişti (yukarıdaki gerekçe). */
    assert.match(istem, /Copy the id number unchanged/);
  }
});

/*
  HEDEF GRUP KORUNMALI.

  Canlıda ölçüldü (22.10.2026): "Çocuk Unisex Baskılı T-Shirt" →
  "Unisex Crew Neck T-Shirt". "Çocuk" DÜŞTÜ. Çocuk bedeni bir ürünü
  yetişkin ürünü gibi listelemek müşterinin yanlış ürün almasıyla
  sonuçlanır ve iade kaçınılmaz.

  Bu hata ANLAMSAL ama mekanik olarak yakalanabiliyor — o yüzden
  denetime girdi. Yakalanamayan anlamsal hatalar için panelde elle
  düzeltme var.
*/
test("hedef grup düşerse çeviri reddediliyor", () => {
  const kaynak = "Çocuk Unisex Baskılı T-Shirt - Siyah";
  assert.equal(
    ceviriKarari("Unisex Printed T-Shirt - Black", kaynak, AD_SINIRI, true).kabul,
    false,
  );
  assert.equal(
    ceviriKarari("Kids' Unisex Printed T-Shirt - Black", kaynak, AD_SINIRI, true).kabul,
    true,
  );
});

test("hedef grup eşleşmesi UZUN ifadeyi önce arıyor", () => {
  /*
    "Erkek Çocuk" (boys) "Erkek" ile BAŞLIYOR; kısa desen önce
    aranırsa erkek çocuk ürünü "Men's" sayılır ve denetim o hatayı
    onaylardı.
  */
  assert.equal(hedefGrubuKoruyor("Erkek Çocuk Şort", "Boys' Shorts"), true);
  assert.equal(hedefGrubuKoruyor("Erkek Çocuk Şort", "Men's Shorts"), false);
  assert.equal(hedefGrubuKoruyor("Kız Çocuk Tişört", "Girls' T-Shirt"), true);
});

test("hedef grupla başlamayan ad denetimin dışında", () => {
  /* Zorlamak doğru çevirileri atardı. */
  assert.equal(hedefGrubuKoruyor("Unisex Baskılı Tişört", "Unisex Printed T-Shirt"), true);
  assert.equal(hedefGrubuKoruyor("Pamuklu Çorap", "Cotton Socks"), true);
});

test("hedef grup denetimi AÇIKLAMADA uygulanmıyor", () => {
  /* Açıklama metninde "Kadın" geçmek zorunda değil. */
  const karar = ceviriKarari("A comfortable summer piece.", "Kadın için rahat bir yazlık.", 4000);
  assert.equal(karar.kabul, true);
});

/*
  TERİM SÖZLÜĞÜ İSTEMDE.

  7b model genel çeviride iyi ama mağazanın terimlerinde yanılıyor:
  canlıda "Kürk" → "Coats" ve "Füme" → "Fleece" çıktı. İkincisi bir
  RENGİ kumaş sanmak demek ve renk, müşterinin gözüyle doğruladığı
  ilk özellik.
*/
test("istem terim sözlüğünü ve örnekleri taşıyor", () => {
  const istem = urunIstemi([{ slug: "a", name: "Kürk Yelek", description: null }]);
  assert.match(istem, /fur \(NOT coat\)/);
  assert.match(istem, /"füme" -> charcoal/);
  assert.match(istem, /gilet \(NOT coat\)/);
  /* Çalışılmış örnek: küçük modeller kuralı okuyup ÖRNEĞİ taklit
     ediyor ve sözlük tek başına yelek→gilet'i çözmedi. */
  assert.match(istem, /Kids' Unisex Printed T-Shirt/);
  assert.match(istem, /Fur Gilet/);
});

/*
  YANKI DENETİMİ — YANLIŞ KALEME YAZMAYI ENGELLİYOR.

  Canlıda ölçüldü (22.10.2026): kimlik sayı yapıldıktan sonra
  eşleşme sıraya dayandı ve 7b model partideki BAŞKA kalemin
  cevabını veriyordu. Veritabanına "Yağlar" → "Women's T-Shirts",
  "Duş Jelleri" → "Bath Mats", "El Kremleri" → "Cuticles" yazıldı;
  kırk dokuz koleksiyonun çoğu yanlıştı ve geri alınması gerekti.

  Önceki tasarım (slug ile eşleşme) bu hatayı GÖRÜYORDU — model
  slug'ı çevirince kayıt atlanıyordu. Sayıya geçmek görünür bir
  hatayı GÖRÜNMEZ bir hataya çevirdi; bu depodaki en pahalı kusur
  sınıfı tam olarak bu.

  Ölçüt: atlamak yanlış yazmaktan iyidir. Atlanan kayıt Türkçe
  adıyla görünüyor; yanlış yazılan kayıt müşteriye BAŞKA bir ürünün
  adını gösteriyor.
*/
test("yankı tutuyorsa kabul, tutmuyorsa red", () => {
  assert.equal(yankiTutuyor("Yağlar", "Yağlar"), true);
  /* Asıl yakalanan hata: model başka kalemin kaynağını yankıladı. */
  assert.equal(yankiTutuyor("Yağlar", "Erkek T-shirt"), false);
  assert.equal(yankiTutuyor("Duş Jelleri", "Banyo Paspası"), false);
});

test("yankıda boşluk ve harf durumu farkı bağışlanıyor", () => {
  /*
    Model tireyi ya da çift boşluğu normalleştirebiliyor; bunu
    reddetmek DOĞRU çevirileri atardı. Aranan şey aynı KALEM olması.
  */
  assert.equal(yankiTutuyor("Erkek  Şort", "erkek şort"), true);
  assert.equal(yankiTutuyor("Kadın Yazlık Şort", "Kadın Yazlık Şort "), true);
});

test("yankı yoksa red", () => {
  /* Alanı hiç döndürmeyen model, karışıp karışmadığını
     kanıtlayamıyor demektir. */
  assert.equal(yankiTutuyor("Yağlar", undefined), false);
  assert.equal(yankiTutuyor("Yağlar", null), false);
  assert.equal(yankiTutuyor("Yağlar", 42), false);
});

test("uzun adlarda baştaki yirmi karakter yetiyor", () => {
  /*
    Tam eşitlik kırılgan: uzun tedarikçi adlarında model sonu
    kırpabiliyor. Baş yirmi karakter aynıysa aynı kalemdir — ve
    farklı kalemlerin ilk yirmi karakteri bu katalogda ayrışıyor
    ("Erkek Pike…" ile "Erkek Şort…").
  */
  const uzun = "Erkek Premium Motorcu Kurye Yağmurluk Takım Su Geçirmez";
  assert.equal(yankiTutuyor(uzun, uzun.slice(0, 30)), true);
  assert.equal(yankiTutuyor(uzun, "Kadın Premium Motorcu Kurye"), false);
});

test("istem yankı alanını ve örneği taşıyor", () => {
  const istem = urunIstemi([{ slug: "a", name: "Yağlar", description: null }]);
  assert.match(istem, /"source"/);
  assert.match(istem, /copied EXACTLY/);
  /* Örnek de yankılı: küçük modeller kuralı okuyup örneği taklit
     ediyor. */
  assert.match(istem, /"source": "Çocuk Unisex Baskılı T-Shirt - Siyah"/);
});

/*
  SAYI DENETİMİ — İÇERİK KAYBI.

  Canlıda ölçüldü (22.10.2026): baskılı tişörtlerde model ürünün TEK
  AYIRT EDİCİ ÖZELLİĞİNİ atıyordu —

    "1 Mayıs Emek ve Dayanışma Bayraklı Emekçi Baskılı ... T-shirt"
      → "Unisex Oversized Crew Neck T-Shirt - Black"

  Baskının konusu kayboluyor ve farklı ürünler aynı ada çöküyor.
  Baskılı bir tişörtte müşterinin aldığı şey tam olarak o konu.

  Yankı denetimi bunu GÖREMİYOR: kaynak doğru yankılanıyor, kaybolan
  şey çevirinin kendisi. Sayı en güvenilir işaret — ay adı çevrilse
  de sayı kalmalı.
*/
test("kaynaktaki sayı çeviride yoksa red", () => {
  const kaynak = "1 Mayıs Emek ve Dayanışma Baskılı Bisiklet Yaka T-shirt - Siyah";
  assert.equal(sayilariKoruyor(kaynak, "Unisex Crew Neck T-Shirt - Black"), false);
  assert.equal(
    sayilariKoruyor(kaynak, "1 May Labour and Solidarity Printed Crew Neck T-Shirt - Black"),
    true,
  );
});

test("sayı denetimi ADDA DA AÇIKLAMADA DA uygulanıyor", () => {
  const kaynak = "10 Kasım Atatürk'ü Anma Günü Baskılı T-shirt - Beyaz";
  const dusuk = ceviriKarari("Unisex Printed T-Shirt - White", kaynak, AD_SINIRI, true);
  assert.equal(dusuk.kabul, false);
  assert.match(!dusuk.kabul ? dusuk.sebep : "", /sayı düştü/);

  /*
    AÇIKLAMADA DA REDDEDİLİYOR. Önceden burada `kabul: true`
    bekleniyordu ("metinde her sayının geçmesi beklenemez") ve bu
    katalog için YANLIŞTI: açıklama bir beden tablosu —

      "S Beden 49-69 Kiloya Uygun · M Beden 69-79 Kiloya Uygun"

    Düşen ya da değişen bir kilo, müşterinin yanlış beden alması
    demek ve hiçbir yerde görünmez. Türkçe kalan tablo, yanlış
    kilolu tablodan iyidir.
  */
  assert.equal(ceviriKarari("A printed tee.", kaynak, 4000).kabul, false);
});

test("açıklamada hedef grup denetimi YOK", () => {
  /* Açıklama metninde "Kadın" sözcüğünün geçmesi zorunlu değil;
     zorlamak doğru çevirileri atardı. Sayı denetimi bundan ayrı. */
  const kaynak = "Kadın Yazlık Şort";
  assert.equal(ceviriKarari("A light summer piece.", kaynak, 4000).kabul, true);
});

test("sayısız kaynakta denetim devreye girmiyor", () => {
  /* Çoğu ürün adında sayı yok; zorlamak doğru çevirileri atardı. */
  assert.equal(sayilariKoruyor("Erkek Gömlek - Beyaz", "Men's Shirt - White"), true);
});

test("tekrarlanan sayı bir kez geçse yeter", () => {
  /* "3 İplik ... 3 Renk" gibi adlarda sayının iki kez geçmesi
     gerekmiyor; kaybolmadığını göstermek yeterli. */
  assert.equal(sayilariKoruyor("3 İplik 3 Renk Şort", "Three-thread 3 Shorts"), true);
});

test("MARKA ADI KENDİSİ OLARAK KABUL EDİLİYOR", () => {
  /*
    Kaynakta çevrilecek sözcük ve Türkçe harf yoksa metin zaten
    İngilizce ya da özel ad; olduğu gibi bırakmak doğru. Önceden
    "kaynakla aynı" diye reddediliyordu ve on dört koleksiyon
    çevirisiz kaldı (22.10.2026).

    Çevrilmeye zorlanınca ne olduğu ölçüldü: "L-Recapin" →
    "ArvoCulture", "Beauty Diamonds" → "Beauty".
  */
  for (const marka of ["Aloe Via", "Nanogold", "Racine Q10", "Zeitgard", "Mood Infusion"]) {
    const karar = ceviriKarari(marka, marka, AD_SINIRI);
    assert.equal(karar.kabul, true, marka);
  }
});

test("Türkçe kaynak aynen geri gelirse YİNE reddediliyor", () => {
  /* Marka istisnası, çeviri yapmamak için bahane değil. */
  const karar = ceviriKarari("Kadın Şort", "Kadın Şort", AD_SINIRI);
  assert.equal(karar.kabul, false);
});

test("HEDEF GRUP UYDURULAMAZ", () => {
  /*
    CANLIDA ÖLÇÜLDÜ (23.10.2026, 199 çevrili üründe 5 kayıt):
    kaynakta cinsiyet YOKKEN model ekliyordu.

      "Basic Regular Fit Mint Yeşili Tişört" → "Men's Basic ..."
      "Biker Sporcu Şort - Bej"              → "Women's Biker ..."

    Unisex bir ürünü erkek ürünü diye listelemek, müşterinin yanlış
    ürün alması demek — düşen hedef grubuyla aynı zarar, ters yönden.
  */
  const karar = ceviriKarari(
    "Men's Basic Regular Fit Mint Green T-Shirt",
    "Basic Regular Fit Mint Yeşili Tişört",
    AD_SINIRI,
    true,
  );
  assert.equal(karar.kabul, false);
  assert.match(!karar.kabul ? karar.sebep : "", /UYDURULDU/);
});

test("kaynakta hedef grup varsa uydurma denetimi devreye girmiyor", () => {
  /* "Kadın … Şort" → "Women's … Shorts": ekleme değil, taşıma. */
  assert.equal(
    hedefGrubuUydurmuyor("Kadın Yazlık Şort", "Women's Summer Shorts"),
    true,
  );
  /* Unisex yazan ad da denetim dışı: kaynak zaten grup söylüyor. */
  assert.equal(
    hedefGrubuUydurmuyor("Unisex Baskılı Tişört", "Men's Printed T-Shirt"),
    true,
  );
});

test("GİYSİ TÜRÜ MEKANİK OLARAK ZORLANIYOR", () => {
  /*
    Sözlük yalnızca istemdeydi, yani modele bir öneriydi ve 7b onu
    düzenli olarak yok sayıyordu. Canlıda ölçüldü (23.10.2026):
    "Kazak" → "Jacket" DÖRT ürünün dördünde, "Kürk" → "Mink".
    Hepsi geçerli İngilizce; diğer denetimler göremiyor.
  */
  assert.equal(
    giysiTuruDogru("Çocuk Selanik Yaka Nakışlı Kazak - Gri", "Kids' Printed Jacket - Grey"),
    "kazak → jumper",
  );
  assert.equal(
    giysiTuruDogru("Çocuk Yakalı Parçalı Kürk - Kahve", "Kids' Partially Furred Mink - Brown"),
    null, /* "Furred" içinde "fur" geçiyor: tür doğru taşınmış. */
  );
  assert.equal(giysiTuruDogru("Erkek Gömlek", "Men's T-Shirt"), "gömlek → shirt");
});

test("giysi türünde BİRDEN ÇOK karşılık kabul ediliyor", () => {
  /* "kazak" için hem jumper hem sweater doğru; tek karşılığa
     zorlamak doğru çevirileri atardı. */
  for (const ceviri of ["Kids' Knitted Jumper", "Kids' Sweater", "Kids' Pullover"]) {
    assert.equal(giysiTuruDogru("Çocuk Kazak", ceviri), null, ceviri);
  }
});

test("KÜRK ASTARLI mont kürk sayılmıyor", () => {
  /* Kürk yalnızca astar; çevirisinde "fur" geçmek zorunda değil.
     Kargo ağırlığı betiğindeki ayrımın aynısı. */
  assert.equal(
    giysiTuruDogru("Erkek Çocuk Peluş Kürk Astarlı Şişme Mont", "Boys' Padded Puffer Coat"),
    null,
  );
});
