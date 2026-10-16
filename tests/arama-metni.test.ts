import assert from "node:assert/strict";
import test from "node:test";
import { aramaSadesi } from "@/lib/arama-metni";

/*
  Canlıda ölçüldü (16.10.2026): "aloe via baby" yazınca 243 üründen
  hiçbiri bulunmuyordu, çünkü "VIA" Türkçe kuralla "vıa" oluyor.
*/
test("büyük I ile küçük i aynı sayılıyor", () => {
  assert.equal(aramaSadesi("LR ALOE VIA Baby"), aramaSadesi("lr aloe via baby"));
  assert.equal(aramaSadesi("İNDİRİM"), "indirim");
});

test("şapkalı harfler de katlanıyor: kullanıcı kısayoldan yazıyor", () => {
  assert.ok(aramaSadesi("Aloe Vera Şampuan").includes(aramaSadesi("sampuan")));
  assert.ok(aramaSadesi("Ürün Çeşidi").includes(aramaSadesi("urun")));
});

test("sayı ve işaretler olduğu gibi kalıyor", () => {
  assert.equal(aramaSadesi("'20319 · 249,00 ₺"), "'20319 · 249,00 ₺");
});
