import assert from "node:assert/strict";
import test from "node:test";
import { HAVALE_ETIKETI, isBankTransfer, manuelOdemeTuru, saglayicidanIadeEdilemez } from "@/lib/payment-method";

/*
  Manuel sipariş ödeme türü yazmıyordu; ekran hepsini "Kredi kartı"
  gösteriyordu (17.10.2026, canlıda deneme siparişinde görüldü).
*/
test("yalnızca izinli etiketler kabul ediliyor", () => {
  assert.equal(manuelOdemeTuru("Nakit"), "Nakit");
  assert.equal(manuelOdemeTuru(HAVALE_ETIKETI), HAVALE_ETIKETI);
  assert.equal(manuelOdemeTuru(" Kredi kartı "), "Kredi kartı", "kırpılıyor");
  assert.equal(manuelOdemeTuru("<b>Bitcoin</b>"), null, "metadata ekranda doğrudan gösteriliyor");
  assert.equal(manuelOdemeTuru(null), null);
});

test("nakit de sanal POS'tan iade edilemez, ama havale ekranlarına girmez", () => {
  const nakit = { payment_method: "Nakit" };
  assert.equal(saglayicidanIadeEdilemez(nakit), true);
  assert.equal(isBankTransfer(nakit), false, "havale onayı/72 saat uyarısı nakitte çıkmamalı");
});

test("havale her iki kuralda da havale", () => {
  const havale = { payment_method: HAVALE_ETIKETI };
  assert.equal(isBankTransfer(havale), true);
  assert.equal(saglayicidanIadeEdilemez(havale), true);
});

test("kart sanal POS'tan iade edilir", () => {
  assert.equal(saglayicidanIadeEdilemez({ payment_method: "Kredi kartı" }), false);
  assert.equal(saglayicidanIadeEdilemez({}), false, "alan yoksa kart varsayılıyor");
});
