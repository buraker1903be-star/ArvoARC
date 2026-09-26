import assert from "node:assert/strict";
import test from "node:test";
import { bolmeSorunu, kalanAdetler, kargoDurumu, otoDurumunuCevir } from "@/lib/kargo-bolme";

/*
  Bölünmüş kargo hesabı. Sınanan şey "toplama biliyor mu" değil: bir
  siparişin kalemleri farklı firmalara ayrılırken aynı adedin İKİ KEZ
  kargoya verilmemesi. İki kez verilirse müşteriye olmayan ürün için takip
  numarası gider, stok ve iade hesabı bozulur.
*/

const kalemler = [
  { id: "k1", quantity: 3, product_name: "Kupa" },
  { id: "k2", quantity: 1, product_name: "Tabak" },
];

const gonderi = (id: string, status: string, items: { order_item_id: string; quantity: number }[]) =>
  ({ id, status, items });

test("kalan adet · kargoya verilen düşülüyor", () => {
  const kalan = kalanAdetler(kalemler, [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 2 }])]);
  assert.equal(kalan.get("k1"), 1);
  assert.equal(kalan.get("k2"), 1, "dokunulmayan kalem tam kalmalı");
});

test("İPTAL edilen gönderinin kalemleri yeniden bölünebiliyor", () => {
  /*
    Yanlış firmaya verilip iptal edilen gönderi siparişi sonsuza kadar
    kilitlerdi; iptal sayıma girmiyor.
  */
  const kalan = kalanAdetler(kalemler, [
    gonderi("g1", "cancelled", [{ order_item_id: "k1", quantity: 3 }]),
    gonderi("g2", "delivered", [{ order_item_id: "k1", quantity: 1 }]),
  ]);
  assert.equal(kalan.get("k1"), 2);
});

test("siparişte olmayan kalem hesabı durdurmuyor", () => {
  // Veri bozulmuşsa görünen kalemler üzerinden devam edilir.
  const kalan = kalanAdetler(kalemler, [gonderi("g1", "created", [{ order_item_id: "silinmis", quantity: 5 }])]);
  assert.deepEqual([...kalan.entries()], [["k1", 3], ["k2", 1]]);
});

test("boş seçim reddediliyor", () => {
  assert.equal(bolmeSorunu({}, kalemler, []), "Gönderiye en az bir ürün ekleyin.");
  assert.equal(bolmeSorunu({ k1: 0 }, kalemler, []), "Gönderiye en az bir ürün ekleyin.");
});

test("KALANI AŞAN seçim, kaç adet kaldığını söyleyerek reddediliyor", () => {
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 2 }])];
  assert.equal(
    bolmeSorunu({ k1: 2 }, kalemler, mevcut),
    "Kupa: kargoya verilebilecek 1 adet kaldı, 2 seçildi.",
  );
});

test("tamamı kargoya verilmiş kalem ayrı mesaj veriyor", () => {
  // "0 adet kaldı, 1 seçildi" demek kullanıcıya bir şey anlatmıyor.
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k2", quantity: 1 }])];
  assert.equal(bolmeSorunu({ k2: 1 }, kalemler, mevcut), "Tabak: bu ürünün tamamı kargoya verilmiş.");
});

test("geçerli seçim sorunsuz", () => {
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 1 }])];
  assert.equal(bolmeSorunu({ k1: 2, k2: 1 }, kalemler, mevcut), null);
});

test("kesirli adet reddediliyor", () => {
  assert.equal(bolmeSorunu({ k1: 1.5 }, kalemler, []), "Kupa: adet tam sayı olmalı.");
});

test("kargo durumu gönderilerden türüyor", () => {
  assert.equal(kargoDurumu(kalemler, []), "yok");
  assert.equal(kargoDurumu(kalemler, [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 3 }])]), "kismi");
  assert.equal(
    kargoDurumu(kalemler, [
      gonderi("g1", "created", [{ order_item_id: "k1", quantity: 3 }]),
      gonderi("g2", "delivered", [{ order_item_id: "k2", quantity: 1 }]),
    ]),
    "tamam",
  );
});

test("hepsi iptal edilmiş sipariş yeniden 'yok' oluyor", () => {
  const iptalli = [gonderi("g1", "cancelled", [{ order_item_id: "k1", quantity: 3 }, { order_item_id: "k2", quantity: 1 }])];
  assert.equal(kargoDurumu(kalemler, iptalli), "yok");
});

test("OTO durumu çevriliyor, BİLİNMEYEN 'yolda' sayılıyor", () => {
  /*
    OTO yeni bir adım eklediğinde gönderi "taslak"a düşüp kullanıcıyı
    yeniden oluşturmaya itmemeli; bilinmeyen adım yolda kabul ediliyor.
  */
  assert.equal(otoDurumunuCevir("pickedUp"), "picked_up");
  assert.equal(otoDurumunuCevir("outForDelivery"), "in_transit");
  assert.equal(otoDurumunuCevir("delivered"), "delivered");
  assert.equal(otoDurumunuCevir("sortingAtHub"), "in_transit", "bilinmeyen adım");
  assert.equal(otoDurumunuCevir(null), "created", "durum gelmediyse oluşturuldu");
});
