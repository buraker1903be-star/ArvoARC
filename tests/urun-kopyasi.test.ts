import assert from "node:assert/strict";
import test from "node:test";
import { kopyaAdi, kopyaKodlari, kopyaSlugTabani, skuAdaylari, slugSirasi } from "@/lib/urun-kopyasi";

/*
  Kopyanın SKU'ları yeni olmak zorunda: SKU salon genelinde kimlik gibi
  kullanılıyor (stok/actions.ts .eq("sku", …).maybeSingle(), fiyat
  aktarımı yazmayı .eq("sku", …) ile yapıyor). Kaynağın kodlarını
  taşımak, kopyayı oluşturur oluşturmaz stok ekranını bozardı.
*/

test("kopya adı adresle aynı sırayı taşıyor", () => {
  /* Adres "kupa-kopya-2" iken adın "(kopya)" kalması listede iki
     özdeş satır gösterirdi. */
  assert.equal(kopyaAdi("Kupa", 1), "Kupa (kopya)");
  assert.equal(kopyaAdi("Kupa", 2), "Kupa (kopya 2)");
  assert.equal(kopyaAdi("  ", 1), "Ürün (kopya)");
});

test("uzun adda ek korunuyor, kırpılan taraf ad", () => {
  /* Kopyanın kopya olduğu bilgisi, adın son harflerinden değerli. */
  const ad = kopyaAdi("A".repeat(250), 12);
  assert.ok(ad.length <= 200);
  assert.ok(ad.endsWith("(kopya 12)"));
});

test("adres tabanı mevcut adresten türüyor, yoksa addan", () => {
  assert.equal(kopyaSlugTabani("Kırmızı Elbise", "kirmizi-elbise"), "kirmizi-elbise-kopya");
  assert.equal(kopyaSlugTabani("Kırmızı Elbise", null), "kirmizi-elbise-kopya");
  /* Adı da adresi de kullanılamazsa kopya yine de bir adres alıyor. */
  assert.equal(kopyaSlugTabani("!!!", ""), "urun-kopya");
});

test("adresteki sıra okunabiliyor", () => {
  assert.equal(slugSirasi("kupa-kopya", "kupa-kopya"), 1);
  assert.equal(slugSirasi("kupa-kopya", "kupa-kopya-3"), 3);
  /* Başka bir ürünün adresi sayılmamalı: "kupa-kopya-siyah" sıra değil. */
  assert.equal(slugSirasi("kupa-kopya", "kupa-kopya-siyah"), 0);
  assert.equal(slugSirasi("kupa-kopya", "baska-urun"), 0);
  /* "-1" ve "-02" sıra üretmiyor: bunları biz yazmıyoruz. */
  assert.equal(slugSirasi("kupa-kopya", "kupa-kopya-1"), 0);
  assert.equal(slugSirasi("kupa-kopya", "kupa-kopya-02"), 0);
});

test("kod adayları -K ile başlayıp numaralanıyor", () => {
  const adaylar = skuAdaylari("tshirt-siyah", 3);
  assert.deepEqual(adaylar, ["TSHIRT-SIYAH-K", "TSHIRT-SIYAH-K2", "TSHIRT-SIYAH-K3"]);
  assert.deepEqual(skuAdaylari("   "), []);
});

test("dolu olan aday atlanıp ilk boş kod seçiliyor", () => {
  const { esleme, cozulemeyen } = kopyaKodlari(["ABC", "DEF"], ["ABC-K", "ABC-K2"]);
  assert.equal(esleme.get("ABC"), "ABC-K3");
  assert.equal(esleme.get("DEF"), "DEF-K");
  assert.deepEqual(cozulemeyen, []);
});

test("aynı toplu eklemedeki iki varyant aynı kodu alamıyor", () => {
  /*
    Seçilen kod kümeye geri konmasaydı, kaynakta farklı yazımla duran
    iki kod ("abc" ve "ABC") tek bir koda iner ve tek çakışma toplu
    eklemenin tamamını düşürürdü.
  */
  const { esleme } = kopyaKodlari(["ABC", "abc", "ABC "], []);
  assert.equal(esleme.size, 1, "aynı kod bir kez işleniyor");
  assert.equal(esleme.get("ABC"), "ABC-K");
});

test("tüm adaylar doluysa bildiriliyor, sessizce üretilmiyor", () => {
  const dolu = skuAdaylari("ABC");
  const { esleme, cozulemeyen } = kopyaKodlari(["ABC", "DEF"], dolu);
  assert.deepEqual(cozulemeyen, ["ABC"]);
  assert.equal(esleme.get("DEF"), "DEF-K");
});

test("üretilen kodların hepsi birbirinden farklı", () => {
  const kaynak = Array.from({ length: 30 }, (_, i) => `SKU-${i}`);
  const { esleme } = kopyaKodlari(kaynak, []);
  assert.equal(esleme.size, 30);
  assert.equal(new Set(esleme.values()).size, 30);
});
