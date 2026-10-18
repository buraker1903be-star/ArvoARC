import assert from "node:assert/strict";
import test from "node:test";
import { bolgeBul, kargoSenti, type Bolge } from "@/lib/kargo-bolgesi";

const BOLGELER: Bolge[] = [
  { label: "Avrupa", countries: ["DE", "FR", "NL"], fee_cents: 1500, free_over_cents: 15000, sira: 1 },
  { label: "ABD", countries: ["US"], fee_cents: 2500, free_over_cents: 0, sira: 2 },
  { label: "Diğer", countries: [], fee_cents: 3500, free_over_cents: 0, sira: 3 },
];

test("ülkeyi açıkça sayan bölge önce geliyor", () => {
  /* Ters sırada olsaydı "öteki her yer" bölgesi, kendi tarifesi
     olan ülkeleri de yutardı. */
  assert.equal(bolgeBul(BOLGELER, "DE")?.label, "Avrupa");
  assert.equal(bolgeBul(BOLGELER, "US")?.label, "ABD");
});

test("listede olmayan ülke genel bölgeye düşüyor", () => {
  assert.equal(bolgeBul(BOLGELER, "JP")?.label, "Diğer");
  assert.equal(bolgeBul(BOLGELER, "br")?.label, "Diğer");
});

test("eşiği geçen sepette kargo ücretsiz", () => {
  assert.equal(kargoSenti(BOLGELER, "DE", 14999), 1500);
  assert.equal(kargoSenti(BOLGELER, "DE", 15000), 0);
  /* Eşiği olmayan bölgede tutar ne olursa olsun ücret duruyor. */
  assert.equal(kargoSenti(BOLGELER, "US", 999999), 2500);
});

test("tarifesiz ülkede ücret YOK, sıfır değil", () => {
  /* Sıfır "ücretsiz kargo" demek olurdu; tarifesi tanımlanmamış
     bir ülkeye bedava kargo sözü vermek o siparişin maliyetini
     üstlenmektir. */
  const eksik: Bolge[] = [BOLGELER[0]];
  assert.equal(kargoSenti(eksik, "JP", 10000), null);
  assert.equal(bolgeBul(eksik, "JP"), null);
});
