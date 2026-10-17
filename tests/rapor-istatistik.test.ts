import assert from "node:assert/strict";
import test from "node:test";
import { raporOzeti, type RaporIadesi, type RaporKalemi, type RaporSiparisi } from "@/lib/rapor-istatistik";

const DONEM = { bas: "2026-10-01", son: "2026-10-31" };
const AYLAR = [
  { bas: "2026-09-01", son: "2026-09-30", ad: "Eyl", simdiki: false },
  { bas: "2026-10-01", son: "2026-10-31", ad: "Eki", simdiki: true },
];

const siparis = (ek: Partial<RaporSiparisi> & { id: string }): RaporSiparisi => ({
  status: "fulfilled", payment_status: "paid", total: 10_000, subtotal: 9_000, shipping: 1_000,
  source: "native", created_at: "2026-10-05T09:00:00Z", ...ek,
});
const kalem = (ek: Partial<RaporKalemi> & { order_id: string }): RaporKalemi => ({
  product_name: "Krem", sku: "K-1", quantity: 1, total: 9_000, cost_price: 6_000, ...ek,
});

test("ciro dökümü: ürün + kargo − indirim = brüt, − iade = net", () => {
  const o = raporOzeti(
    [siparis({ id: "a", total: 10_000, subtotal: 9_000, shipping: 1_000 }),
     siparis({ id: "b", total: 20_000, subtotal: 22_000, shipping: 0, discount: 2_000 })],
    [], [], DONEM, AYLAR,
  );
  assert.equal(o.urunToplami, 31_000);
  assert.equal(o.kargo, 1_000);
  assert.equal(o.indirim, 2_000);
  assert.equal(o.brutCiro, 30_000, "31.000 + 1.000 − 2.000");
  assert.equal(o.netCiro, 30_000);
  assert.equal(o.ortalamaSepet, 15_000);
});

test("kupon ve havale indirimi birlikte sayılıyor", () => {
  /* Sipariş detayı da ikisini toplayarak gösteriyor (toplamIndirim). */
  const o = raporOzeti([siparis({ id: "a", discount: 1_500, transfer_discount: 500 })], [], [], DONEM, AYLAR);
  assert.equal(o.indirim, 2_000);
});

test("iptal ve iade ciroya girmiyor; iade tutarı ayrı sayılıyor", () => {
  const o = raporOzeti(
    [siparis({ id: "a" }),
     siparis({ id: "b", status: "cancelled" }),
     siparis({ id: "c", payment_status: "partially_refunded", refunded_amount: 2_500 })],
    [], [], DONEM, AYLAR,
  );
  assert.equal(o.siparisAdedi, 3);
  assert.equal(o.gecerliAdet, 2, "iptal düştü");
  assert.equal(o.iptalAdet, 1);
  assert.equal(o.netCiro, 10_000 + 7_500, "kısmi iade net cirodan düşer");
  assert.equal(o.iadeTutari, 2_500);
});

test("dönem dışındaki sipariş sayılmıyor, gün sınırı Türkiye saatiyle", () => {
  const o = raporOzeti(
    [siparis({ id: "eylul", created_at: "2026-09-30T20:00:00Z" }),
     /* UTC'de 30 Eylül 21:30, Türkiye'de 1 Ekim 00:30: AYIN İÇİNDE. */
     siparis({ id: "sinir", created_at: "2026-09-30T21:30:00Z" })],
    [], [], DONEM, AYLAR,
  );
  assert.equal(o.gecerliAdet, 1);
  assert.equal(o.egilim[0].adet, 1, "eylül ayına düşen tek sipariş");
  assert.equal(o.egilim[1].adet, 1);
});

test("maliyeti eksik kalem kârı geçersiz kılıyor, marj kendi tabanından", () => {
  const o = raporOzeti(
    [siparis({ id: "a" }), siparis({ id: "b" })],
    [kalem({ order_id: "a", total: 9_000, cost_price: 6_000 }), kalem({ order_id: "b", cost_price: null })],
    [], DONEM, AYLAR,
  );
  assert.equal(o.karliSiparis, 1, "maliyeti bilinmeyen sipariş hesaba girmiyor");
  assert.equal(o.kar, 3_000);
  assert.equal(o.karTabani, 9_000);
  assert.equal(o.marj, 33.3);
  assert.equal(o.maliyet, 6_000);
});

test("hiç kâr hesaplanamazsa sayı yok (sıfır değil)", () => {
  const o = raporOzeti([siparis({ id: "a" })], [kalem({ order_id: "a", cost_price: null })], [], DONEM, AYLAR);
  assert.equal(o.kar, null);
  assert.equal(o.maliyet, null);
});

test("huni: ileri adıma ulaşan sipariş öncekilerin hepsinde sayılır", () => {
  const o = raporOzeti(
    [siparis({ id: "a", status: "pending" }), siparis({ id: "b", status: "processing" }),
     siparis({ id: "c", status: "fulfilled" }), siparis({ id: "d", status: "cancelled" })],
    [], [], DONEM, AYLAR,
  );
  assert.deepEqual(o.huni.map((h) => h.adet), [3, 2, 2, 1]);
  assert.equal(o.huni[0].adet, 3, "iptal akıştan düştü, 'alındı'da da sayılmıyor");
  /* Geçişler: 2/3, 2/2, 1/2 — en zayıfı son adım. */
  assert.equal(o.enZayifGecis?.nereden, "Hazırlanıyor");
  assert.equal(Math.round(o.enZayifGecis!.oran), 50);
});

test("iade sebepleri dönemde açılan taleplerden", () => {
  const iade = (ek: Partial<RaporIadesi>): RaporIadesi => ({ status: "tamamlandi", reason: "Beğenmedim", refund_amount: 1_000, created_at: "2026-10-09T10:00:00Z", ...ek });
  const o = raporOzeti([], [], [iade({}), iade({}), iade({ reason: "  " }), iade({ created_at: "2026-09-01T10:00:00Z" })], DONEM, AYLAR);
  assert.equal(o.iadeAdedi, 3);
  assert.deepEqual(o.sebepler, [{ sebep: "Beğenmedim", adet: 2 }, { sebep: "Belirtilmedi", adet: 1 }]);
});

test("en çok satan ürünler ciroya göre, yalnızca geçerli siparişlerden", () => {
  const o = raporOzeti(
    [siparis({ id: "a" }), siparis({ id: "x", status: "cancelled" })],
    [kalem({ order_id: "a", sku: "K-1", total: 9_000, quantity: 2 }), kalem({ order_id: "x", sku: "K-9", total: 90_000, quantity: 9 })],
    [], DONEM, AYLAR,
  );
  assert.deepEqual(o.enCokSatan.map((u) => u.sku), ["K-1"]);
  assert.equal(o.satilanAdet, 2, "iptal siparişin adedi satışa girmiyor");
});

test("ödeme türü: boş alan kredi kartı sayılıyor, ciroya göre sıralı", () => {
  const o = raporOzeti(
    [siparis({ id: "a", payment_method: "Nakit", total: 5_000 }),
     siparis({ id: "b", payment_method: "Banka havalesi / EFT", total: 30_000 }),
     siparis({ id: "c", total: 10_000 })],
    [], [], DONEM, AYLAR,
  );
  assert.deepEqual(o.odemeTurleri.map((t) => [t.etiket, t.adet]), [
    ["Banka havalesi / EFT", 1], ["Kredi kartı", 1], ["Nakit", 1],
  ]);
  assert.equal(o.odemeTurleri[0].ciro, 30_000);
});
