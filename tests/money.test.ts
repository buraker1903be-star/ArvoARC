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

test("boş, geçersiz ya da eksi değer 0 olur", () => {
  for (const value of ["", "0", "abc", "-15.00", undefined, null]) {
    assert.equal(parseMoneyToCents(value), 0, String(value));
  }
});
