import assert from "node:assert/strict";
import test from "node:test";
import { fiyatSorgusuGovdesi, secenekleriCozumle } from "@/lib/tryoto/fiyat";

/*
  Teslimat seçenekleri. Gönderi oluştururken kullanılabilir firmalar
  buradan geliyor (dcList değil — o ücretsiz pakette kapalı). Sınanan şey
  kimliksiz seçeneğin listeye girmemesi: createShipment deliveryOptionId
  istiyor ve kimliksiz satır seçilince gönderi oluşturulamaz.
*/

const yanit = {
  success: true,
  deliveryCompany: [
    { deliveryOptionId: "opt-2", deliveryCompanyName: "Sürat Kargo", price: 84.9, serviceType: "standard", codCharge: 5 },
    { deliveryOptionId: "opt-1", deliveryCompanyName: "Yurtiçi Kargo", price: 79.5, serviceType: "standard" },
  ],
};

test("seçenekler okunuyor ve fiyat KURUŞA çevriliyor", () => {
  const secenekler = secenekleriCozumle(yanit);
  assert.equal(secenekler.length, 2);
  assert.equal(secenekler[0].ucretKurus, 7950, "ArvoARC parayı kuruş tutuyor");
  assert.equal(secenekler[1].kapidaOdemeKurus, 500);
});

test("UCUZDAN pahalıya sıralanıyor", () => {
  // Operasyoncu genelde en ucuzu seçiyor; listeyi taramak zorunda kalmamalı.
  assert.deepEqual(secenekleriCozumle(yanit).map((s) => s.firmaAdi), ["Yurtiçi Kargo", "Sürat Kargo"]);
});

test("fiyatı bilinmeyen seçenek SONDA, listeden atılmıyor", () => {
  // Fiyatsız da olsa seçilebilir olmalı; atmak seçeneği gizlemek olurdu.
  const secenekler = secenekleriCozumle({
    deliveryCompany: [{ deliveryOptionId: "a", name: "Fiyatsız" }, ...yanit.deliveryCompany],
  });
  assert.equal(secenekler.at(-1)!.firmaAdi, "Fiyatsız");
  assert.equal(secenekler.at(-1)!.ucretKurus, null);
});

test("KİMLİKSİZ seçenek listeye girmiyor", () => {
  /*
    createShipment deliveryOptionId istiyor; kimliksiz satır seçilince
    gönderi oluşturulamaz ve kullanıcı sebebini anlamaz.
  */
  assert.deepEqual(secenekleriCozumle({ deliveryCompany: [{ deliveryCompanyName: "Kimliksiz" }] }), []);
});

test("aynı seçenek iki kez listelenmiyor", () => {
  const secenekler = secenekleriCozumle({
    deliveryCompany: [
      { deliveryOptionId: "x", name: "A", price: 10 },
      { deliveryOptionId: "x", name: "A tekrar", price: 10 },
    ],
  });
  assert.equal(secenekler.length, 1);
});

test("tanınmayan gövde boş dönüyor", () => {
  assert.deepEqual(secenekleriCozumle({ beklenmeyen: 1 }), []);
  assert.deepEqual(secenekleriCozumle(null), []);
});

test("sorgu gövdesi: ağırlık bilinmiyorsa 1 kg", () => {
  /*
    Sıfır ağırlık OTO'da doğrulama hatası veriyor ve fiyat hiç gelmiyor;
    1 kg en küçük gerçekçi paket ve seçenekleri görmeyi sağlıyor.
  */
  const govde = fiyatSorgusuGovdesi({ cikisSehri: "Bursa", varisSehri: "İstanbul", agirlikKg: 0 });
  assert.equal(govde.weight, 1);
  assert.equal(govde.originCity, "Bursa");
  assert.equal("totalDue" in govde, false, "ödenmiş siparişte kapıda tahsilat gönderilmiyor");
});

test("kapıda tahsilat kuruştan ondalığa çevriliyor", () => {
  const govde = fiyatSorgusuGovdesi({ cikisSehri: "A", varisSehri: "B", agirlikKg: 2, kapidaTahsilatKurus: 25100 });
  assert.equal(govde.totalDue, 251);
  assert.equal(govde.weight, 2);
});
