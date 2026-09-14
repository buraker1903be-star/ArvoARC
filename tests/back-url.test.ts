import assert from "node:assert/strict";
import { test } from "node:test";
import { backUrl } from "@/lib/back-url";

test("filtre ve sayfa korunur, önceki sonuç parametreleri silinir", () => {
  assert.equal(
    backUrl("/siparisler?durum=pending&page=2&ok=status&error=x", "/siparisler", { ok: "bulk" }),
    "/siparisler?durum=pending&page=2&ok=bulk",
  );
});

test("bölümün alt sayfasına dönülebilir", () => {
  assert.equal(backUrl("/siparisler/abc-123", "/siparisler", { saved: "1" }), "/siparisler/abc-123?saved=1");
});

test("açık yönlendirme ve başka bölüm engellenir", () => {
  for (const raw of ["https://evil.example/siparisler", "//evil.example/siparisler", "/stok", "/siparisler/a/b", "/siparisler/%2e%2e/stok", "javascript:alert(1)"]) {
    assert.equal(backUrl(raw, "/siparisler", { ok: "1" }), "/siparisler?ok=1", raw);
  }
});

test("boş ya da eksik adres bölüm köküne döner", () => {
  assert.equal(backUrl(null, "/stok", { updated: "SKU +1" }), "/stok?updated=SKU+%2B1");
  assert.equal(backUrl("", "/stok", {}), "/stok");
});
