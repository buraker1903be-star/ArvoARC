import { test } from "node:test";
import assert from "node:assert/strict";
import { akisTamMi, sellableStock, varyantSatilabilirMi } from "@/lib/supplier-stock";

test("tampon eşiktir: altına düşen satışa kapanır", () => {
  assert.equal(sellableStock(5, 5), 5);
  assert.equal(sellableStock(4, 5), 0);
  assert.equal(sellableStock(12, 0), 12);
  assert.equal(sellableStock(Number.NaN, 5), 0);
});

test("akış tamsa akışta olmayan kapatılabilir", () => {
  // 16.10.2026: 3.161 ürün, önceki tur 3.161.
  assert.equal(akisTamMi(3161, 3161), true);
  assert.equal(akisTamMi(3000, 3161), true);
});

test("yarım ya da boş akış hiçbir şeyi kapatmaz", () => {
  assert.equal(akisTamMi(0, 3161), false);
  assert.equal(akisTamMi(1200, 3161), false);
  assert.equal(akisTamMi(Number.NaN, 3161), false);
});

test("ilk turda kıyas yok: boş olmayan akış yeterli", () => {
  assert.equal(akisTamMi(3161, 0), true);
  assert.equal(akisTamMi(3161, null), true);
});

/*
  arc_variant_available'ın TS karşılığı. Eşik sınırı `sellableStock`
  ile aynı olmalı: tampon 5 iken 5 adet satılabilir. SQL tarafı
  "stok > tampon" diyordu ve tam sınırda panel "5 adet var" derken
  vitrin ürünü hiç göstermiyordu (migration 20261017123209).
*/
test("tedarikçi varyantı tamponun altına düşünce kapanıyor", () => {
  const tampon = new Map([["LR", 5]]);
  const varyant = (stock: number) => ({ stock, supplier: "LR", allow_backorder: false });
  assert.equal(varyantSatilabilirMi(varyant(9), tampon), true);
  /* Tam sınır: içe aktarım bu miktarı satılabilir yazıyor. */
  assert.equal(varyantSatilabilirMi(varyant(5), tampon), true);
  assert.equal(varyantSatilabilirMi(varyant(4), tampon), false);
  assert.equal(varyantSatilabilirMi(varyant(0), tampon), false);
});

test("tampon 0 kuralı devre dışı bırakıyor, stoksuzu satmıyor", () => {
  const tampon = new Map([["LR", 0]]);
  assert.equal(varyantSatilabilirMi({ stock: 1, supplier: "LR" }, tampon), true);
  /* `>=` tek başına olsaydı stok 0 da satılabilir çıkardı. */
  assert.equal(varyantSatilabilirMi({ stock: 0, supplier: "LR" }, tampon), false);
});

test("tedarikçisi olmayan varyantta stoksuz satış kuralı geçerli", () => {
  const bos = new Map<string, number>();
  assert.equal(varyantSatilabilirMi({ stock: 0, allow_backorder: true }, bos), true);
  assert.equal(varyantSatilabilirMi({ stock: 0, allow_backorder: false }, bos), false);
  assert.equal(varyantSatilabilirMi({ stock: 3, allow_backorder: false }, bos), true);
});

test("tanımsız tedarikçide varsayılan tampon 5", () => {
  const bos = new Map<string, number>();
  assert.equal(varyantSatilabilirMi({ stock: 5, supplier: "YOK" }, bos), true);
  assert.equal(varyantSatilabilirMi({ stock: 4, supplier: "YOK" }, bos), false);
});

/*
  ARVOCULTURE · TARZYERİ EŞİĞİ 11 (17.10.2026, kurum sahibinin kararı).

  İstenen davranış "stok 10'a düşünce satış kapansın". Alanın anlamı
  "bu değerin ALTINA düşerse kapanır" olduğu için eşik 11; 10 yazılsa
  stok 10 iken ürün hâlâ satılabilirdi. Eşiğin kendisi veri (panelden
  değişir) ama ARİTMETİĞİ koddadır ve iki yönü de burada sabitleniyor.
*/
test("tampon 11: tedarikçide 10 adet kalan varyant satışa kapanıyor", () => {
  assert.equal(sellableStock(10, 11), 0, "10 adet 0 yazılmalı: panelde de tükendi görünür");
  assert.equal(sellableStock(11, 11), 11, "11 adet satılabilir kalmalı");
  assert.equal(varyantSatilabilirMi({ stock: 0, supplier: "tarzyeri" }, new Map([["tarzyeri", 11]])), false);
  assert.equal(varyantSatilabilirMi({ stock: 11, supplier: "tarzyeri" }, new Map([["tarzyeri", 11]])), true);
  /* Ara değer içe aktarımdan çıkmaz ama elle girilirse de kapalı. */
  assert.equal(varyantSatilabilirMi({ stock: 10, supplier: "tarzyeri" }, new Map([["tarzyeri", 11]])), false);
});
