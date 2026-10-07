import assert from "node:assert/strict";
import test from "node:test";
import { kartlaOdenebilir, saglayiciSirasi } from "@/lib/odeme/secim";

/*
  Birincil Garanti, yedek PayTR. Yedeğe düşme yalnızca ödeme oturumu
  AÇILIRKEN; müşteri Garanti'nin sayfasına düştükten sonra ikinci bir
  oturum açılmaz (çift çekim riski).
*/

test("tercih birincil, öteki yedek", () => {
  assert.deepEqual(saglayiciSirasi("garanti", { garanti: true, paytr: true }), ["garanti", "paytr"]);
  assert.deepEqual(saglayiciSirasi("paytr", { garanti: true, paytr: true }), ["paytr", "garanti"]);
});

test("HAZIR OLMAYAN sağlayıcı sıradan düşüyor", () => {
  /* Mağaza Garanti'yi seçmiş ama anahtarlarını girmemişse kartla ödeme
     tamamen durmasın; hazır olan devralsın. */
  assert.deepEqual(saglayiciSirasi("garanti", { garanti: false, paytr: true }), ["paytr"]);
  assert.deepEqual(saglayiciSirasi("paytr", { garanti: true, paytr: false }), ["garanti"]);
});

test("hiçbiri hazır değilse kartla ödeme kapalı", () => {
  const sira = saglayiciSirasi("garanti", { garanti: false, paytr: false });
  assert.deepEqual(sira, []);
  assert.equal(kartlaOdenebilir(sira), false);
});

test("tercih boş ya da tanınmıyorsa PayTR birincil", () => {
  /* Sütun varsayılanı 'paytr': migration uygulandığında hiçbir
     mağazanın Garanti anahtarı yoktu. */
  assert.deepEqual(saglayiciSirasi(null, { garanti: true, paytr: true }), ["paytr", "garanti"]);
  assert.deepEqual(saglayiciSirasi("bilinmeyen", { garanti: true, paytr: true }), ["paytr", "garanti"]);
});
