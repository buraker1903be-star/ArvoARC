import assert from "node:assert/strict";
import test from "node:test";
import {
  EN_FAZLA_SATIR,
  gecerliFiyat,
  satirlariDogrula,
  saklananSatirlar,
  kaynaklarIcin,
  KAYNAK_ADI,
} from "@/lib/fiyat-toplayici";

/*
  Toplayıcıdan gelen veri TAMAMEN İSTEMCİ TARAFINDAN üretiliyor: LR'ın
  sayfasında çalışan bir betikten, kullanıcının tarayıcısından geliyor.
  Sayfa tasarımı değişince yanlış sütun okunabilir; bu yüzden sınırlar
  sunucuda ve liste doğrudan fiyat yazmıyor, panelde önizleniyor.
*/

test("sku ve fiyat metni kuruşa çevriliyor", () => {
  const { satirlar } = satirlariDogrula([{ sku: "20604-201", ad: "Aloe Vera Jel", fiyatlar: ["1.234,56"] }]);
  assert.deepEqual(satirlar, [{ sku: "20604-201", ad: "Aloe Vera Jel", fiyatlar: [123456] }]);
});

test("FİYAT METİN OLARAK geliyor; sayı yok sayılıyor", () => {
  /*
    Kuruşa çevirme kuralı (iki ayırıcı, binlik grubu) parseMoneyToCents'te
    tek yerde duruyor. Tarayıcıda çevirmek o kuralın ikinci bir kopyası
    demekti ve kopya sessizce eskir.
  */
  const { satirlar, atlanan } = satirlariDogrula([{ sku: "20604", fiyatlar: [34050] }]);
  assert.deepEqual(satirlar, []);
  assert.equal(atlanan, 1);
});

test("okunamayan satır ATLANMIŞ SAYILIYOR, sessizce düşmüyor", () => {
  const { satirlar, atlanan } = satirlariDogrula([
    { sku: "", fiyatlar: ["10,00"] },
    { sku: "20604", fiyatlar: [] },
    { sku: "20604", fiyatlar: ["okunamadı"] },
    { sku: "20605", fiyatlar: ["12,50"] },
  ]);
  assert.equal(satirlar.length, 1);
  assert.equal(atlanan, 3);
});

test("100.000 ₺ üstü değer fiyat sayılmıyor", () => {
  // Bu büyüklükte bir sayı fiyat değil, iki alanın birleşmesidir.
  const { satirlar } = satirlariDogrula([{ sku: "20604", fiyatlar: ["100.000,01", "349,90"] }]);
  assert.deepEqual(satirlar[0].fiyatlar, [34990]);
});

test("AYNI SKU iki kez geldiyse sonuncu kazanıyor", () => {
  /* Ürün öneri şeridinde kırpılmış, kendi kartında tam görünüyor. */
  const { satirlar } = satirlariDogrula([
    { sku: "20604-201", ad: "", fiyatlar: ["100,00"] },
    { sku: "20604-201", ad: "Aloe Vera Jel", fiyatlar: ["349,90"] },
  ]);
  assert.equal(satirlar.length, 1);
  assert.deepEqual(satirlar[0], { sku: "20604-201", ad: "Aloe Vera Jel", fiyatlar: [34990] });
});

test("satır sayısı sınırlanıyor ve kırpılan sayılıyor", () => {
  const cok = Array.from({ length: EN_FAZLA_SATIR + 5 }, (_, i) => ({ sku: `S${i}`, fiyatlar: ["10,00"] }));
  const { satirlar, atlanan } = satirlariDogrula(cok);
  assert.equal(satirlar.length, EN_FAZLA_SATIR);
  assert.equal(atlanan, 5);
});

test("dizi olmayan gövde boş sonuç veriyor", () => {
  assert.deepEqual(satirlariDogrula(null), { satirlar: [], atlanan: 0 });
  assert.deepEqual(satirlariDogrula({ sku: "20604" }), { satirlar: [], atlanan: 0 });
});

test("uzun ad ve boşluklar kırpılıyor", () => {
  const { satirlar } = satirlariDogrula([{ sku: "  20604-201  ", ad: `A${"b".repeat(400)}`, fiyatlar: ["1,00"] }]);
  assert.equal(satirlar[0].sku, "20604-201");
  assert.equal(satirlar[0].ad.length, 160);
});

