import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { kategoriBaglantilari, urunleriAyristir } from "@/lib/lr/katalog";

/*
  Örnek, LR'ın canlı kategori ve ana sayfasından 27.09.2026'da kırpıldı:
  iki sade kart ve bir indirimli kart (üstü çizili fiyat + litre fiyatı).

  Yanlış fiyat okumak CANLI MAĞAZADA yanlış fiyat demek. En tehlikelisi
  litre fiyatı: büyük ambalajda üründen düşük çıkıyor ve fark ekranda
  göze batmıyor.
*/
const ornek = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "lr-kategori.html"), "utf8");

test("kart başına tek ve GEÇERLİ fiyat okunuyor", () => {
  const { satirlar, atlanan } = urunleriAyristir(ornek);
  assert.equal(satirlar.length, 3);
  assert.equal(atlanan, 0);
  const indirimli = satirlar.find((s) => s.sku === "71060-1");
  // Kartta üç sayı var: 2.562,90 (üstü çizili), 1.882,90 (geçerli), 62.763,33 (litre).
  assert.equal(indirimli?.fiyat, "1.882,90");
});

test("ürün adı ve kimliği kartın kendisinden geliyor", () => {
  const { satirlar } = urunleriAyristir(ornek);
  assert.equal(satirlar[0].sku, "81000-17");
  assert.equal(satirlar[0].ad, "Aloe Vera Jel İçecek Zencefil & Limon");
});

test("AYNI ÜRÜN birkaç kategoride görünürse tek satır", () => {
  const { satirlar } = urunleriAyristir(ornek + ornek);
  assert.equal(satirlar.length, 3);
});

test("ürün kartı olmayan sayfa boş dönüyor", () => {
  assert.deepEqual(urunleriAyristir("<html><body><p>340,50 ₺</p></body></html>"), { satirlar: [], atlanan: 0 });
  assert.deepEqual(urunleriAyristir(""), { satirlar: [], atlanan: 0 });
});

test("fiyatı okunamayan kart ATLANMIŞ sayılıyor", () => {
  const kart = '<article class="product-element"><a href="?productAlias=12345-1"></a><h3>Ad</h3></article>';
  assert.deepEqual(urunleriAyristir(kart), { satirlar: [], atlanan: 1 });
});

test("kategori bağlantıları mutlaklaşıyor, DIŞ ADRESLER eleniyor", () => {
  const adresler = kategoriBaglantilari(ornek, "https://shop.lrworld.com/cms/TR/tr/x.html");
  assert.equal(adresler.length, 4, "örnekteki dört menü bağlantısı");
  assert.ok(adresler.every((a) => a.startsWith("https://shop.lrworld.com/cms/TR/tr/")));
  /*
    Bağlantı listesi LR'ın sayfasından geliyor; dışarıdaki bir adrese
    istek atmak, sayfaya konan herhangi bir bağlantının sunucumuzu
    oraya yönlendirmesi demekti.
  */
  assert.ok(!adresler.some((a) => a.includes("baska-site.example")));
});

test("oturum belirteci adresten çıkarılıyor", () => {
  const html = '<a href="https://shop.lrworld.com/cms/TR/tr/a.html?casrnc=1234">x</a>' +
    '<a href="https://shop.lrworld.com/cms/TR/tr/a.html?casrnc=9999">x</a>';
  // Aynı sayfa iki kez gezilmesin.
  assert.deepEqual(kategoriBaglantilari(html, "https://shop.lrworld.com/"), ["https://shop.lrworld.com/cms/TR/tr/a.html"]);
});
