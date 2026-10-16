import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMoneyToCents } from "@/lib/money";

test("Türkçe ve İngilizce biçimli tutarlar aynı kuruşa çevrilir", () => {
  assert.equal(parseMoneyToCents("1234.56"), 123456);
  assert.equal(parseMoneyToCents("1.234,56"), 123456);
  assert.equal(parseMoneyToCents("1,234.56"), 123456);
  assert.equal(parseMoneyToCents("1.234.567,89"), 123456789);
});

test("tek virgül ondalık sayılır; para birimi ve boşluk yok sayılır", () => {
  assert.equal(parseMoneyToCents("12,50"), 1250);
  assert.equal(parseMoneyToCents("12.5"), 1250);
  assert.equal(parseMoneyToCents("₺1.299,90"), 129990);
  assert.equal(parseMoneyToCents("TRY 45"), 4500);
  assert.equal(parseMoneyToCents(" 99 "), 9900);
});

test("tek ayırıcı ve 3 haneli son grup binliktir", () => {
  assert.equal(parseMoneyToCents("1.234"), 123400);
  assert.equal(parseMoneyToCents("1,234"), 123400);
  assert.equal(parseMoneyToCents("1.234.567"), 123456700);
  assert.equal(parseMoneyToCents("0,5"), 50);
});

test("boş, geçersiz ya da eksi değer 0 olur", () => {
  for (const value of ["", "0", "abc", "-15.00", undefined, null]) {
    assert.equal(parseMoneyToCents(value), 0, String(value));
  }
});

test("form tutarı Türkçe yazımla okunur; okunamayan girdi null", async () => {
  const { formTutari } = await import("@/lib/money");
  // 16.10.2026: "1.500" bin beş yüz liraydı, 1,50 ₺ kaydediliyordu.
  assert.equal(formTutari("1.500"), 150000);
  assert.equal(formTutari("1.234,56"), 123456);
  assert.equal(formTutari("12,50"), 1250);
  assert.equal(formTutari("12.5"), 1250);
  assert.equal(formTutari("30000.00"), 3000000);
  assert.equal(formTutari("₺ 1.500"), 150000);
  // Boş alan 0; harf, eksi ya da yalnızca ayırıcı reddedilir (sessizce 0 ₺ demek yerine).
  assert.equal(formTutari(""), 0);
  assert.equal(formTutari(null), 0);
  assert.equal(formTutari("abc"), null);
  assert.equal(formTutari("-5"), null);
  assert.equal(formTutari(","), null);
});
