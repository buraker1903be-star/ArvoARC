import assert from "node:assert/strict";
import { test } from "node:test";
import { isBankTransfer } from "@/lib/payment-method";

test("havale siparişi tanınır", () => {
  assert.equal(isBankTransfer({ payment_method: "Banka havalesi / EFT" }), true);
  assert.equal(isBankTransfer({ payment_method: "HAVALE" }), true);
});

test("kart ya da bilinmeyen yöntem havale sayılmaz", () => {
  assert.equal(isBankTransfer({ payment_method: "Kredi kartı" }), false);
  assert.equal(isBankTransfer({}), false);
  assert.equal(isBankTransfer(null), false);
  assert.equal(isBankTransfer("havale"), false);
});
