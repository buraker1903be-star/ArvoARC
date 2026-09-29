import assert from "node:assert/strict";
import test from "node:test";
import { kartlaOdenebilir, saglayiciSirasi } from "@/lib/odeme/secim";

/*
  Birincil Tami, yedek PayTR. Yedeğe düşme yalnızca ödeme oturumu
  AÇILIRKEN; müşteri Tami'nin sayfasına düştükten sonra ikinci bir
  oturum açılmaz (çift çekim riski).
*/

test("tercih birincil, öteki yedek", () => {
  assert.deepEqual(saglayiciSirasi("tami", { tami: true, paytr: true }), ["tami", "paytr"]);
  assert.deepEqual(saglayiciSirasi("paytr", { tami: true, paytr: true }), ["paytr", "tami"]);
});

test("HAZIR OLMAYAN sağlayıcı sıradan düşüyor", () => {
  /* Mağaza Tami'yi seçmiş ama anahtarlarını girmemişse kartla ödeme
     tamamen durmasın; hazır olan devralsın. */
  assert.deepEqual(saglayiciSirasi("tami", { tami: false, paytr: true }), ["paytr"]);
  assert.deepEqual(saglayiciSirasi("paytr", { tami: true, paytr: false }), ["tami"]);
});

test("hiçbiri hazır değilse kartla ödeme kapalı", () => {
  const sira = saglayiciSirasi("tami", { tami: false, paytr: false });
  assert.deepEqual(sira, []);
  assert.equal(kartlaOdenebilir(sira), false);
});

test("tercih boş ya da tanınmıyorsa PayTR birincil", () => {
  /* Sütun varsayılanı 'paytr': migration uygulandığında hiçbir
     mağazanın Tami anahtarı yoktu. */
  assert.deepEqual(saglayiciSirasi(null, { tami: true, paytr: true }), ["paytr", "tami"]);
  assert.deepEqual(saglayiciSirasi("bilinmeyen", { tami: true, paytr: true }), ["paytr", "tami"]);
});
