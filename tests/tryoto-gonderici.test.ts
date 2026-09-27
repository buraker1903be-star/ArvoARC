import assert from "node:assert/strict";
import test from "node:test";
import { gondericiCoz, gondericiEksigi } from "@/lib/tryoto/gonderici";

/*
  Gönderici adresi. Bu modül 27.09.2026'da ilk gerçek etiket denemesinin
  düştüğü yer: konum kodu boşken adresin tek tek gönderilmesi vaat
  ediliyordu ama kurulmamıştı. Sınananlar, yanlış olursa PAKETİN YANLIŞ
  YERDEN toplanmasına yol açan noktalar.
*/

const tam = {
  legal_name: "Arvo Kültür Tic. Ltd. Şti.",
  store_name: "ArvoCulture",
  contact_phone: "5551112233",
  contact_email: "kargo@arvoculture.com",
  address_line: "Barbaros Mah. 1. Cad. No 4",
  address_district: "Ataşehir",
  address_city: "İstanbul",
  address_country: null,
};

test("yasal unvan mağaza adına tercih ediliyor", () => {
  // Etikette müşterinin gördüğü gönderici bu; faturadaki unvanla aynı olmalı.
  assert.equal(gondericiCoz(tam)?.ad, "Arvo Kültür Tic. Ltd. Şti.");
  assert.equal(gondericiCoz({ ...tam, legal_name: null })?.ad, "ArvoCulture");
});

test("ilçe adres satırının sonuna ekleniyor", () => {
  // senderInformation'da ilçe alanı yok; ilçesiz adres kurye için yetersiz.
  assert.equal(gondericiCoz(tam)?.adres, "Barbaros Mah. 1. Cad. No 4 Ataşehir");
  assert.equal(gondericiCoz({ ...tam, address_district: null })?.adres, "Barbaros Mah. 1. Cad. No 4");
});

test("ülke boşsa TR", () => {
  assert.equal(gondericiCoz(tam)?.ulke, "TR");
  assert.equal(gondericiCoz({ ...tam, address_country: "DE" })?.ulke, "DE");
});

test("zorunlu alan eksikse null dönüyor", () => {
  /*
    Eksik alanla gövde kurmak OTO'nun İngilizce hatasını beklemek olurdu;
    null dönmek hangi alanın eksik olduğunu Türkçe söylemeyi mümkün kılıyor.
  */
  assert.equal(gondericiCoz(null), null);
  assert.equal(gondericiCoz({ ...tam, contact_phone: "   " }), null);
  assert.equal(gondericiCoz({ ...tam, address_line: null }), null);
  assert.equal(gondericiCoz({ ...tam, address_city: "" }), null);
  assert.equal(gondericiCoz({ ...tam, legal_name: null, store_name: null }), null);
});

test("ilçe tek başına adres saymıyor", () => {
  // Yalnızca ilçe doluysa adres "Ataşehir" olurdu; kurye o adresi bulamaz.
  assert.equal(gondericiCoz({ ...tam, address_line: null }), null);
});

test("eksik alanın adı söyleniyor, sırayla", () => {
  assert.equal(gondericiEksigi(tam), null);
  assert.equal(gondericiEksigi({ ...tam, legal_name: null, store_name: null }), "gönderici adı");
  assert.equal(gondericiEksigi({ ...tam, contact_phone: null }), "telefon");
  assert.equal(gondericiEksigi({ ...tam, address_line: null }), "adres");
  assert.equal(gondericiEksigi({ ...tam, address_city: null }), "şehir");
  assert.equal(gondericiEksigi(null), "gönderici adı");
});

test("e-posta boşsa null, gövdeye hiç girmiyor", () => {
  assert.equal(gondericiCoz({ ...tam, contact_email: "  " })?.eposta, null);
});
