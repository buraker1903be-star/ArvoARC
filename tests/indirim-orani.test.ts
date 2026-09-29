import assert from "node:assert/strict";
import test from "node:test";
import {
  fiyatDurumu,
  indirimOrani,
  karOrani,
  karOranlari,
  listeYazildi,
  oranYazildi,
  satisYazildi,
  tabanVar,
  indirimliFiyat,
  oranMetni,
  tutar,
  tutarMetni,
} from "@/lib/indirim-orani";

test("oran iki fiyattan türetiliyor", () => {
  assert.equal(indirimOrani(80, 100), 20);
  assert.equal(indirimOrani(2738.9, 3423.63), 20);
});

test("indirim yoksa oran yok", () => {
  /* Vitrin de compare > price değilse üstü çizili fiyatı göstermiyor;
     panel bu durumda boş bir oran göstermeli, %0 değil. */
  assert.equal(indirimOrani(100, 100), null);
  assert.equal(indirimOrani(100, 80), null);
  assert.equal(indirimOrani(100, 0), null);
  assert.equal(indirimOrani(100, Number.NaN), null);
});

test("orandan satış fiyatı kuruşta yuvarlanıyor", () => {
  assert.equal(indirimliFiyat(100, 20), 80);
  assert.equal(indirimliFiyat(3423.63, 20), 2738.9);
  /* Üç ondalıklı ara değer zaten kaydedilemez: veritabanı kuruş tutar. */
  assert.equal(indirimliFiyat(99.99, 33), 66.99);
});

test("geçersiz oran fiyatı bozmuyor", () => {
  assert.equal(indirimliFiyat(100, 0), null);
  assert.equal(indirimliFiyat(100, 100), null);
  assert.equal(indirimliFiyat(100, -5), null);
  assert.equal(indirimliFiyat(0, 20), null);
});

test("oran geri okunup yeniden uygulanınca fiyat kaymıyor", () => {
  /*
    ASIL SINANAN BU. Kullanıcı bir fiyat alanına dokununca oran iki
    fiyattan yeniden türetiliyor; o oran tekrar uygulandığında fiyat
    değişirse alan kendi kendine kayar ve her dokunuşta biraz daha
    ucuzlardı.
  */
  for (const liste of [100, 3423.63, 12.45, 999.9, 0.99]) {
    for (const oran of [5, 12.5, 20, 33, 66.67]) {
      const satis = indirimliFiyat(liste, oran)!;
      const geriOkunan = indirimOrani(satis, liste)!;
      assert.equal(indirimliFiyat(liste, geriOkunan), satis, `${liste} / %${oran}`);
    }
  }
});

test("gerçekçi tutarlarda oran birebir geri okunuyor", () => {
  /*
    Kuruş yuvarlaması küçük tutarlarda oranı kaydırıyor: 12,45 TL'de
    %5 indirim 11,83 TL ediyor ve oran %4,98 olarak geri okunuyor.
    Katalogdaki fiyatlar üç haneli olduğu için pratikte görünmüyor,
    ama sınır burada yazılı dursun.
  */
  for (const liste of [100, 599.9, 3423.63]) {
    for (const oran of [5, 12.5, 20, 33]) {
      const satis = indirimliFiyat(liste, oran)!;
      assert.equal(oranMetni(indirimOrani(satis, liste)), String(oran));
    }
  }
});

test("boş alan sıfır değil", () => {
  /* Boş karşılaştırma "indirim yok" demek; 0 TL sayılsaydı oran
     hesabı %100 indirim sanırdı. */
  assert.ok(Number.isNaN(tutar("")));
  assert.ok(Number.isNaN(tutar("   ")));
  assert.equal(tutar("12,45"), 12.45);
  assert.equal(tutar("12.45"), 12.45);
});

test("alan metni kuruşla yazılıyor, geçersiz değer alanı boşaltıyor", () => {
  assert.equal(tutarMetni(12.5), "12.50");
  assert.equal(tutarMetni(null), "");
  assert.equal(tutarMetni(Number.NaN), "");
  assert.equal(oranMetni(null), "");
});

