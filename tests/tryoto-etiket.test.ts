import assert from "node:assert/strict";
import test from "node:test";
import { etiketHazir, etiketiCozumle } from "@/lib/tryoto/etiket";

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
