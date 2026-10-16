import assert from "node:assert/strict";
import test from "node:test";
import { formatPersonName } from "@/lib/format-name";

/* Sipariş listesinde müşteri adı "Adı Soyadı" biçiminde (16.10.2026). */

test("büyük ve küçük harfli adlar baş harfi büyük yazılır", () => {
  assert.equal(formatPersonName("ORHAN UĞUZ"), "Orhan Uğuz");
  assert.equal(formatPersonName("çetin halil gedik"), "Çetin Halil Gedik");
});

test("Türkçe i/ı doğru büyür ve küçülür", () => {
  assert.equal(formatPersonName("irmak IŞIK"), "İrmak Işık");
  assert.equal(formatPersonName("İLKER"), "İlker");
});

test("fazla boşluk, tire ve unvan", () => {
  assert.equal(formatPersonName("  ayşe   nur  "), "Ayşe Nur");
  assert.equal(formatPersonName("ali-veli kaya"), "Ali-Veli Kaya");
  assert.equal(formatPersonName("dr. mehmet öz"), "DR. Mehmet Öz");
});

test("boş ad boş döner", () => {
  assert.equal(formatPersonName(null), "");
  assert.equal(formatPersonName("   "), "");
});
