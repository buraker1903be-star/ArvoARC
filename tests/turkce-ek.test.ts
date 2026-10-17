import assert from "node:assert/strict";
import test from "node:test";
import { iyelikEki, sonSozcuk, yuzdeEkli } from "@/lib/turkce-ek";

/*
  Panelde iki kez yanlış yazıldı: "ciroda ilk beşin payı %82'i"
  (16.10.2026) ve "3.442 ürünün %99'i yayında" (17.10.2026).
*/
test("ek sayının okunuşundan geliyor", () => {
  assert.equal(yuzdeEkli(100), "%100'ü", "yüzü");
  assert.equal(yuzdeEkli(99), "%99'u", "doksan dokuzu — son sözcük 'dokuz', 'doksan' değil");
  assert.equal(yuzdeEkli(0), "%0'ı", "sıfırı");
  assert.equal(yuzdeEkli(3), "%3'ü", "üçü");
  assert.equal(yuzdeEkli(31), "%31'i", "otuz biri");
  assert.equal(yuzdeEkli(67), "%67'si", "altmış yedisi");
  assert.equal(yuzdeEkli(2), "%2'si", "ikisi");
  assert.equal(yuzdeEkli(40), "%40'ı", "kırkı");
  assert.equal(yuzdeEkli(50), "%50'si", "ellisi");
});

test("son sözcük: onluk, yüzlük ve binlik sınırları", () => {
  assert.equal(sonSozcuk(45), "beş");
  assert.equal(sonSozcuk(30), "otuz");
  assert.equal(sonSozcuk(300), "yüz");
  assert.equal(sonSozcuk(2_000), "bin");
  assert.equal(sonSozcuk(5_000_000), "milyon");
});

test("eksi yüzde ve ondalık yuvarlanıyor", () => {
  assert.equal(yuzdeEkli(-12.4), "%12'si", "iki");
  assert.equal(iyelikEki(1), "'i");
});
