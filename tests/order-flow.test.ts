import assert from "node:assert/strict";
import { test } from "node:test";
import { isOrderClosed, orderBadge } from "@/lib/commerce-labels";
import { countsAsRevenue, nextOrderStep } from "@/lib/order-flow";

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

test("kapanmış siparişte (iptal, iade, kısmi iade) akış durur", () => {
  for (const [status, payment] of [["cancelled", "paid"], ["refunded", "refunded"], ["confirmed", "refunded"], ["confirmed", "partially_refunded"]]) {
    assert.equal(isOrderClosed(status, payment), true, `${status}/${payment}`);
    assert.equal(nextOrderStep(status, payment), null, `${status}/${payment}`);
  }
  assert.equal(isOrderClosed("confirmed", "paid"), false);
});

test("durum rozeti", () => {
  assert.deepEqual(orderBadge("cancelled", "paid"), { label: "İptal edildi", tone: "bad" });
  assert.deepEqual(orderBadge("confirmed", "partially_refunded"), { label: "Kısmi iade", tone: "bad" });
  assert.deepEqual(orderBadge("pending", "failed"), { label: "Ödeme başarısız", tone: "bad" });
  assert.equal(orderBadge("pending", "pending").tone, "warn");
  assert.equal(orderBadge("fulfilled", "paid").tone, "muted");
  assert.deepEqual(orderBadge("confirmed", "paid"), { label: "Onaylandı · Ödendi", tone: undefined });
});
