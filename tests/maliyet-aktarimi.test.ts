import assert from "node:assert/strict";
import test from "node:test";
import { maliyetleriAyristir } from "@/lib/maliyet-aktarimi";

/*
  Alış fiyatı aktarımı. Yanlış okumak doğrudan KÂRI bozar: maliyet
  yanlışsa kâr sütunu yanlış çıkar ve ona bakıp fiyat kararı verilir.
  Bu yüzden şüpheli satır kabul edilmiyor, atlanıyor ve kullanıcıya
  gösteriliyor.
*/

test("sekmeyle ayrılmış satır okunuyor", () => {
  const { satirlar } = maliyetleriAyristir("LR-12345\t340,50\nLR-67890\t128,00");
  assert.deepEqual(satirlar, [{ sku: "LR-12345", kurus: 34050 }, { sku: "LR-67890", kurus: 12800 }]);
});

test("virgül, noktalı virgül ve tek boşluk da çalışıyor", () => {
  // Kopyalanan tablo hangi ayırıcıyla gelirse gelsin okunmalı.
  assert.equal(maliyetleriAyristir("LR-1;340,50").satirlar[0].kurus, 34050);
  assert.equal(maliyetleriAyristir("LR-2 128,00").satirlar[0].kurus, 12800);
  assert.equal(maliyetleriAyristir("LR-3, 99,90").satirlar[0].kurus, 9990);
});

test("para simgesi ve TL eki temizleniyor", () => {
  assert.equal(maliyetleriAyristir("LR-1\t₺340,50").satirlar[0].kurus, 34050);
  assert.equal(maliyetleriAyristir("LR-2\t340,50 TL").satirlar[0].kurus, 34050);
});

test("binlik ayırıcı doğru okunuyor", () => {
  // "1.234,56" bin iki yüz otuz dört; "1,234.56" de aynı sayı.
  assert.equal(maliyetleriAyristir("LR-1\t1.234,56").satirlar[0].kurus, 123456);
  assert.equal(maliyetleriAyristir("LR-2\t1,234.56").satirlar[0].kurus, 123456);
});

test("ÜRÜN ADI olan satırda fiyat SON sayıdan alınıyor", () => {
  /*
    Kopyalanan tabloda ad da geliyor: "LR-1  Aloe Vera Jel  340,50".
    Adın içindeki sayı fiyat sanılırsa maliyet tamamen yanlış olur.
  */
  const { satirlar } = maliyetleriAyristir("LR-1\tAloe Vera Jel 100 ml\t340,50");
  assert.equal(satirlar[0].sku, "LR-1");
  assert.equal(satirlar[0].kurus, 34050);
});

test("SKU sanılan fiyat ayırt ediliyor", () => {
  // SKU'lar da rakam içeriyor; harf ya da tire taşıyan parça SKU.
  const { satirlar } = maliyetleriAyristir("20301\tLR-ALOE\t128,00");
  assert.equal(satirlar[0].sku, "LR-ALOE");
});

test("okunamayan satır ATLANIYOR ve gösteriliyor", () => {
  /*
    Sessizce yutmak, kullanıcının yüklediğini sanıp eksik maliyetle
    devam etmesi demekti.
  */
  const { satirlar, atlanan } = maliyetleriAyristir("LR-1\t340,50\nbaşlık satırı\nLR-2\tfiyat yok");
  assert.equal(satirlar.length, 1);
  assert.deepEqual(atlanan, ["başlık satırı", "LR-2\tfiyat yok"]);
});

test("sıfır fiyat kabul edilmiyor", () => {
  // parseMoneyToCents geçersiz girdide 0 dönüyor; sıfırı maliyet saymak
  // ürünü bedavaya alınmış gösterirdi.
  assert.equal(maliyetleriAyristir("LR-1\t0").satirlar.length, 0);
});

test("aynı SKU iki kez geçerse SONUNCU kazanıyor", () => {
  // Kullanıcı düzeltmeyi alta ekliyor olabilir.
  const { satirlar } = maliyetleriAyristir("LR-1\t340,50\nLR-1\t355,00");
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].kurus, 35500);
});

test("boş metin boş sonuç veriyor", () => {
  assert.deepEqual(maliyetleriAyristir(""), { satirlar: [], atlanan: [] });
  assert.deepEqual(maliyetleriAyristir("   \n\n  "), { satirlar: [], atlanan: [] });
});
