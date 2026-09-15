import assert from "node:assert/strict";
import { test } from "node:test";
import { orderConfirmationHtml, paymentReceivedEmail, statusUpdateEmail, transferOrderEmail } from "@/lib/email/order-confirmation";

test("havale ödemesi alındı e-postası", () => {
  const mail = paymentReceivedEmail("#AC-2001", "<b>Elif</b>", 184203);
  assert.equal(mail.subject, "Ödemeniz alındı · #AC-2001");
  assert.ok(mail.html.includes("₺1.842,03"), "tutar");
  assert.ok(mail.html.includes("&lt;b&gt;Elif&lt;/b&gt;") && !mail.html.includes("<b>Elif</b>"), "kaçış");
});

test("havale e-postası: ödenecek tutar, indirim ve dörtlü IBAN", () => {
  const mail = transferOrderEmail({
    orderNumber: "#AC-2001", customerName: "Elif",
    items: [{ name: "Denim Ceket", quantity: 1, total: 189900 }],
    total: 184203, transferDiscount: 5697,
    bank: { holder: "ArvoCulture Ltd.", name: "Deneme Bankası", iban: "tr120006100519786457841326", note: null },
  });
  assert.equal(mail.subject, "Siparişiniz alındı · #AC-2001");
  assert.ok(mail.html.includes("TR12 0006 1005 1978 6457 8413 26"), "IBAN gruplu ve büyük harf");
  assert.ok(mail.html.includes("₺1.842,03"), "ödenecek tutar");
  assert.ok(mail.html.includes("−₺56,97"), "havale indirimi");
  assert.ok(mail.html.includes("AÇIKLAMA"), "açıklama satırı");
});

test("havale e-postası: IBAN yoksa banka bölümü yerine yönlendirme", () => {
  const mail = transferOrderEmail({ orderNumber: "#AC-2", customerName: "Elif", items: [], total: 1000, bank: { iban: "" } });
  assert.ok(!mail.html.includes("IBAN"));
  assert.ok(mail.html.includes("Banka bilgileri sipariş onay sayfasında"));
});

test("havale e-postası: metinler HTML'e kaçışla girer", () => {
  const mail = transferOrderEmail({ orderNumber: "#AC-3", customerName: "<i>x</i>", items: [{ name: "<script>", quantity: 1, total: 100 }], total: 100, bank: { iban: "TR00", holder: "A&B" } });
  assert.ok(mail.html.includes("&lt;i&gt;x&lt;/i&gt;") && mail.html.includes("&lt;script&gt;") && mail.html.includes("A&amp;B"));
  assert.ok(!mail.html.includes("<script>"));
});

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
