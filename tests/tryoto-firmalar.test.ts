import assert from "node:assert/strict";
import test from "node:test";
import { firmalariCozumle } from "@/lib/tryoto/firmalar";

/*
  dcList'in yanıt şekli belgelenmemiş. Sınanan şey "doğru şekli biliyoruz"
  değil: tanınmayan bir şekilde SESSİZCE boş liste dönmek yerine çağıranın
  ham gövdeyi gösterebilmesi. Boş liste "hiç firma yok" diye okunur ve
  kullanıcı entegrasyonun çalışmadığını sanır.
*/

const yurtici = { deliveryCompanyName: "Yurtiçi Kargo", deliveryCompanyCode: "YK", isActive: true };

test("bilinen sarmalayıcılar çözülüyor", () => {
  for (const govde of [
    { deliveryCompanyList: [yurtici] },
    { deliveryCompanies: [yurtici] },
    { dcList: [yurtici] },
    { data: [yurtici] },
    [yurtici],
  ]) {
    const firmalar = firmalariCozumle(govde);
    assert.equal(firmalar.length, 1, `çözülemedi: ${JSON.stringify(govde).slice(0, 40)}`);
    assert.equal(firmalar[0].ad, "Yurtiçi Kargo");
    assert.equal(firmalar[0].kod, "YK");
    assert.equal(firmalar[0].etkin, true);
  }
});

test("farklı alan adları da okunuyor", () => {
  assert.deepEqual(firmalariCozumle([{ name: "Aras Kargo", code: "ARAS" }]), [
    { kod: "ARAS", ad: "Aras Kargo", etkin: null },
  ]);
  assert.deepEqual(firmalariCozumle([{ dcName: "MNG", dcCode: 7 }]), [{ kod: "7", ad: "MNG", etkin: null }]);
});

test("kod yoksa ad kod yerine geçiyor", () => {
  // Liste hiç olmamasından iyidir; seçim yine yapılabilir.
  assert.deepEqual(firmalariCozumle([{ name: "Sürat Kargo" }]), [
    { kod: "Sürat Kargo", ad: "Sürat Kargo", etkin: null },
  ]);
});

test("etkinlik metin olarak da anlaşılıyor", () => {
  assert.equal(firmalariCozumle([{ name: "A", code: "a", status: "active" }])[0].etkin, true);
  assert.equal(firmalariCozumle([{ name: "B", code: "b", status: "passive" }])[0].etkin, false);
  assert.equal(firmalariCozumle([{ name: "C", code: "c", enabled: false }])[0].etkin, false);
});

test("TANINMAYAN şekil boş dönüyor, uydurmuyor", () => {
  /*
    Boş liste çağıran için bir işarettir: ham gövdeyi göstermeye geçer.
    Uydurulmuş bir firma adı, seçilince gönderiyi düşürürdü.
  */
  assert.deepEqual(firmalariCozumle({ beklenmeyen: { sekil: 1 } }), []);
  assert.deepEqual(firmalariCozumle("düz metin"), []);
  assert.deepEqual(firmalariCozumle(null), []);
  assert.deepEqual(firmalariCozumle([{ tanimsiz: true }]), [], "adı olmayan satır atlanıyor");
});

test("aynı firma iki kez listelenmiyor, sıralama Türkçe", () => {
  const firmalar = firmalariCozumle([
    { name: "Yurtiçi", code: "YK" },
    { name: "Yurtiçi Kargo", code: "YK" },
    { name: "Çağrı Kargo", code: "CGR" },
    { name: "Aras", code: "ARAS" },
  ]);
  assert.deepEqual(firmalar.map((f) => f.ad), ["Aras", "Çağrı Kargo", "Yurtiçi"]);
});
