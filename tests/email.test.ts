import assert from "node:assert/strict";
import { test } from "node:test";
import { orderConfirmationHtml, statusUpdateEmail } from "@/lib/email/order-confirmation";

test("kargoya verilen sipariş (fulfilled) müşteriye bildirilir", () => {
  const mail = statusUpdateEmail("fulfilled", "#AC-1001", "Elif");
  assert.equal(mail?.subject, "Siparişiniz kargoya verildi · #AC-1001");
});

test("takip numarası girildiyse ikinci kargo e-postası gitmez", () => {
  assert.equal(statusUpdateEmail("fulfilled", "#AC-1001", "Elif", { trackingSent: true }), null);
});

test("iptal ve iade bildirilir; takip seçeneği onları etkilemez", () => {
  assert.equal(statusUpdateEmail("cancelled", "#AC-1", "Elif", { trackingSent: true })?.subject, "Siparişiniz iptal edildi · #AC-1");
  assert.equal(statusUpdateEmail("refunded", "#AC-1", "Elif")?.subject, "İadeniz tamamlandı · #AC-1");
});

test("ara durumlar e-posta üretmez", () => {
  for (const status of ["pending", "confirmed", "processing", "shipped", "delivered"]) {
    assert.equal(statusUpdateEmail(status, "#AC-1", "Elif"), null, status);
  }
});

test("müşteri adı HTML'e kaçışla girer", () => {
  const mail = statusUpdateEmail("cancelled", "#AC-1", "<b>Elif</b>");
  assert.ok(mail?.html.includes("&lt;b&gt;Elif&lt;/b&gt;"));
  assert.ok(!mail?.html.includes("<b>Elif</b>"));
});

test("onay e-postasında tutarlar TL biçiminde", () => {
  const html = orderConfirmationHtml({
    orderNumber: "#AC-1", customerName: "Elif",
    items: [{ name: "Denim Ceket", quantity: 2, total: 379800 }],
    subtotal: 379800, discount: 37980, shipping: 0, total: 341820,
  });
  assert.ok(html.includes("₺3.798,00"), "kalem tutarı");
  assert.ok(html.includes("−₺379,80"), "indirim");
  assert.ok(html.includes("₺3.418,20"), "toplam");
  assert.ok(html.includes("Ücretsiz"), "kargo");
});
