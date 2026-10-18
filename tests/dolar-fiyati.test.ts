import assert from "node:assert/strict";
import test from "node:test";
import { dolarSenti, dolarYazisi } from "@/lib/dolar-fiyati";

const AYAR = { kur: 40, karPayi: 10 };

test("kuruş sente çevriliyor ve kâr payı ekleniyor", () => {
  /* 400,00 TL ÷ 40 = 10,00 USD; %10 kâr payıyla 11,00 USD. */
  assert.equal(dolarSenti(40000, AYAR), 1100);
});

test("yukarı yuvarlanıyor: aşağı yuvarlamak her üründe zarar", () => {
  /* 100,00 TL ÷ 40 = 2,50 USD; %10 ile 2,75 USD = 275 sent. */
  assert.equal(dolarSenti(10000, AYAR), 275);
  /* 101,00 TL ÷ 40 × 1,10 = 2,7775 → 278 sent (yukarı). */
  assert.equal(dolarSenti(10100, AYAR), 278);
});

test("kâr payı sıfırken yalnızca kur uygulanıyor", () => {
  assert.equal(dolarSenti(40000, { kur: 40, karPayi: 0 }), 1000);
});

test("kur yoksa fiyat YOK: uydurma kurla fiyat gösterilmiyor", () => {
  /* Uydurma bir kurla gösterilen fiyat, ödenenden farklı bir
     rakam göstermektir. */
  assert.equal(dolarSenti(40000, null), null);
  assert.equal(dolarSenti(40000, { kur: 0, karPayi: 10 }), null);
  assert.equal(dolarSenti(40000, { kur: -5, karPayi: 10 }), null);
  assert.equal(dolarSenti(40000, { kur: Number.NaN, karPayi: 10 }), null);
});

test("dolar yazımı İngilizce biçimde", () => {
  assert.equal(dolarYazisi(123456), "$1,234.56");
  assert.equal(dolarYazisi(1100), "$11.00");
});
