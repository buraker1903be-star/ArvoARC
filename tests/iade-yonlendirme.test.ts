import assert from "node:assert/strict";
import test from "node:test";
import { iadeTedarikcileri, iadeYonu, type GonderiEslesme, type SiparisKalemiEslesme } from "@/lib/iade-yonlendirme";

/*
  İade yönlendirmesi. Yanlış olursa ürün YANLIŞ TEDARİKÇİYE gönderilir:
  Tarzyeri'nden gelen bir ürünü LR'a yollamak hem kaybolur hem alacak
  kaydı tutmaz.
*/

const kalemler: SiparisKalemiEslesme[] = [
  { id: "k1", sku: "TZ-100", tedarikci: "tarzyeri" },
  { id: "k2", sku: "LR-200", tedarikci: "LR Health And Beauty" },
  { id: "k3", sku: "OWN-1", tedarikci: null },
];

const gonderiler: GonderiEslesme[] = [
  { id: "g1", sequence: 1, status: "shipped", carrier_name: "Sürat Kargo", tracking_number: "111", kalemIdleri: ["k1"] },
  { id: "g2", sequence: 2, status: "delivered", carrier_name: "Yurtiçi Kargo", tracking_number: "222", kalemIdleri: ["k2", "k3"] },
];

test("ürün hangi tedarikçiye dönecek ve hangi paketten geldi", () => {
  const a = iadeYonu("TZ-100", kalemler, gonderiler);
  assert.equal(a.tedarikci, "tarzyeri");
  assert.deepEqual(a.paket, { sequence: 1, firma: "Sürat Kargo", takipNo: "111", status: "shipped" });

  const b = iadeYonu("LR-200", kalemler, gonderiler);
  assert.equal(b.tedarikci, "LR Health And Beauty");
  assert.equal(b.paket?.sequence, 2);
});

test("İPTAL EDİLEN gönderi sayılmıyor", () => {
  /*
    İptal edilen paket yola çıkmadı; ürün müşteriye ondan gitmedi.
    İptalden sonra yenisi açılmış olabilir ve iptaller elenmezse yanlış
    paket gösterilirdi.
  */
  const iptalli: GonderiEslesme[] = [
    { id: "g0", sequence: 1, status: "cancelled", carrier_name: "Aras Kargo", tracking_number: "000", kalemIdleri: ["k1"] },
    { id: "g1", sequence: 2, status: "shipped", carrier_name: "Sürat Kargo", tracking_number: "111", kalemIdleri: ["k1"] },
  ];
  assert.equal(iadeYonu("TZ-100", kalemler, iptalli).paket?.sequence, 2);
  assert.equal(iadeYonu("TZ-100", kalemler, iptalli).paket?.firma, "Sürat Kargo");
});

test("kendi ürünümüzde tedarikçi yok", () => {
  // Tedarikçisi olmayan ürün bize döner; uydurma bir ad gösterilmiyor.
  assert.equal(iadeYonu("OWN-1", kalemler, gonderiler).tedarikci, null);
});

test("kargoya verilmemiş ürünün paketi yok", () => {
  const k: SiparisKalemiEslesme[] = [{ id: "k9", sku: "YENI-1", tedarikci: "tarzyeri" }];
  const y = iadeYonu("YENI-1", k, gonderiler);
  assert.equal(y.tedarikci, "tarzyeri");
  assert.equal(y.paket, null, "henüz gönderilmemiş ürün için paket uydurulmuyor");
});

test("tanınmayan SKU boş dönüyor", () => {
  assert.deepEqual(iadeYonu("YOK", kalemler, gonderiler), { tedarikci: null, paket: null });
  assert.deepEqual(iadeYonu("  ", kalemler, gonderiler), { tedarikci: null, paket: null });
  assert.deepEqual(iadeYonu(null, kalemler, gonderiler), { tedarikci: null, paket: null });
});

test("iadedeki tedarikçiler tekrarsız ve sıralı", () => {
  /*
    İki tedarikçiden ürün içeren iade TEK paket olarak geri
    gönderilemez; bunu kalem kalem okumak yerine kartın tepesinde
    görmek gerekiyor.
  */
  const yonler = ["TZ-100", "LR-200", "OWN-1", "TZ-100"].map((s) => iadeYonu(s, kalemler, gonderiler));
  assert.deepEqual(iadeTedarikcileri(yonler), ["LR Health And Beauty", "tarzyeri"]);
});
