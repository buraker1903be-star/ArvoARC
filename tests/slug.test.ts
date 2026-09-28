import assert from "node:assert/strict";
import test from "node:test";
import { bosSlug, slugla } from "@/lib/slug";

/*
  CANLIDA OLAN ŞEY. Panelde üç ayrı slugify kopyası vardı ve biri
  Türkçe harfleri NFD ayrıştırmasına bırakıyordu. ç, ğ, ö, ü birleşik
  karakter olduğu için o yolla çözülüyor; NOKTASIZ ı (U+0131) ayrı bir
  temel harf, ayrışmıyor ve süzgeçte siliniyordu.

  Sonuç: "Kırmızı Elbise" oluşturulurken "k-rm-z-elbise", düzenleyicide
  kaydedilirken "kirmizi-elbise" oluyordu — ürüne dokunmadan Kaydet'e
  basmak mağazadaki adresini değiştiriyordu.
*/

test("noktasız ı düşmüyor, i oluyor", () => {
  assert.equal(slugla("Kırmızı Elbise"), "kirmizi-elbise");
  assert.equal(slugla("ISIK IŞIK"), "isik-isik");
});

test("öteki Türkçe harfler de ASCII karşılığına iniyor", () => {
  assert.equal(slugla("Çöl Güneşi"), "col-gunesi");
  assert.equal(slugla("ŞEFTALİ ÇAYI"), "seftali-cayi");
  assert.equal(slugla("Ağda Bandı"), "agda-bandi");
});

test("noktalama tireye iniyor, baş ve sondaki tire kalkıyor", () => {
  assert.equal(slugla("  —Yeni!! Ürün ..  "), "yeni-urun");
  assert.equal(slugla("a/b\\c"), "a-b-c");
  assert.equal(slugla(""), "");
  assert.equal(slugla(null), "");
});

test("kırpma tirenin ortasında bitmiyor", () => {
  /* "kirmizi-" gibi bir adres olmamalı. */
  assert.equal(slugla("kirmizi elbise", 8), "kirmizi");
  assert.equal(slugla("abcdefghij", 5), "abcde");
});

test("boşSlug ilk kullanılmayan adresi veriyor", () => {
  /* (organization_id, slug) tekil; kopyalama buna dayanıyor. */
  assert.equal(bosSlug("kupa-kopya", []), "kupa-kopya");
  assert.equal(bosSlug("kupa-kopya", ["kupa-kopya"]), "kupa-kopya-2");
  assert.equal(bosSlug("kupa-kopya", ["kupa-kopya", "kupa-kopya-2", "kupa-kopya-3"]), "kupa-kopya-4");
  /* Karşılaştırma büyük/küçük harfe bakmıyor: veritabanındaki kayıt
     farklı yazımla gelse de aynı adres sayılmalı. */
  assert.equal(bosSlug("kupa-kopya", ["KUPA-KOPYA"]), "kupa-kopya-2");
});

test("boşSlug taban yoksa ve deneme tükenince null veriyor", () => {
  assert.equal(bosSlug("", ["x"]), null);
  const dolu = ["t", ...Array.from({ length: 9 }, (_, i) => `t-${i + 2}`)];
  assert.equal(bosSlug("t", dolu, 10), null);
});
