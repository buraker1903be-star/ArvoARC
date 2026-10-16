import assert from "node:assert/strict";
import test from "node:test";
import { istatistikBaslangici, siparisIstatistikleri, type IstatistikSiparisi } from "@/lib/siparis-istatistik";

/* An: 16 Ekim 2026 14:00 Türkiye saati (11:00 UTC). */
const AN = Date.parse("2026-10-16T11:00:00Z");
const siparis = (created_at: string, total: number, ek: Partial<IstatistikSiparisi> = {}): IstatistikSiparisi => ({
  total, status: "confirmed", payment_status: "paid", created_at, source: "storefront", ...ek,
});

test("son 30 gün, önceki 30 gün ve değişim", () => {
  const s = siparisIstatistikleri([
    siparis("2026-10-16T08:00:00Z", 10_000),
    siparis("2026-10-01T08:00:00Z", 30_000),
    siparis("2026-09-01T08:00:00Z", 20_000),
  ], AN);
  assert.equal(s.son30, 2);
  assert.equal(s.onceki30, 1);
  assert.equal(s.siparisDegisimi, 100);
  assert.equal(s.ciro30, 40_000);
  assert.equal(s.ciroDegisimi, 100);
  assert.equal(s.ortalamaSepet, 20_000);
});

test("iptal ve iade ciroya sayılmaz, kapanan oranına girer", () => {
  const s = siparisIstatistikleri([
    siparis("2026-10-10T08:00:00Z", 10_000),
    siparis("2026-10-11T08:00:00Z", 50_000, { status: "cancelled" }),
    siparis("2026-10-12T08:00:00Z", 50_000, { payment_status: "refunded" }),
  ], AN);
  assert.equal(s.ciro30, 10_000);
  assert.equal(s.ortalamaSepet, 10_000);
  assert.equal(s.kapanan30, 2);
  assert.equal(s.kapananOrani, 67);
});

test("ay sınırı Türkiye saatiyle: 30 Eylül 22:00 UTC = 1 Ekim 01:00 Türkiye → Ekim", () => {
  const s = siparisIstatistikleri([siparis("2026-09-30T22:00:00Z", 5_000)], AN);
  assert.deepEqual(s.aylik.map((a) => a.ad), ["May", "Haz", "Tem", "Ağu", "Eyl", "Eki"]);
  assert.equal(s.aylik[5].adet, 1);
  assert.equal(s.aylik[4].adet, 0);
});

test("pencere altı ayın başını kapsıyor (1 Mayıs Türkiye)", () => {
  assert.equal(new Date(istatistikBaslangici(AN)).toISOString(), "2026-04-30T21:00:00.000Z");
});

test("önceki dönem boşsa değişim yok, kaynaklar çoktan aza", () => {
  const s = siparisIstatistikleri([
    siparis("2026-10-10T08:00:00Z", 1, { source: "manual" }),
    siparis("2026-10-11T08:00:00Z", 1),
    siparis("2026-10-12T08:00:00Z", 1),
  ], AN);
  assert.equal(s.siparisDegisimi, null);
  assert.deepEqual(s.kaynaklar, [{ kaynak: "storefront", adet: 2 }, { kaynak: "manual", adet: 1 }]);
});