test("oran yazınca fiyat karşılaştırmaya taşınıyor", () => {
  /* Operasyonun elle yaptığı şey: eski fiyatı karşılaştırmaya yaz,
     indirimli tutarı hesapla, fiyata yaz. */
  const d = oranYazildi(fiyatDurumu("100.00", ""), "20");
  assert.deepEqual(d, { satis: "80.00", liste: "100.00", oran: "20" });
});

test("oran üst üste yazılınca indirimler birikmiyor", () => {
  /*
    "25" yazmak için önce "2" tuşuna basılıyor. Taban satış fiyatı
    olsaydı ikinci tuşta indirim indirimin üstüne biner, fiyat çığ gibi
    düşerdi.
  */
  let d = oranYazildi(fiyatDurumu("100.00", ""), "2");
  d = oranYazildi(d, "25");
  assert.deepEqual(d, { satis: "75.00", liste: "100.00", oran: "25" });
});

test("oran boşaltılınca indirim kalkıyor", () => {
  const d = oranYazildi({ satis: "80.00", liste: "100.00", oran: "20" }, "");
  assert.deepEqual(d, { satis: "100.00", liste: "", oran: "" });
});

test("oranı silip yeniden yazmak tabanı kaybetmiyor", () => {
  let d = { satis: "80.00", liste: "100.00", oran: "20" };
  d = oranYazildi(d, "");
  d = oranYazildi(d, "30");
  assert.deepEqual(d, { satis: "70.00", liste: "100.00", oran: "30" });
});

test("fiyata dokununca oran yeniden türetiliyor", () => {
  const d = satisYazildi({ satis: "80.00", liste: "100.00", oran: "20" }, "90");
  assert.equal(d.oran, "10");
});

test("karşılaştırma silinince oran da siliniyor", () => {
  /* Oran saklanmıyor, türetiliyor: tabanı olmayan bir oran yalan olurdu. */
  const d = listeYazildi({ satis: "80.00", liste: "100.00", oran: "20" }, "");
  assert.equal(d.oran, "");
});

test("taban fiyat yokken oran alanı kapalı", () => {
  assert.equal(tabanVar(fiyatDurumu("", "")), false);
  assert.equal(tabanVar(fiyatDurumu("100.00", "")), true);
  /* Kapalıyken yazılan değer fiyatları bozmuyor. */
  assert.deepEqual(oranYazildi(fiyatDurumu("", ""), "20"), { satis: "", liste: "", oran: "20" });
});

test("kâr oranı alış üzerine hesaplanıyor", () => {
  /* Ürünler listesindeki ALIŞ / KÂR sütunuyla aynı tanım; Siparişler
     ekranındaki brüt marj (kâr ÷ satış) DEĞİL. */
  assert.equal(karOrani(100, 200), 100);
  assert.equal(karOrani(1204.5, 3423.63), 184.2);
});

test("zararda kâr oranı negatif", () => {
  /* Alışın altına inen fiyat gizlenmiyor: operasyoncu tam da bunu
     görmek için bakıyor. */
  assert.equal(karOrani(100, 80), -20);
});

test("alış bilinmiyorsa kâr gösterilmiyor", () => {
  assert.equal(karOrani(0, 200), null);
  assert.equal(karOrani(Number.NaN, 200), null);
  assert.equal(karOranlari(0, fiyatDurumu("200.00", "")), null);
});

test("indirim yoksa iki oran aynı", () => {
  assert.deepEqual(karOranlari(100, fiyatDurumu("200.00", "")), {
    indirimsiz: 100,
    indirimli: 100,
  });
});

test("indirim varsa iki oran ayrışıyor", () => {
  /* Alanın eklenme sebebi: indirim kârın ne kadarını yiyor. */
  assert.deepEqual(karOranlari(100, fiyatDurumu("160.00", "200.00")), {
    indirimsiz: 100,
    indirimli: 60,
  });
});

test("oran yazarken kâr anında düşüyor", () => {
  /* Kaydetmeden görülmesi gerekiyor: indirimi verip kârı sonra
     öğrenmek geç olur. */
  const d = oranYazildi(fiyatDurumu("200.00", ""), "20");
  assert.deepEqual(karOranlari(100, d), { indirimsiz: 100, indirimli: 60 });
});
