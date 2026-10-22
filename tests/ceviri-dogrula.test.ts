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
  jsonCikar,
  koleksiyonIstemi,
  urunIstemi,
} from "@/lib/ceviri/dogrula";

const KAYNAK = "Kadın Yazlık Şort";

test("düzgün çeviri kabul ediliyor", () => {
  const karar = ceviriKarari("Women's Summer Shorts", KAYNAK, AD_SINIRI);
  assert.deepEqual(karar, { kabul: true, metin: "Women's Summer Shorts" });
});

test("Türkçe harf kalmışsa reddediliyor", () => {
  /* "ı", "ş", "ğ" İngilizce metinde geçmiyor: biri varsa model
     çevirmemiş ya da yarım çevirmiş. */
  for (const metin of ["Kadin Yazlık Shorts", "Women's Şort", "Yazlik Sort ğ"]) {
    const karar = ceviriKarari(metin, KAYNAK, AD_SINIRI);
    assert.equal(karar.kabul, false, metin);
    assert.match(!karar.kabul ? karar.sebep : "", /Türkçe harf/);
  }
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
  const veri = JSON.parse(istem.slice(istem.indexOf("[")));
  assert.equal(veri[0].description.length, 1500);
  assert.equal(veri[0].slug, "a");
});

test("istemler yalnızca JSON istiyor", () => {
  /* Düz yazı dönen bir model partiyi düşürüyor; istemin bunu açıkça
     söylemesi en ucuz korumadır. */
  for (const istem of [
    urunIstemi([{ slug: "a", name: "Şort", description: null }]),
    koleksiyonIstemi([{ slug: "kadin", title: "Kadın", description: null }]),
  ]) {
    assert.match(istem, /ONLY a JSON array/);
    assert.match(istem, /Keep the slug EXACTLY/);
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