test("KARTTA İKİ FİYAT VARSA geçerli olan (düşük) alınıyor", () => {
  /*
    LR kampanya yaptığında eski fiyat üstü çizili duruyor. Yükseği
    almak, LR'ın indirimini görmezden gelip müşteriye kampanyasız fiyat
    göstermek olurdu — indirimlerin vitrine yansıması bu işin sebebi.
  */
  assert.equal(gecerliFiyat([49900, 34990]), 34990);
  assert.equal(gecerliFiyat([34990]), 34990);
  assert.equal(gecerliFiyat([]), null);
});

/*
  'lr-genel' sunucunun günlük taraması ve GİRİŞSİZ okunuyor: tanım
  gereği müşteri fiyatı, hiçbir koşulda alış olamaz. Süzgeç yokken her
  gece 06:00'daki tarama uygulanmamış olarak duruyor ve "son toplanan
  liste" birleştirmesine karışıyordu; kullanıcı girişli oturumda alış
  toplasa bile müşteri fiyatları cost_price'a yazılıyordu.
*/
test("alış YALNIZCA yer imiyle toplanandan gelir", () => {
  assert.deepEqual(kaynaklarIcin("alis"), ["lr"]);
  assert.ok(!kaynaklarIcin("alis").includes("lr-genel"));
});

test("müşteri geçişinde iki kaynak da geçerli", () => {
  // Kullanıcı çıkışlı sayfada yer imiyle de müşteri fiyatı toplayabilir.
  assert.deepEqual([...kaynaklarIcin("musteri")].sort(), ["lr", "lr-genel"]);
});

test("kaynak adları ekranda okunabilir", () => {
  assert.equal(KAYNAK_ADI.lr, "yer imi");
  assert.equal(KAYNAK_ADI["lr-genel"], "günlük tarama");
});

/*
  YAZ-OKU GİDİŞ DÖNÜŞÜ. Buradaki asıl kusur, aynı kuralın iki farklı işte
  kullanılmasıydı: gelen gövdeyi doğrulayan "fiyat metin olmalı" kuralı
  saklanan satıra da uygulanınca, yer imiyle toplanmış bütün satırlar
  okunurken sessizce düştü. Panelde geriye yalnızca cron'un metin
  saklayan müşteri fiyatları kaldı ve alış alanına onlar yazıldı.

  Bu yüzden yazma ve okuma bir arada sabitleniyor: her iki yolun yazdığı
  satır, okuyan tarafta aynen geri gelmeli.
*/
test("YER İMİ yolu: yazılan satır okunurken geri geliyor", () => {
  const gelen = [{ sku: "20328", ad: "Aloe Vera Jel", fiyatlar: ["487,10"] }];
  /* Uç, yazmadan önce doğruluyor ve KURUŞ SAYISI saklıyor. */
  const saklanan = satirlariDogrula(gelen).satirlar;
  assert.deepEqual(saklanan, [{ sku: "20328", ad: "Aloe Vera Jel", fiyatlar: [48710] }]);
  assert.deepEqual(saklananSatirlar(saklanan), saklanan);
});

test("SUNUCU TARAMASI yolu: metin saklayan ESKİ satırlar da okunuyor", () => {
  /*
    Cron eskiden sayfadaki metni olduğu gibi yazıyordu. Yeni kod kuruş
    yazıyor ama tablodaki eski satırlar duruyor; okuma ikisini de tanımalı.
  */
  assert.deepEqual(saklananSatirlar([{ sku: "20328", ad: "X", fiyatlar: ["487,10"] }]), [
    { sku: "20328", ad: "X", fiyatlar: [48710] },
  ]);
});

test("okuma da SINIRLARI uyguluyor: satır veritabanından geldi diye sınırsız değil", () => {
  assert.deepEqual(saklananSatirlar([{ sku: "20328", ad: "X", fiyatlar: [10_000_001, 48710] }]), [
    { sku: "20328", ad: "X", fiyatlar: [48710] },
  ]);
  assert.deepEqual(saklananSatirlar([{ sku: "20328", ad: "X", fiyatlar: [0, -5, 12.5] }]), []);
});

test("GELEN gövde hâlâ sayı kabul etmiyor; kural yalnızca okumada gevşedi", () => {
  /*
    İstemcinin kendi çevirdiği sayıya güvenmek, kuruşa çevirme kuralının
    ikinci bir kopyasını tarayıcıya koymak demekti ve kopya sessizce eskir.
  */
  assert.deepEqual(satirlariDogrula([{ sku: "20328", fiyatlar: [48710] }]).satirlar, []);
});
