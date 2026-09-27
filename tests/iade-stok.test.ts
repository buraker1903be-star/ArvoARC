import assert from "node:assert/strict";
import test from "node:test";
import { stogaDonecekler } from "@/lib/iade-stok";

/*
  İade edilen ürünün stoğa dönüşü. Yanlış olursa stok ŞİŞER ya da
  eksik kalır; ikisi de satışta doğrudan hataya çıkıyor (stoksuz ürün
  satılır ya da eldeki ürün satılamaz).
*/

test("sku ve adet okunuyor", () => {
  assert.deepEqual(stogaDonecekler([{ sku: "TZ-1", quantity: 2 }, { sku: "LR-2", quantity: 1 }]),
    [{ sku: "TZ-1", adet: 2 }, { sku: "LR-2", adet: 1 }]);
});

test("aynı SKU tek harekette toplanıyor", () => {
  /*
    Aynı ürün farklı sebeplerle iki satırda iade edilebiliyor; iki ayrı
    hareket stok kütüğünde bölünmüş görünürdü.
  */
  assert.deepEqual(stogaDonecekler([{ sku: "TZ-1", quantity: 1 }, { sku: "TZ-1", quantity: 2 }]),
    [{ sku: "TZ-1", adet: 3 }]);
});

test("geçersiz adet atlanıyor", () => {
  /*
    Kalemler jsonb olarak saklanıyor ve müşteri tarafında oluşuyor;
    şekli veritabanı tarafından güvence altında değil. Sıfır ve eksi
    adet stoğu bozar, kesirli adet varyantta anlamsız.
  */
  assert.deepEqual(stogaDonecekler([{ sku: "A", quantity: 0 }]), []);
  assert.deepEqual(stogaDonecekler([{ sku: "A", quantity: -3 }]), []);
  assert.deepEqual(stogaDonecekler([{ sku: "A", quantity: 1.5 }]), []);
  assert.deepEqual(stogaDonecekler([{ sku: "A" }]), []);
});

test("SKU'suz kalem atlanıyor", () => {
  // SKU olmadan hangi varyanta ekleneceği bilinemez.
  assert.deepEqual(stogaDonecekler([{ name: "Ürün", quantity: 2 }]), []);
  assert.deepEqual(stogaDonecekler([{ sku: "   ", quantity: 2 }]), []);
});

test("tanınmayan gövde boş dönüyor", () => {
  assert.deepEqual(stogaDonecekler(null), []);
  assert.deepEqual(stogaDonecekler("kalem"), []);
  assert.deepEqual(stogaDonecekler([null, 5, "x"]), []);
});
