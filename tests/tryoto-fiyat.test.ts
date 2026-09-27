import assert from "node:assert/strict";
import test from "node:test";
import { fiyatSorgusuGovdesi, hacimselAgirlik, secenekleriCozumle, sehriSadelestir } from "@/lib/tryoto/fiyat";

/*
  Teslimat seçenekleri. Gönderi oluştururken kullanılabilir firmalar
  buradan geliyor (dcList değil — o ücretsiz pakette kapalı). Sınanan şey
  kimliksiz seçeneğin listeye girmemesi: createShipment deliveryOptionId
  istiyor ve kimliksiz satır seçilince gönderi oluşturulamaz.
*/

const yanit = {
  success: true,
  deliveryCompany: [
    { deliveryOptionId: "opt-2", deliveryOptionName: "Sürat Kargo", deliveryCompanyName: "surat-marketplace", price: 84.9, serviceType: "standard", codCharge: 5, deliveryType: "pickupByCustomer" },
    { deliveryOptionId: "opt-1", deliveryOptionName: "Yurtiçi Kargo", price: 79.5, serviceType: "standard", deliveryType: "toCustomerDoorstep" },
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

test("OKUNABİLİR ad seçiliyor, kod gibi olan değil", () => {
  /*
    deliveryCompanyName kod gibi geliyor ("surat-marketplace") ve canlıda
    ekranda o görünüyordu; deliveryOptionName okunabilir olan.
  */
  assert.equal(secenekleriCozumle(yanit)[1].firmaAdi, "Sürat Kargo");
});

test("teslim türü çevriliyor: fiyat farkının başlıca sebebi", () => {
  // Aynı firma hem adrese teslim hem şubeden alım dönebiliyor ve
  // fiyatları farklı; ayrımı göstermemek karşılaştırmayı yanıltıyordu.
  const secenekler = secenekleriCozumle(yanit);
  assert.equal(secenekler[0].teslimTuru, "Adrese teslim");
  assert.equal(secenekler[1].teslimTuru, "Şubeden alım");
  assert.equal(secenekleriCozumle({ deliveryCompany: [{ deliveryOptionId: "x", name: "A", deliveryType: "bilinmeyen" }] })[0].teslimTuru, "bilinmeyen");
});

test("sorguda deliveryType FİLTRESİ YOK", () => {
  /*
    "toCustomerDoorstepOrPickupByCustomer" denendi ve seçenek sayısı
    1'den 0'a düştü: alan "hepsini getir" değil filtre ve hiçbir seçenek
    tam olarak o türde işaretli değil. Filtresiz sorgu her şeyi veriyor.
  */
  const govde = fiyatSorgusuGovdesi({ cikisSehri: "A", varisSehri: "B", agirlikKg: 1 });
  assert.equal("deliveryType" in govde, false);
  assert.equal(govde.includeEstimatedDates, true);
});

test("şehir adı sadeleştirme Türkçe harfleri Latin'e çeviriyor", () => {
  /*
    OTO'nun örnekleri Latin harfli ve şehir adı metin olarak
    eşleştiriliyor; ilk sorgu boş dönerse sadeleştirilmiş adla bir kez
    daha soruluyor.
  */
  assert.equal(sehriSadelestir("İstanbul"), "Istanbul");
  assert.equal(sehriSadelestir("Şanlıurfa"), "Sanliurfa");
  assert.equal(sehriSadelestir("Çanakkale"), "Canakkale");
  assert.equal(sehriSadelestir("Muğla"), "Mugla");
  assert.equal(sehriSadelestir("Ankara"), "Ankara", "değişmeyen ad aynen kalıyor");
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

test("PAKET ÖLÇÜLERİ sorguya giriyor, verilmezse varsayılan kutu", () => {
  /*
    Ölçüsüz sorgu canlıda hiç seçenek döndürmedi: OTO fiyatı gerçek
    ağırlıkla hacimsel ağırlığın büyüğünden hesaplıyor ve ölçü olmadan
    hacimseli bilemiyor. Doküman alanları "isteğe bağlı" sayıyor ama
    pratikte gerekli.
  */
  const varsayilan = fiyatSorgusuGovdesi({ cikisSehri: "A", varisSehri: "B", agirlikKg: 1 });
  assert.equal(varsayilan.width, 35);
  assert.equal(varsayilan.length, 30);
  assert.equal(varsayilan.height, 8);

  const ozel = fiyatSorgusuGovdesi({ cikisSehri: "A", varisSehri: "B", agirlikKg: 1, enCm: 50, boyCm: 40, yukseklikCm: 20 });
  assert.equal(ozel.width, 50);
  assert.equal(ozel.height, 20);
});

test("hacimsel ağırlık OTO panelindeki hesapla aynı", () => {
  // Panelde 35×30×8 için 2.80 gösteriliyor; bölen 3000.
  assert.equal(hacimselAgirlik(35, 30, 8), 2.8);
  assert.equal(hacimselAgirlik(0, 30, 8), 0, "eksik ölçüde hesap yok");
});
