import { test } from "node:test";
import assert from "node:assert/strict";
import { girisHataKodu } from "@/lib/giris-hatasi";

test("ağ hatası şifre hatası sayılmıyor", () => {
  // 16.10.2026: TLS doğrulanamadı, "fetch failed" — ekran "şifre hatalı" diyordu.
  assert.equal(girisHataKodu({ name: "AuthRetryableFetchError", message: "fetch failed", status: 0 }), "server-error");
  assert.equal(girisHataKodu({ message: "fetch failed" }), "server-error");
  assert.equal(girisHataKodu({ status: 503, message: "Service unavailable" }), "server-error");
});

test("hız sınırı ayrı söyleniyor", () => {
  assert.equal(girisHataKodu({ status: 429, message: "Request rate limit reached" }), "too-many");
  assert.equal(girisHataKodu({ code: "over_request_rate_limit" }), "too-many");
});

test("gerçek kimlik hatası", () => {
  assert.equal(girisHataKodu({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }), "invalid-credentials");
  assert.equal(girisHataKodu(null), "invalid-credentials");
});
