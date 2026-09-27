import assert from "node:assert/strict";
import test from "node:test";
import { durumOzeti, etiketHazir, etiketiCozumle, gonderiOzeti } from "@/lib/tryoto/etiket";

/*
  Etiket bilgisi. İki ayrı uç (print ve orderStatus) aynı alanları farklı
  adlarla döndürüyor; yanlış okumak ekranda "etiket yok" demek ya da daha
  kötüsü müşteriye BOŞ bir takip numarası göndermek anlamına geliyor.
*/

test("print yanıtı çözülüyor", () => {
  const bilgi = etiketiCozumle({
    printAWBURL: "https://oto.example/awb/1.pdf",
    trackingNumber: "1234567890",
    deliveryCompany: "Sürat Kargo",
    success: true,
  });
  assert.deepEqual(bilgi, { awbUrl: "https://oto.example/awb/1.pdf", takipNo: "1234567890", firma: "Sürat Kargo" });
});

test("orderStatus yanıtı da aynı alanlara düşüyor", () => {
  // Takip numarası burada dcTrackingNumber'da geliyor.
  const bilgi = etiketiCozumle({
    printAWBURL: "https://oto.example/awb/2.pdf",
    dcTrackingNumber: "987654",
    deliveryCompany: "Yurtiçi Kargo",
    status: "shipped",
  });
  assert.equal(bilgi.takipNo, "987654");
  assert.equal(bilgi.awbUrl, "https://oto.example/awb/2.pdf");
});

test("boş takip numarası null sayılıyor", () => {
  /*
    orderStatus örneğinde gönderi firmaya düşmeden dcTrackingNumber BOŞ
    METİN geliyor. Boş metni yazmak, müşteriye çalışmayan bir takip
    bağlantısı göndermek olurdu.
  */
  assert.equal(etiketiCozumle({ dcTrackingNumber: "", trackingNumber: "   " }).takipNo, null);
});

test("sayı gelen alan metne çevriliyor", () => {
  // Takip numarası bazı firmalarda sayı olarak dönüyor.
  assert.equal(etiketiCozumle({ trackingNumber: 1234567890 }).takipNo, "1234567890");
});

test("tanınmayan gövde çökmüyor", () => {
  assert.deepEqual(etiketiCozumle(null), { awbUrl: null, takipNo: null, firma: null });
  assert.deepEqual(etiketiCozumle("hata"), { awbUrl: null, takipNo: null, firma: null });
  assert.deepEqual(etiketiCozumle([]), { awbUrl: null, takipNo: null, firma: null });
});

test("etiket ancak AWB adresi varsa hazır", () => {
  /*
    Takip numarası gelmiş olması etiketin üretildiği anlamına gelmiyor:
    yazdırılacak belge AWB adresinde. İkisini karıştırmak, kullanıcıya
    "etiketi yazdır" düğmesi gösterip boş sayfa açmak olurdu.
  */
  assert.equal(etiketHazir({ awbUrl: null, takipNo: "123", firma: "Aras" }), false);
  assert.equal(etiketHazir({ awbUrl: "https://a/b.pdf", takipNo: null, firma: null }), true);
  assert.equal(etiketHazir(null), false);
});

test("orderStatus özeti DURUMU söylüyor", () => {
  /*
    Etiket gelmediğinde ekranda "etiket adresi boş" yazıyordu ve yanıtın
    en bilgilendirici alanı — gönderinin OTO'daki durumu — hiç
    görünmüyordu; teşhis iki tur boyunca kayboldu.
  */
  assert.equal(
    durumOzeti({ status: "orderCreated", shipmentId: "S-1", deliveryCompany: "Sürat Kargo" }),
    "durum=orderCreated, gönderi=S-1, firma=Sürat Kargo",
  );
  assert.equal(durumOzeti({ status: "shipmentCreated" }), "durum=shipmentCreated");
  assert.equal(durumOzeti({ success: true }), null);
  assert.equal(durumOzeti(null), null);
});

test("shipmentTransactions özeti gönderinin VAR OLUP OLMADIĞINI söylüyor", () => {
  /*
    createShipment "başarılı" dönüp gönderi yine oluşmayabiliyor; kargo
    firması reddederse OTO bunu kendi hata kütüğüne yazıyor ve API'de
    hiçbir şey görünmüyor. Boş liste, beklemenin sonuçsuz olduğunu söyler.
  */
  assert.match(gonderiOzeti({ success: true, shipments: [] })!, /gönderi kaydı YOK/);
  // Alan adı OTO belgesinde "shipmentNumnber" diye yazılı; iki yazım da okunuyor.
  assert.equal(
    gonderiOzeti({ shipments: [{ shipmentNumnber: "123", status: "created", deliveryCompanyName: "Aras" }] }),
    "no=123, durum=created, firma=Aras",
  );
  assert.equal(gonderiOzeti({ shipments: [{ shipmentNumber: "9" }, { shipmentNumber: "10" }] }), "no=9 | no=10");
  // Liste hiç yoksa bu uç bir şey söylemiyor; "yok" demek yanlış olurdu.
  assert.equal(gonderiOzeti({ success: true }), null);
});
