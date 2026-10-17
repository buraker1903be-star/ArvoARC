import assert from "node:assert/strict";
import test from "node:test";
import { ayinSonGunu, okumaBasi, raporDonemi, sonAltiAy } from "@/lib/rapor-donemi";

/* 17 Ekim 2026, 01:30 Türkiye (= 16 Ekim 22:30 UTC). */
const GECE = Date.parse("2026-10-16T22:30:00Z");

test("gece yarısından sonra bile Türkiye günü esas", () => {
  const d = raporDonemi(undefined, undefined, undefined, GECE);
  assert.equal(d.bas, "2026-10-01", "UTC'ye göre hesaplansa eylül ayı çıkardı");
  assert.equal(d.son, "2026-10-31");
  assert.equal(d.anahtar, "bu_ay");
  assert.equal(d.etiket, "Ekim 2026");
});

test("geçen ay ve bu yıl", () => {
  assert.deepEqual(
    (({ bas, son }) => ({ bas, son }))(raporDonemi("gecen_ay", undefined, undefined, GECE)),
    { bas: "2026-09-01", son: "2026-09-30" },
  );
  const yil = raporDonemi("bu_yil", undefined, undefined, GECE);
  assert.equal(yil.bas, "2026-01-01");
  assert.equal(yil.son, "2026-12-31");
});

test("özel aralık: ters girilen düzeltilir, bozuk olan bu aya döner", () => {
  const ters = raporDonemi("ozel", "2026-03-31", "2026-03-01", GECE);
  assert.deepEqual([ters.bas, ters.son], ["2026-03-01", "2026-03-31"]);
  /* "Invalid Date" sorgu penceresinde toISOString ile sayfayı düşürüyordu. */
  assert.equal(raporDonemi("ozel", "abc", "2026-03-01", GECE).anahtar, "bu_ay");
});

test("okuma penceresi aralık ile altı aylık eğilimden eski olanı", () => {
  assert.equal(okumaBasi(raporDonemi(undefined, undefined, undefined, GECE), GECE), "2026-05-01");
  const eski = raporDonemi("ozel", "2025-02-01", "2025-02-28", GECE);
  assert.equal(okumaBasi(eski, GECE), "2025-02-01", "aralık eğilimden eskiyse pencere ona uzar");
});

test("son altı ay sırayla ve sonuncusu içinde bulunulan ay", () => {
  const aylar = sonAltiAy(GECE);
  assert.deepEqual(aylar.map((a) => a.bas), ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
  assert.equal(aylar[5].simdiki, true);
  assert.equal(aylar[5].ad, "Eki");
});

test("şubat ve yıl sınırı", () => {
  assert.equal(ayinSonGunu(2024, 2), "2024-02-29");
  assert.equal(ayinSonGunu(2026, 2), "2026-02-28");
  const ocak = Date.parse("2026-01-05T09:00:00Z");
  assert.equal(raporDonemi("gecen_ay", undefined, undefined, ocak).bas, "2025-12-01");
});
