import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HAVALE_ETIKETI,
  KART_ETIKETI,
  MANUEL_ODEME_TURLERI,
  isBankTransfer,
  saglayicidanIadeEdilemez,
} from "@/lib/payment-method";

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

test("kart etiketi havale ve nakit akışlarının dışında", () => {
  /* Kartlı sipariş artık yöntemi AÇIKÇA yazıyor; yazdığı değer
     havale ya da sanal POS dışı iade akışlarını tetiklememeli. */
  assert.equal(isBankTransfer({ payment_method: KART_ETIKETI }), false);
  assert.equal(saglayicidanIadeEdilemez({ payment_method: KART_ETIKETI }), false);
});

test("yazılan etiketler panelin izinli listesinde", () => {
  /* Vitrinin yazdığı değer panelde tanınmazsa sipariş ekranı onu
     serbest metin gibi gösterir ve manuel düzenlemede kaybolur. */
  const izinli = MANUEL_ODEME_TURLERI.map((t) => t.deger);
  assert.ok(izinli.includes(HAVALE_ETIKETI));
  assert.ok(izinli.includes(KART_ETIKETI));
});

test("havale etiketi 'havale' kelimesini taşımak zorunda", () => {
  /* Havale akışları (ödeme onayı, 72 saat kuralı, iade reddi)
     metinde "havale" arıyor; etiket değişirse hepsi sessizce
     devre dışı kalır. */
  assert.match(HAVALE_ETIKETI.toLocaleLowerCase("tr-TR"), /havale/);
});
