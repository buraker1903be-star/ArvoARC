import assert from "node:assert/strict";
import { test } from "node:test";
import { whatsappOnayiVar } from "@/lib/whatsapp/bildirim";

/*
  KURAL: sipariş durumu bildirimi sözleşmenin ifası sayılıyor, bu yüzden
  onay VARSAYILAN. Yalnızca açık ret gönderimi durduruyor.

  17.10.2026'ya kadar tersiydi ve ilk gerçek siparişte hiçbir bildirim
  gitmedi: kutucuk işaretsiz başlıyordu, kimse işaretlemiyordu.
*/

test("kayıtta bir şey yoksa gönderiliyor", () => {
  assert.equal(whatsappOnayiVar(undefined), true);
  assert.equal(whatsappOnayiVar(null), true);
  assert.equal(whatsappOnayiVar({}), true);
  assert.equal(whatsappOnayiVar({ phone: "05551112233" }), true);
});

test("açık ret gönderimi durduruyor", () => {
  assert.equal(whatsappOnayiVar({ whatsapp_onay: false }), false);
  /* Üstveri JSON'dan geldiği için metin hâli de karşılanıyor. */
  assert.equal(whatsappOnayiVar({ whatsapp_onay: "false" }), false);
});

test("açık onay da elbette gönderiliyor", () => {
  assert.equal(whatsappOnayiVar({ whatsapp_onay: true }), true);
  assert.equal(whatsappOnayiVar({ whatsapp_onay: "true" }), true);
});

test("tanınmayan değer gönderimi engellemiyor", () => {
  /*
    Ret AÇIK olmalı. "0", boş metin ya da bozuk bir değer yüzünden
    müşterinin siparişinden habersiz kalması, kapatmak isteyen birinin
    mesaj almasından daha kötü — ikincisinde müşteri zaten sipariş
    vermiş ve mesaj yalnızca kendi siparişi hakkında.
  */
  assert.equal(whatsappOnayiVar({ whatsapp_onay: "" }), true);
  assert.equal(whatsappOnayiVar({ whatsapp_onay: 0 }), true);
  assert.equal(whatsappOnayiVar({ whatsapp_onay: "hayir" }), true);
});
