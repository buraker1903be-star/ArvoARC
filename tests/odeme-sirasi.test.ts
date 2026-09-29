import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/*
  ÖDEME YÖNTEMİ DENETİMİ, SİPARİŞTEN ÖNCE GELMELİ.

  Sipariş önce oluşuyor, yöntemin kullanılabilirliği sonra
  denetleniyordu: havalesi kapalı ya da PayTR bilgisi girilmemiş bir
  mağazada müşteri her denemede arkasında bir sipariş bırakıp
  "kullanılamıyor" görüyordu. Yeni bir salonun varsayılan hâli tam
  olarak bu (havale kapalı, PayTR boş), yani kiracı daha ilk gününde
  sipariş listesi hiç ödenmeyecek "Bekliyor" kayıtlarıyla dolarken
  satış yapamıyordu.

  Bu sıra tiplerle ifade edilemiyor; kaynak üzerinden sabitleniyor.
  Test kırılırsa sorulacak şey "işaret nerede" değil, SİPARİŞİN HÂLÂ
  denetimden sonra oluşup oluşmadığı.
*/

const KAYNAK = fs.readFileSync(
  path.resolve(import.meta.dirname, "../src/app/api/storefront/odeme/route.ts"),
  "utf8",
);

const yeri = (isaret: string) => {
  const index = KAYNAK.indexOf(isaret);
  assert.notEqual(index, -1, `işaret kayboldu: ${isaret}`);
  return index;
};

test("sipariş, ödeme yöntemi denetlenmeden oluşturulmuyor", () => {
  const siparis = yeri('"arc_create_storefront_order"');
  assert.ok(yeri("transfer_disabled") < siparis, "havale denetimi siparişten sonra kalmış");
  assert.ok(yeri("storePaytrConfig(") < siparis, "PayTR denetimi siparişten sonra kalmış");
});

test("havale ayarı okunamazsa açık sayılmıyor", () => {
  /*
    "=== false" kontrolü undefined'ı geçiriyor; okuma hatası ayrı
    dönmezse havaleyi kapatmış mağazadan sipariş geçerdi.
  */
  assert.ok(yeri("transfer_unavailable") < yeri('"arc_create_storefront_order"'));
});

test("kart yolunda yapılandırma sessizce boş geçemiyor", () => {
  /* "as" ile susturmak, dallar değişirse müşteriyi boş ekrana yollardı. */
  assert.ok(!/paytrConfig as PaytrStoreConfig/.test(KAYNAK), "tip zorlaması geri gelmiş");
  assert.ok(/if \(!paytrConfig\)/.test(KAYNAK), "çalışma zamanı denetimi yok");
});
