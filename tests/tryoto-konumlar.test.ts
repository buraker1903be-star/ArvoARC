import assert from "node:assert/strict";
import test from "node:test";
import { konumlariCozumle } from "@/lib/tryoto/konumlar";

/*
  Gönderici konumu listesi. Sınanan şey kodun KAYBOLMAMASI: createOrder'a
  verilecek değer o ve kullanıcı ayar ekranına elle kopyalıyor.
*/

test("depo ve şube birlikte okunuyor", () => {
  const konumlar = konumlariCozumle({
    success: true,
    warehouses: [{ code: "depo-1", name: "Merkez Depo", city: "İstanbul" }],
    branches: [{ code: "sube-1", name: "Kadıköy Şube", city: "İstanbul" }],
  });
  assert.deepEqual(konumlar, [
    { kod: "sube-1", ad: "Kadıköy Şube", sehir: "İstanbul", tur: "sube" },
    { kod: "depo-1", ad: "Merkez Depo", sehir: "İstanbul", tur: "depo" },
  ]);
});

test("yalnızca depo tanımlıysa branches eksikliği sorun değil", () => {
  // Hesapta şube yoksa OTO o diziyi hiç göndermiyor.
  const konumlar = konumlariCozumle({ success: true, warehouses: [{ code: "d", name: "Depo" }] });
  assert.equal(konumlar.length, 1);
  assert.equal(konumlar[0].sehir, null, "şehir yoksa null");
});

test("KODU OLMAYAN konum atlanıyor", () => {
  // Kodu olmayan satır createOrder'da kullanılamaz; listede yer kaplamamalı.
  assert.deepEqual(konumlariCozumle({ warehouses: [{ name: "Kodsuz" }] }), []);
});

test("adı yoksa kod ad yerine geçiyor", () => {
  assert.deepEqual(konumlariCozumle({ warehouses: [{ code: "X-1" }] }), [
    { kod: "X-1", ad: "X-1", sehir: null, tur: "depo" },
  ]);
});

test("beklenmeyen gövde boş dönüyor", () => {
  assert.deepEqual(konumlariCozumle(null), []);
  assert.deepEqual(konumlariCozumle({ success: false }), []);
  assert.deepEqual(konumlariCozumle({ warehouses: "dizi değil" }), []);
});
