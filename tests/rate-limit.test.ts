import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

test("sınır dolunca istek reddedilir, pencere geçince açılır", () => {
  const hit = createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(hit("a", 0).ok, true);
  assert.equal(hit("a", 100).ok, true);
  assert.equal(hit("a", 200).ok, true);
  const blocked = hit("a", 300);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  // İlk istek 1000 ms sonra pencereden çıkar
  assert.equal(hit("a", 1001).ok, true);
});

test("reddedilen istek pencereyi uzatmaz", () => {
  const hit = createRateLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(hit("a", 0).ok, true);
  assert.equal(hit("a", 500).ok, false);
  assert.equal(hit("a", 900).ok, false);
  assert.equal(hit("a", 1001).ok, true);
});

test("anahtarlar birbirinden bağımsız", () => {
  const hit = createRateLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(hit("a", 0).ok, true);
  assert.equal(hit("b", 0).ok, true);
  assert.equal(hit("a", 10).ok, false);
});

test("bellek dolunca en uzun süredir görülmeyen anahtar atılır", () => {
  const hit = createRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2 });
  hit("a", 0);
  hit("b", 1);
  hit("c", 2); // "a" atılır
  assert.equal(hit("a", 3).ok, true, "atılan anahtar yeniden başlar");
  assert.equal(hit("c", 4).ok, false, "tutulan anahtar sınırda kalır");
});

test("IP adresi başlıklardan okunur", () => {
  assert.equal(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } })), "203.0.113.7");
  assert.equal(clientIp(new Request("https://x", { headers: { "x-real-ip": "198.51.100.2" } })), "198.51.100.2");
  assert.equal(clientIp(new Request("https://x")), "bilinmiyor");
});
