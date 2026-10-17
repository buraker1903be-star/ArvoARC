import assert from "node:assert/strict";
import test from "node:test";
import { odemeSonucuHtml } from "@/lib/odeme/sonuc-metni";

/*
  Kart dönüşünde siparişin kaydı okunamazsa müşteri "hiçbir açıklama
  olmadan ana sayfa" görüyordu — üstelik paranın çekilmiş olabileceği
  anda (17.10.2026).
*/
test("dizine girmiyor ve referans gövdede", () => {
  const govde = odemeSonucuHtml({ baslik: "Ödemenizin sonucu doğrulanamadı", mesaj: "…", referans: "abc-123" });
  assert.ok(govde.includes('name="robots" content="noindex,nofollow"'));
  assert.ok(govde.includes("abc-123"));
  assert.ok(govde.startsWith("<!doctype html>"));
});

test("metin HTML'e kaçışla giriyor", () => {
  const govde = odemeSonucuHtml({ baslik: "<script>x</script>", mesaj: "a & b", referans: '"q"' });
  assert.ok(!govde.includes("<script>x</script>"));
  assert.ok(govde.includes("&lt;script&gt;"));
  assert.ok(govde.includes("a &amp; b"));
  assert.ok(govde.includes("&quot;q&quot;"));
});

test("referans yoksa kutu hiç çizilmiyor", () => {
  const govde = odemeSonucuHtml({ baslik: "Başlık", mesaj: "Mesaj" });
  assert.ok(!govde.includes("Ödeme referansı"));
});
