import assert from "node:assert/strict";
import test from "node:test";
import { rolleri, yetkili, yetkiYok } from "@/lib/yetki-metni";

/*
  Metnin kodla uyuşması bu dosyanın asıl işi. Panelde tema ve mağaza
  ayarlarının kapısı owner/admin/manager olduğu hâlde mesaj "yönetici
  yetkisi gerekir" diyordu: müdür rolündeki kullanıcı yapabileceği bir
  işi yapamayacağını sanırdı.
*/

test("yönetim kapısı üç rolü de sayıyor", () => {
  assert.deepEqual([...rolleri("yonetim")], ["owner", "admin", "manager"]);
  for (const rol of ["owner", "admin", "manager"]) assert.ok(yetkili("yonetim", rol), rol);
  assert.equal(yetkili("yonetim", "member"), false);
  assert.equal(yetkili("yonetim", undefined), false);
});

test("sahiplik kapısı müdürü dışarıda bırakıyor", () => {
  /* Para ve geri alınamaz işler: iade, sipariş silme, ödeme hesapları. */
  assert.deepEqual([...rolleri("sahiplik")], ["owner", "admin"]);
  assert.equal(yetkili("sahiplik", "manager"), false);
  assert.ok(yetkili("sahiplik", "admin"));
});

test("yönetim metni müdürü de yetkili sayıyor", () => {
  const metin = yetkiYok("tema düzenleme");
  assert.match(metin, /müdür/);
  assert.match(metin, /^Tema düzenleme için/);
  /* Sıradaki adım söyleniyor: kullanıcı duvara çarpıp kalmamalı. */
  assert.match(metin, /mağaza sahibi yükseltebilir/);
});

test("sahiplik metni müdürün yapamayacağını açıkça söylüyor", () => {
  const metin = yetkiYok("iade işlemi", "sahiplik");
  assert.match(metin, /Müdür rolü bu işlemi yapamıyor/);
  assert.match(metin, /mağaza sahibinden isteyin/);
  assert.equal(metin.includes("veya müdür yetkisi"), false);
});

test("baş harf Türkçe yerelle büyütülüyor", () => {
  /* toUpperCase İngilizce'de i→I verir; "İade" yerine "Iade" yazardı. */
  assert.match(yetkiYok("iade işlemi", "sahiplik"), /^İade işlemi/);
  assert.match(yetkiYok("ürün düzenleme"), /^Ürün düzenleme/);
  assert.match(yetkiYok("stok hareketi"), /^Stok hareketi/);
});

test("boş iş adında da okunabilir bir cümle çıkıyor", () => {
  assert.match(yetkiYok(""), /^Bu işlem için/);
  assert.match(yetkiYok("   "), /^Bu işlem için/);
});

test("metin çerez sınırına sığıyor", () => {
  /* Bildirim çerezi 400 karakterde kırpılıyor (lib/panel-bildirim.ts). */
  for (const kapi of ["yonetim", "sahiplik"] as const) {
    assert.ok(yetkiYok("toplu durum değişikliği", kapi).length < 400);
  }
});
