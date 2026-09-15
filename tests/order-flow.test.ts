import assert from "node:assert/strict";
import { test } from "node:test";
import { isOrderClosed, orderBadge } from "@/lib/commerce-labels";
import { countsAsRevenue, nextOrderStep, refundedAmount, revenueAmount } from "@/lib/order-flow";

test("kısmi iadede ciroya yalnızca kalan tutar sayılır", () => {
  assert.equal(revenueAmount({ total: 100000, status: "confirmed", payment_status: "paid" }), 100000);
  assert.equal(revenueAmount({ total: 100000, status: "confirmed", payment_status: "partially_refunded", refunded_amount: 30000 }), 70000);
  assert.equal(revenueAmount({ total: 100000, status: "fulfilled", payment_status: "partially_refunded", refunded_amount: "abc" }), 100000);
  assert.equal(revenueAmount({ total: 100000, status: "fulfilled", payment_status: "partially_refunded", refunded_amount: 150000 }), 0);
  assert.equal(revenueAmount({ total: 100000, status: "cancelled", payment_status: "paid" }), 0);
});

test("iade edilen tutar: tam iadede tamamı, kısmi iadede kaydedilen tutar", () => {
  assert.equal(refundedAmount({ total: 100000, status: "refunded", payment_status: "refunded" }), 100000);
  assert.equal(refundedAmount({ total: 100000, status: "confirmed", payment_status: "partially_refunded", refunded_amount: 30000 }), 30000);
  assert.equal(refundedAmount({ total: 100000, status: "confirmed", payment_status: "paid" }), 0);
});

test("ciroya yalnızca iptal ve iade edilmemiş sipariş sayılır", () => {
  assert.equal(countsAsRevenue("confirmed", "paid"), true);
  assert.equal(countsAsRevenue("pending", "pending"), true);
  assert.equal(countsAsRevenue("fulfilled", "partially_refunded"), true);
  assert.equal(countsAsRevenue("cancelled", "paid"), false);
  assert.equal(countsAsRevenue("refunded", "refunded"), false);
  assert.equal(countsAsRevenue("fulfilled", "refunded"), false);
});

test("akış doğrusal ilerler, kargodan sonra durur", () => {
  assert.equal(nextOrderStep("pending", "paid")?.key, "confirmed");
  assert.equal(nextOrderStep("confirmed", "paid")?.key, "processing");
  assert.equal(nextOrderStep("processing", "paid")?.key, "fulfilled");
  assert.equal(nextOrderStep("fulfilled", "paid"), null);
});

test("kapanmış siparişte (iptal, iade) akış durur", () => {
  for (const [status, payment] of [["cancelled", "paid"], ["refunded", "refunded"], ["confirmed", "refunded"], ["cancelled", "partially_refunded"]]) {
    assert.equal(isOrderClosed(status, payment), true, `${status}/${payment}`);
    assert.equal(nextOrderStep(status, payment), null, `${status}/${payment}`);
  }
  assert.equal(isOrderClosed("confirmed", "paid"), false);
});

test("kısmi iadeli sipariş açık kalır ve akışta ilerler", () => {
  assert.equal(isOrderClosed("confirmed", "partially_refunded"), false);
  assert.equal(nextOrderStep("confirmed", "partially_refunded")?.key, "processing");
  assert.equal(nextOrderStep("fulfilled", "partially_refunded"), null);
});

test("durum rozeti", () => {
  assert.deepEqual(orderBadge("cancelled", "paid"), { label: "İptal edildi", tone: "bad" });
  assert.deepEqual(orderBadge("confirmed", "partially_refunded"), { label: "Onaylandı · Kısmi iade", tone: "warn" });
  assert.deepEqual(orderBadge("fulfilled", "partially_refunded"), { label: "Tamamlandı · Kısmi iade", tone: "muted" });
  assert.deepEqual(orderBadge("pending", "failed"), { label: "Ödeme başarısız", tone: "bad" });
  assert.equal(orderBadge("pending", "pending").tone, "warn");
  assert.equal(orderBadge("fulfilled", "paid").tone, "muted");
  assert.deepEqual(orderBadge("confirmed", "paid"), { label: "Onaylandı · Ödendi", tone: undefined });
});
