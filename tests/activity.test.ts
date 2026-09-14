import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByDay, relativeTime, type ActivityItem } from "@/lib/activity";

// 15 Eylül 2026 Salı, 12:00 Türkiye saati
const now = Date.parse("2026-09-15T09:00:00Z");
const item = (id: string, at: string): ActivityItem => ({ id, kind: "order", tone: "info", title: id, detail: "", href: "/", at });

test("kısa zaman etiketleri", () => {
  assert.equal(relativeTime("2026-09-15T08:59:30Z", now), "şimdi");
  assert.equal(relativeTime("2026-09-15T08:55:00Z", now), "5 dk");
  assert.equal(relativeTime("2026-09-15T06:00:00Z", now), "3 sa");
  assert.equal(relativeTime("2026-09-14T11:30:00Z", now), "Dün 14:30");
  assert.equal(relativeTime("2026-09-12T09:00:00Z", now), "Cumartesi");
  assert.equal(relativeTime("2026-09-07T09:00:00Z", now), "7 Eyl");
});

test("Türkiye gece yarısı sınırı: 00:30 bugün, 23:30 dün", () => {
  assert.equal(relativeTime("2026-09-14T21:30:00Z", now), "11 sa");
  assert.equal(relativeTime("2026-09-14T20:30:00Z", now), "Dün 23:30");
});

test("gün grupları sırayla oluşur", () => {
  const groups = groupByDay([
    item("a", "2026-09-14T21:30:00Z"), // bugün 00:30
    item("b", "2026-09-14T20:30:00Z"), // dün 23:30
    item("c", "2026-09-12T09:00:00Z"), // bu hafta
    item("d", "2026-09-01T09:00:00Z"), // daha eski
  ], now);
  assert.deepEqual(groups.map((group) => [group.label, group.items.map((entry) => entry.id)]), [
    ["Bugün", ["a"]],
    ["Dün", ["b"]],
    ["Bu hafta", ["c"]],
    ["Daha eski", ["d"]],
  ]);
});
