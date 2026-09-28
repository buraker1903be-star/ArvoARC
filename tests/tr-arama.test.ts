import assert from "node:assert/strict";
import test from "node:test";
import { aramaEsliyor, aramaIcinSadelestir } from "@/lib/tr-arama";

/*
  BU PROJEDE GERÇEKLEŞEN KUSUR. Türkçe küçültme I → ı, İ → i verir.
  Klavyeden "Indirim" yazan kullanıcı "İndirimler" menüsünü bulamıyordu:
  aranan "ındirim", hedef "indirimler" oluyordu ve iki dizgi hiç
  karşılaşmıyordu. Aşağıdaki senaryolar o eşleşmeleri sabitliyor.
*/

test("I ile yazılan terim İ ile başlayan başlığı buluyor", () => {
  assert.ok(aramaEsliyor("İndirimler", "Indirim"));
  assert.ok(aramaEsliyor("İndirimler", "indirim"));
  assert.ok(aramaEsliyor("İade Talepleri", "IADE"));
  assert.ok(aramaEsliyor("İstanbul", "ıstanbul"));
});

test("noktasız ı ile yazılan terim i taşıyan başlığı buluyor", () => {
  /* Ters yön de gerekiyor: "sıparış" gibi yazımlar da eşleşmeli. */
  assert.ok(aramaEsliyor("Siparişler", "sıparış"));
  assert.ok(aramaEsliyor("Siparişler", "siparis"));
});

test("şğüöç harfleri ASCII karşılıklarıyla aranabiliyor", () => {
  assert.ok(aramaEsliyor("Ürünler", "urunler"));
  assert.ok(aramaEsliyor("Koleksiyonlar", "koleksiyon"));
  assert.ok(aramaEsliyor("Müşteriler", "musteri"));
  assert.ok(aramaEsliyor("Çıkış", "cikis"));
  assert.ok(aramaEsliyor("Mağaza tasarımı", "magaza tasarimi"));
  assert.ok(aramaEsliyor("Öne Çıkanlar", "one cikanlar"));
  assert.ok(aramaEsliyor("Gönderiler", "gonderi"));
});

test("sadeleştirme yalnızca ASCII küçük harf üretiyor", () => {
  assert.equal(aramaIcinSadelestir("İNDİRİMLER"), "indirimler");
  assert.equal(aramaIcinSadelestir("Ürün Şığüöç"), "urun siguoc");
  assert.equal(aramaIcinSadelestir("STOK"), "stok");
});

test("ilgisiz terim eşleşmiyor", () => {
  /* Sadeleştirme her şeyi eşit hâle getirmiyor; yanlış pozitif olmamalı. */
  assert.equal(aramaEsliyor("Siparişler", "koleksiyon"), false);
  assert.equal(aramaEsliyor("Ürünler", "musteri"), false);
});

test("boş ve tanımsız değerler çökmeden boş dizgi veriyor", () => {
  /* Palet ilk karede boş terimle çağırıyor; sunucudan null da gelebiliyor. */
  assert.equal(aramaIcinSadelestir(""), "");
  assert.equal(aramaIcinSadelestir(undefined as unknown as string), "");
  assert.equal(aramaIcinSadelestir(null as unknown as string), "");
  /* Boş aranan her hedefin içinde geçer: palet o durumda tüm listeyi gösteriyor. */
  assert.ok(aramaEsliyor("Ürünler", ""));
});
