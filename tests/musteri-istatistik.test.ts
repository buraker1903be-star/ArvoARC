import assert from "node:assert/strict";
import test from "node:test";
import { musteriIstatistikleri } from "@/lib/musteri-istatistik";
import type { Customer } from "@/app/(panel)/musteriler/customer-data";

const AN = Date.parse("2026-10-16T12:00:00+03:00");
const gunOnce = (gun: number) => AN - gun * 86_400_000;

const musteri = (ek: Partial<Customer>): Customer => ({
  key: "a@example.com",
  name: "Ayşe Yılmaz",
  email: "a@example.com",
  orders: 1,
  paidOrders: 1,
  spent: 10_000,
  firstOrderAt: gunOnce(10),
  lastOrderAt: gunOnce(10),
  ...ek,
});

test("tekrar eden müşteri ÖDENMİŞ siparişe göre sayılıyor", () => {
  /* İptal edilen ikinci sipariş müşteriyi "tekrar eden" yapmaz. */
  const s = musteriIstatistikleri([
    musteri({ key: "1", orders: 2, paidOrders: 2 }),
    musteri({ key: "2", orders: 2, paidOrders: 1 }),
    musteri({ key: "3", orders: 1, paidOrders: 1 }),
  ], AN);
  assert.equal(s.tekrarEden, 1);
  assert.equal(s.tekrarOrani, 33);
  assert.equal(s.tekSiparis, 1, "yalnızca tek siparişi olan");
});

test("yeni müşteri İLK siparişe göre, değişim önceki 30 güne göre", () => {
  const s = musteriIstatistikleri([
    musteri({ key: "1", firstOrderAt: gunOnce(5) }),
    musteri({ key: "2", firstOrderAt: gunOnce(29) }),
    /* Önceki 30 gün: 31–60 arası. */
    musteri({ key: "3", firstOrderAt: gunOnce(45) }),
    musteri({ key: "4", firstOrderAt: gunOnce(200) }),
  ], AN);
  assert.equal(s.yeni, 2);
  assert.equal(s.yeniDegisim, 100, "önceki dönemde bir kişi vardı");
});

test("uzun süredir sipariş vermeyen müşteri ayrı sayılıyor", () => {
  const s = musteriIstatistikleri([
    musteri({ key: "1", lastOrderAt: gunOnce(121) }),
    musteri({ key: "2", lastOrderAt: gunOnce(119) }),
  ], AN);
  assert.equal(s.riskli, 1);
});

test("ciro yoğunlaşması: ilk beş müşterinin payı", () => {
  /*
    Tek bir müşteriye yaslanan ciro, o müşteri gittiğinde görünmeyen
    bir risk; oran bunu söylüyor.
  */
  const s = musteriIstatistikleri([
    musteri({ key: "1", spent: 90_000 }),
    musteri({ key: "2", spent: 10_000 }),
  ], AN);
  assert.equal(s.ilkBesPayi, 100, "iki müşteri varsa tamamı ilk beşte");
  assert.equal(s.musteriBasina, 50_000);
});

test("harcaması olmayan müşteri en çok harcayanlar listesinde yok", () => {
  const s = musteriIstatistikleri([
    musteri({ key: "1", name: "Ali", spent: 5_000 }),
    musteri({ key: "2", name: "Veli", spent: 0, paidOrders: 0 }),
  ], AN);
  assert.deepEqual(s.enCokHarcayan, [{ ad: "Ali", harcama: 5_000 }]);
});

test("müşteri yokken oranlar null, ortalama sıfır", () => {
  const s = musteriIstatistikleri([], AN);
  assert.equal(s.tekrarOrani, null);
  assert.equal(s.ilkBesPayi, null);
  assert.equal(s.musteriBasina, 0);
});
