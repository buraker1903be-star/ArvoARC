import assert from "node:assert/strict";
import test from "node:test";
import { siparisRpcHatasi } from "@/lib/siparis-hatasi";

/*
  Manuel sipariş penceresi sunucu hatasını olduğu gibi basıyordu:
  "Insufficient stock for SKU '20319" (16.10.2026).
*/
test("stok hatası Türkçe ve SKU korunuyor", () => {
  const metin = siparisRpcHatasi("Insufficient stock for SKU '20319");
  assert.ok(metin?.startsWith("Stok yetmiyor: '20319"), metin ?? "metin yok");
});

test("bilinen hatalar çevriliyor", () => {
  assert.equal(siparisRpcHatasi("Commerce module is disabled"), "Satış modülü kapalı; manuel sipariş oluşturulamaz.");
  assert.ok(siparisRpcHatasi("Order must contain at least one item")?.includes("en az bir kalem"));
});

test("tanınmayan hata null döner: üstteki metin kendi kararını verir", () => {
  assert.equal(siparisRpcHatasi("some other failure"), null);
});
