import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateRefund, refundOutcome } from "@/lib/refund";

test("kısmi iadede sipariş olduğu adımda kalır, iptal edilmez", () => {
  for (const status of ["pending", "confirmed", "processing", "fulfilled"]) {
    assert.deepEqual(refundOutcome({ orderTotal: 100000, refundedTotal: 20000, status }), {
      full: false, status, paymentStatus: "partially_refunded",
    });
  }
});

test("iade edilen toplam sipariş tutarına ulaşınca sipariş kapanır", () => {
  assert.deepEqual(refundOutcome({ orderTotal: 100000, refundedTotal: 100000, status: "processing" }), {
    full: true, status: "refunded", paymentStatus: "refunded",
  });
  assert.equal(refundOutcome({ orderTotal: 100000, refundedTotal: 60000 + 40000, status: "fulfilled" }).full, true);
});

test("kargo çıkmadıysa kargo bedeli de iade edilir", () => {
  assert.deepEqual(calculateRefund({ itemsTotal: 50000, orderTotal: 100000, shipping: 3000, orderStatus: "processing" }), {
    amount: 53000, itemsTotal: 50000, shippingRefund: 3000, shipped: false,
  });
});

test("kargoya verilmişse kargo bedeli iadeye girmez", () => {
  const result = calculateRefund({ itemsTotal: 50000, orderTotal: 100000, shipping: 3000, orderStatus: "fulfilled" });
  assert.equal(result.amount, 50000);
  assert.equal(result.shippingRefund, 0);
  assert.equal(result.shipped, true);
});

test("tahsil edilenden fazlası iade edilemez", () => {
  assert.equal(calculateRefund({ itemsTotal: 99000, orderTotal: 100000, shipping: 3000, orderStatus: "pending" }).amount, 100000);
});

test("kalem toplamı yoksa siparişin tamamı esas alınır", () => {
  assert.equal(calculateRefund({ itemsTotal: 0, orderTotal: 100000 }).amount, 100000);
  assert.equal(calculateRefund({ itemsTotal: Number.NaN, orderTotal: 100000 }).amount, 100000);
});

test("eksi ya da geçersiz tutarlar 0 sayılır", () => {
  assert.equal(calculateRefund({ itemsTotal: -500, orderTotal: -100 }).amount, 0);
});
