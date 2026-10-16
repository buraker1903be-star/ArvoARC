import { test } from "node:test";
import assert from "node:assert/strict";
import { akisTamMi, sellableStock } from "@/lib/supplier-stock";

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
