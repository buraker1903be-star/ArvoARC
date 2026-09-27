import assert from "node:assert/strict";
import test from "node:test";
import { gonderiKimliginiOku } from "@/lib/tryoto/iptal";

/*
  OTO'da gönderi iptali. cancelShipment hem orderId hem shipmentId
  istiyor; shipmentId saklanmadığı için iptal anında orderStatus'tan
  okunuyor. Yanlış okumak, iptal edilmiş görünen bir gönderinin OTO'da
  canlı kalması demek — kurye alıma gelir, paket müşteriye gider.
*/

test("shipmentId okunuyor", () => {
  assert.equal(gonderiKimliginiOku({ shipmentId: "SH-9912", success: true }), "SH-9912");
  // Sayı olarak dönen kimlik de kabul ediliyor.
  assert.equal(gonderiKimliginiOku({ shipmentId: 9912 }), "9912");
  // Alan adının alt çizgili yazımı da görüldü.
  assert.equal(gonderiKimliginiOku({ shipment_id: "SH-1" }), "SH-1");
});

test("gönderi açılmamışsa null", () => {
  /*
    Sipariş OTO'da var ama createShipment hiç çalışmamış olabilir
    (27.09.2026'da tam bu oldu). O zaman iptal edilecek bir gönderi yok
    ve çağıran kaydı güvenle kapatabilir.
  */
  assert.equal(gonderiKimliginiOku({ orderId: "AC-1", status: "orderCreated" }), null);
  assert.equal(gonderiKimliginiOku({ shipmentId: "   " }), null);
});

test("tanınmayan gövde çökmüyor", () => {
  assert.equal(gonderiKimliginiOku(null), null);
  assert.equal(gonderiKimliginiOku("hata"), null);
});
