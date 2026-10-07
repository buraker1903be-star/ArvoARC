import assert from "node:assert/strict";
import test from "node:test";
import { formAlanlari, taksitAlani, tutarAlani, TRY_KODU } from "@/lib/odeme/garanti/istek";
import { formHash, type GarantiKimligi } from "@/lib/odeme/garanti/imza";

const KIMLIK: GarantiKimligi = {
  isyeriNo: "7654321",
  terminalNo: "30691297",
  provizyonSifresi: "PROVSIFRE123",
  iadeSifresi: "IADESIFRE",
  magazaAnahtari: "12345678",
  surum: "v512",
};

const GIRDI = {
  siparisNo: "SIP-000042",
  tutarKurus: 12345,
  basariAdresi: "https://ornek.test/ok",
  hataAdresi: "https://ornek.test/hata",
  musteriEposta: "musteri@ornek.test",
  musteriIp: "1.2.3.4",
  isyeriAdi: "ArvoCulture",
};

test("tutar kuruş olarak, ayıraçsız gidiyor", () => {
  // Ondalık ayıraç koymak tutarı yüz katına çıkarırdı.
  assert.equal(tutarAlani(12345), "12345");
  assert.equal(tutarAlani(100), "100");
  assert.equal(tutarAlani(0), "0");
});

test("tek çekimde taksit alanı BOŞ, '0' değil", () => {
  /* Alan hash'e de giriyor: "0" yazmak hem taksidi hem imzayı
     değiştirir. */
  assert.equal(taksitAlani(null), "");
  assert.equal(taksitAlani(0), "");
  assert.equal(taksitAlani(1), "");
  assert.equal(taksitAlani(6), "6");
});

test("form alanları eksiksiz ve imzalı", () => {
  const alanlar = formAlanlari(KIMLIK, "3D_PAY_HOSTING", true, GIRDI)!;
  assert.ok(alanlar, "alanlar üretilmeli");
  for (const ad of [
    "terminalid", "orderid", "txnamount", "txncurrencycode", "successurl", "errorurl",
    "txntype", "txninstallmentcount", "apiversion", "mode", "terminalprovuserid",
    "terminaluserid", "terminalmerchantid", "secure3dsecuritylevel", "secure3dhash",
  ]) {
    assert.ok(ad in alanlar, `${ad} alanı eksik`);
  }
  assert.equal(alanlar.txncurrencycode, TRY_KODU);
  assert.equal(alanlar.txntype, "sales");
  assert.equal(alanlar.mode, "TEST");
  assert.equal(alanlar.secure3dsecuritylevel, "3D_PAY_HOSTING");
});

test("imza TAM OLARAK forma giden alanlardan üretiliyor", () => {
  /* Hash'i ayrı bir değer kümesinden üretmek, forma gidenle imzalanan
     arasında sessiz bir fark bırakırdı; banka bunu "hash hatalı" diye
     döner ve hangi alanın ayrıştığını söylemez. */
  const alanlar = formAlanlari(KIMLIK, "3D_PAY_HOSTING", false, GIRDI)!;
  const beklenen = formHash(KIMLIK, {
    terminalid: alanlar.terminalid,
    orderid: alanlar.orderid,
    txnamount: alanlar.txnamount,
    txncurrencycode: alanlar.txncurrencycode,
    successurl: alanlar.successurl,
    errorurl: alanlar.errorurl,
    txntype: alanlar.txntype,
    txninstallmentcount: alanlar.txninstallmentcount,
  });
  assert.equal(alanlar.secure3dhash, beklenen);
});

test("apiversion hash sürümüyle AYNI karardan geliyor", () => {
  // "512" yazıp SHA1 imzalamak bankanın tek satırlık hatasına çıkar.
  assert.equal(formAlanlari(KIMLIK, "3D", true, GIRDI)!.apiversion, "512");
  assert.equal(formAlanlari({ ...KIMLIK, surum: "v0.01" }, "3D", true, GIRDI)!.apiversion, "v0.01");
});

test("canlı modda mode PROD", () => {
  assert.equal(formAlanlari(KIMLIK, "3D", false, GIRDI)!.mode, "PROD");
});

test("provizyon şifresi yoksa form üretilmiyor", () => {
  /* Eksik imzayla form göndermek, müşteriyi bankanın anlaşılmaz hata
     ekranına düşürmek demek; kart seçeneği hiç açılmamalı. */
  assert.equal(formAlanlari({ ...KIMLIK, provizyonSifresi: "" }, "3D", true, GIRDI), null);
});
