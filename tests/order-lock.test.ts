import assert from "node:assert/strict";
import { test } from "node:test";
import { isOrderLocked, ORDER_LOCK_MS, withoutLock } from "@/lib/order-lock";

const now = Date.parse("2026-09-15T12:00:00Z");

test("damgası taze olan sipariş kilitli sayılır", () => {
  assert.equal(isOrderLocked({ refund_lock: new Date(now - 10_000).toISOString() }, "refund_lock", now), true);
});

test("damgası yoksa, bozuksa ya da süresi geçtiyse kilit yok", () => {
  assert.equal(isOrderLocked({}, "refund_lock", now), false);
  assert.equal(isOrderLocked(null, "refund_lock", now), false);
  assert.equal(isOrderLocked({ refund_lock: "abc" }, "refund_lock", now), false);
  assert.equal(isOrderLocked({ refund_lock: new Date(now - ORDER_LOCK_MS - 1).toISOString() }, "refund_lock", now), false);
});

test("kilitler birbirinden bağımsız", () => {
  const metadata = { transfer_lock: new Date(now).toISOString() };
  assert.equal(isOrderLocked(metadata, "transfer_lock", now), true);
  assert.equal(isOrderLocked(metadata, "refund_lock", now), false);
});

test("withoutLock yalnızca damgayı çıkarır, girdiyi değiştirmez", () => {
  const metadata = { refund_lock: "x", shipping_address: { city: "İstanbul" }, discount: 500 };
  assert.deepEqual(withoutLock(metadata, "refund_lock"), { shipping_address: { city: "İstanbul" }, discount: 500 });
  assert.equal(metadata.refund_lock, "x");
});
