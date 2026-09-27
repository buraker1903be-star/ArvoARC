import assert from "node:assert/strict";
import test from "node:test";
import { konumlariCozumle } from "@/lib/tryoto/konumlar";

/*
  Gönderici konumu listesi. Sınanan şey kodun KAYBOLMAMASI: createOrder'a
  verilecek değer o ve OTO gönderiyi kayıtlı konum olmadan oluşturmuyor —
  liste boş kalınca sipariş açılıp etiket hiç üretilmedi (27.09.2026).
*/

test("DÜZ LİSTE okunuyor, tür satırdaki type alanından", () => {
  /*
    Gerçek yanıtın şekli bu. Önce warehouses[] ve branches[] aranıyordu ve
    hiç eşleşmedi: kullanıcının OTO panelinde dört konumu varken ayar
    ekranı "konum tanımlı değil" diyordu.
  */
  const konumlar = konumlariCozumle({
    success: true,
    pickupLocations: [
      { type: "warehouse", code: "depo-1", name: "Merkez Depo", city: "İstanbul", status: "active" },
      { type: "branch", code: "sube-1", name: "Kadıköy Şube", city: "İstanbul", status: "active" },
    ],
  });
  assert.deepEqual(konumlar, [
    { kod: "sube-1", ad: "Kadıköy Şube", sehir: "İstanbul", tur: "sube", aktif: true },
    { kod: "depo-1", ad: "Merkez Depo", sehir: "İstanbul", tur: "depo", aktif: true },
  ]);
});

test("yanıtın kendisi dizi olabiliyor", () => {
  const konumlar = konumlariCozumle([{ code: "d", name: "Depo", type: "warehouse" }]);
  assert.equal(konumlar.length, 1);
  assert.equal(konumlar[0].tur, "depo");
});

test("PASİF konum listede kalıyor ama işaretli, aktifler önde", () => {
  /*
    Pasifi gizlemek, kullanıcının panelde gördüğü konumu burada
    bulamamasına yol açıyordu. Seçimi kullanıcı yapar; sıralama aktifi
    öne alır.
  */
  const konumlar = konumlariCozumle({
    pickupLocations: [
      { code: "a", name: "Alfa", status: "passive" },
      { code: "b", name: "Beta", status: "active" },
    ],
  });
  assert.deepEqual(konumlar.map((k) => [k.kod, k.aktif]), [["b", true], ["a", false]]);
});

test("durum bildirilmemişse aktif sayılıyor", () => {
  // Listede olması yeterli; "pasif" demek konumu gereksizce geri plana atardı.
  assert.equal(konumlariCozumle({ pickupLocations: [{ code: "x" }] })[0].aktif, true);
});

test("eski şekil (ayrı diziler) hâlâ okunuyor", () => {
  // OTO sürümleri arasında değişirse ekran boşalmasın diye yedek olarak duruyor.
  const konumlar = konumlariCozumle({
    warehouses: [{ code: "depo-1", name: "Merkez Depo" }],
    branches: [{ code: "sube-1", name: "Kadıköy Şube" }],
  });
  assert.deepEqual(konumlar.map((k) => k.tur), ["sube", "depo"]);
});

test("KODU OLMAYAN konum atlanıyor", () => {
  // Kodu olmayan satır createOrder'da kullanılamaz; listede yer kaplamamalı.
  assert.deepEqual(konumlariCozumle({ pickupLocations: [{ name: "Kodsuz" }] }), []);
});

test("adı yoksa kod ad yerine geçiyor", () => {
  assert.deepEqual(konumlariCozumle({ pickupLocations: [{ code: "X-1" }] }), [
    { kod: "X-1", ad: "X-1", sehir: null, tur: "depo", aktif: true },
  ]);
});

test("beklenmeyen gövde boş dönüyor", () => {
  assert.deepEqual(konumlariCozumle(null), []);
  assert.deepEqual(konumlariCozumle({ success: false }), []);
  assert.deepEqual(konumlariCozumle({ pickupLocations: "dizi değil" }), []);
});
