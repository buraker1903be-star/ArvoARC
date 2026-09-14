import assert from "node:assert/strict";
import { test } from "node:test";
import { DAY, trDayStart, trLocalToIso } from "@/lib/tr-time";

test("gün başlangıcı Türkiye saatine göre (UTC+3)", () => {
  // 15 Eylül 00:30 TR = 14 Eylül 21:30 UTC → gün 14 Eylül 21:00 UTC'de başlar
  assert.equal(new Date(trDayStart(Date.parse("2026-09-14T21:30:00Z"))).toISOString(), "2026-09-14T21:00:00.000Z");
  // 14 Eylül 23:30 TR hâlâ 14 Eylül
  assert.equal(new Date(trDayStart(Date.parse("2026-09-14T20:30:00Z"))).toISOString(), "2026-09-13T21:00:00.000Z");
  assert.equal(DAY, 86_400_000);
});

test("datetime-local değeri Türkiye saati olarak okunur", () => {
  assert.equal(trLocalToIso("2026-09-20T10:00"), "2026-09-20T07:00:00.000Z");
  assert.equal(trLocalToIso("2026-09-20T00:30"), "2026-09-19T21:30:00.000Z");
  assert.equal(trLocalToIso("2026-09-20T10:00:45"), "2026-09-20T07:00:45.000Z");
});

test("geçersiz tarih ya da biçim null döner", () => {
  for (const value of ["2026-02-31T10:00", "2026-09-20T24:00", "2026-09-20T10:60", "2026-09-20", "abc", ""]) {
    assert.equal(trLocalToIso(value), null, value);
  }
});
