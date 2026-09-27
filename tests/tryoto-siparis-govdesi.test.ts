import assert from "node:assert/strict";
import test from "node:test";
import { createOrderGovdesi, govdeSorunu, type GovdeGirdisi } from "@/lib/tryoto/siparis-govdesi";

/*
  createOrder gövdesi. Sınananlar, yanlış olursa PARA ya da TESLİMAT
  hatasına yol açan noktalar: kuruş→ondalık dönüşümü, ödenmiş siparişte
  kapıda tahsilatın sıfırlanması ve gönderici bilgisinin iki biçiminin
  birlikte gönderilmemesi.
*/

const temel: GovdeGirdisi = {
  siparisNo: "AC-1042",
  sira: 1,
  paraBirimi: "TRY",
  musteri: { ad: "Ayşe Yılmaz", telefon: "5551112233", adres: "Bağdat Cad. 1", sehir: "İstanbul" },
  kalemler: [{ ad: "Kupa", sku: "KUPA-1", adet: 2, birimFiyatKurus: 12550, toplamKurus: 25100 }],
  gondericiKodu: "depo-1",
};

test("kuruş ondalığa çevriliyor, kayıp yok", () => {
  const govde = createOrderGovdesi(temel);
  assert.equal(govde.amount, 251);
  assert.deepEqual((govde.items as Array<Record<string, unknown>>)[0].price, 125.5);
});

test("KAPIDA TAHSİLAT YOK: amount_due her zaman sıfır", () => {
  /*
    ArvoARC'ta iki ödeme yöntemi var: kart ve havale; ikisinde de parayı
    biz tahsil ediyoruz, kargocu değil. Ödenmemiş havale siparişini
    "kapıda ödeme" saymak, kargocunun müşteriden para istemesi demekti.
  */
  const govde = createOrderGovdesi(temel);
  assert.equal(govde.amount_due, 0);
  assert.equal(govde.payment_method, "paid");
  assert.equal(govde.amount, 251, "sipariş tutarı yine bildiriliyor (sigorta/beyan)");
});

test("orderId parça numarası taşıyor, parentOrderId sipariş numarası", () => {
  /*
    Bir ArvoARC siparişi birden çok OTO siparişi doğuruyor; numarayı
    olduğu gibi göndermek ikinci parçada "zaten var" hatası verirdi.
  */
  assert.equal(createOrderGovdesi({ ...temel, sira: 2 }).orderId, "AC-1042-2");
  assert.equal(createOrderGovdesi(temel).parentOrderId, "AC-1042");
});

test("gönderici KOD ve AÇIK BİLGİ birlikte gönderilmiyor", () => {
  // OTO ikisini birlikte kabul etmiyor; isteği tümden reddediyor.
  const kodlu = createOrderGovdesi({ ...temel, gonderici: { ad: "X", telefon: "1", adres: "Y", sehir: "Z" } });
  assert.equal(kodlu.pickupLocationCode, "depo-1");
  assert.equal(kodlu.senderInformation, undefined);

  const acik = createOrderGovdesi({ ...temel, gondericiKodu: null, gonderici: { ad: "Tarzyeri", telefon: "555", adres: "Depo 1", sehir: "Bursa" } });
  assert.equal(acik.pickupLocationCode, undefined);
  assert.equal((acik.senderInformation as Record<string, unknown>).senderCity, "Bursa");
});

test("ülke boşsa TR varsayılıyor", () => {
  // ArvoARC adreslerinde ülke sık sık boş kalıyor.
  assert.equal((createOrderGovdesi(temel).customer as Record<string, unknown>).country, "TR");
  const belirtilmis = createOrderGovdesi({ ...temel, musteri: { ...temel.musteri, ulke: "DE" } });
  assert.equal((belirtilmis.customer as Record<string, unknown>).country, "DE");
});

test("isteğe bağlı alanlar boşken gövdeye HİÇ konmuyor", () => {
  // Boş dize gönderilen alanlar OTO tarafında doğrulama hatası üretiyor.
  const govde = createOrderGovdesi(temel);
  const musteri = govde.customer as Record<string, unknown>;
  assert.equal("email" in musteri, false);
  assert.equal("postcode" in musteri, false);
  assert.equal("deliveryOptionId" in govde, false);
  assert.equal("packageWeight" in govde, false);
});

test("ağırlık ve teslimat seçeneği verilince gönderiliyor", () => {
  const govde = createOrderGovdesi({ ...temel, agirlikKg: 1.4, teslimatSecenegiId: "opt-9" });
  assert.equal(govde.packageWeight, 1.4);
  assert.equal(govde.deliveryOptionId, "opt-9");
});

test("eksik bilgi Türkçe ve alan adıyla söyleniyor", () => {
  // OTO'nun İngilizce hatasını beklemek yerine burada yakalanıyor.
  assert.equal(govdeSorunu(temel), null);
  assert.match(govdeSorunu({ ...temel, kalemler: [] })!, /en az bir ürün/);
  assert.match(govdeSorunu({ ...temel, musteri: { ...temel.musteri, telefon: " " } })!, /telefon/);
  // "şehri" aranıyor, "şehir" değil: mesajda ek almış hâli geçiyor ve
  // /şehir/ hiç eşleşmiyor (JS'nin /i bayrağı da bunu çözmez).
  assert.match(govdeSorunu({ ...temel, musteri: { ...temel.musteri, sehir: "" } })!, /şehri/);
  assert.match(govdeSorunu({ ...temel, gondericiKodu: null, gonderici: null })!, /gönderici konum kodu/);
});
