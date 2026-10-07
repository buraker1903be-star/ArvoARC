import assert from "node:assert/strict";
import test from "node:test";
import {
  donusHashiDogru,
  formHash,
  guvenlikVerisi,
  terminalDolgulu,
  type GarantiKimligi,
} from "@/lib/odeme/garanti/imza";

/*
  GARANTİ İMZALARI.

  Beklenen değerler BU KODLA ÜRETİLMEDİ: bankanın belgesindeki tarife
  (SHA1(şifre + 9 haneye soldan sıfırlanmış terminal), sonra ayıraçsız
  birleştirme) ayrıca Python ile hesaplandı ve buraya sabit yazıldı.
  Kendi çıktısını kendine doğrulatan bir test, alan sırası yanlış olsa
  bile yeşil kalırdı — ve banka hatada yalnızca "hash tutmadı" diyor,
  hangi alanın yanlış olduğunu söylemiyor.
*/

const KIMLIK: GarantiKimligi = {
  isyeriNo: "7654321",
  terminalNo: "30691297",
  provizyonSifresi: "PROVSIFRE123",
  iadeSifresi: "IADESIFRE",
  magazaAnahtari: "12345678",
  surum: "v512",
};

const ALANLAR = {
  terminalid: "30691297",
  orderid: "SIP-000042",
  txnamount: "12345",
  txncurrencycode: "949",
  successurl: "https://ornek.test/ok",
  errorurl: "https://ornek.test/hata",
  txntype: "sales",
  txninstallmentcount: "",
};

test("terminal no 9 haneye SOLDAN sıfırlanıyor", () => {
  // Tamamlamayı atlamak başka bir güvenlik verisi, dolayısıyla her
  // ödemede "hash hatalı" demek.
  assert.equal(terminalDolgulu("30691297"), "030691297");
  assert.equal(terminalDolgulu("123456789"), "123456789");
  assert.equal(terminalDolgulu("1"), "000000001");
});

test("güvenlik verisi sürümden bağımsız SHA1", () => {
  assert.equal(guvenlikVerisi(KIMLIK, "satis"), "A2403ACBF6BB44E005910F519C820A98664FF02A");
  // SHA512 sürümünde bile bu adım SHA1 kalıyor.
  assert.equal(guvenlikVerisi({ ...KIMLIK, surum: "v0.01" }, "satis"), "A2403ACBF6BB44E005910F519C820A98664FF02A");
});

test("iade PROVRFN şifresini kullanıyor, satış PROVAUT'u", () => {
  assert.equal(guvenlikVerisi(KIMLIK, "iade"), "31553F9D1D4DA17BE86E2616215F8F250A7C49F4");
  assert.notEqual(guvenlikVerisi(KIMLIK, "iade"), guvenlikVerisi(KIMLIK, "satis"));
});

test("iade şifresi girilmemişse null (boş şifreyle hash üretilmiyor)", () => {
  assert.equal(guvenlikVerisi({ ...KIMLIK, iadeSifresi: null }, "iade"), null);
  assert.notEqual(guvenlikVerisi({ ...KIMLIK, iadeSifresi: null }, "satis"), null);
});

test("v512 form hash'i — para birimi kodu HASH'E GİRER", () => {
  assert.equal(
    formHash(KIMLIK, ALANLAR),
    "23E58BF388FA0708EBBE173D51F313FE887A2AA4980F185BFF93355DC781F877"
      + "F95F9D131B0D1ACF84C2697DD81A9ED59C24A284AB6C414A88D77182C43400FD",
  );
});

test("v0.01 form hash'i — SHA1 ve para birimi kodu GİRMEZ", () => {
  assert.equal(formHash({ ...KIMLIK, surum: "v0.01" }, ALANLAR), "5EF964594BBD8E6F73DD0627D99061328539CA59");
});

test("para birimi değişince v512 hash'i değişir, v0.01 değişmez", () => {
  /* İki sürümün tek yapısal farkı bu alan; testin kendisi de ayrımı
     kanıtlasın, yoksa yanlış sürüm sessizce geçerdi. */
  const baska = { ...ALANLAR, txncurrencycode: "840" };
  assert.notEqual(formHash(KIMLIK, baska), formHash(KIMLIK, ALANLAR));
  assert.equal(
    formHash({ ...KIMLIK, surum: "v0.01" }, baska),
    formHash({ ...KIMLIK, surum: "v0.01" }, ALANLAR),
  );
});

test("alan sırası değişirse hash değişir", () => {
  // Sıra bankanın belgesinden; "hepsi içinde olsun yeter" değil.
  const tersi = formHash(KIMLIK, { ...ALANLAR, orderid: ALANLAR.txnamount, txnamount: ALANLAR.orderid });
  assert.notEqual(tersi, formHash(KIMLIK, ALANLAR));
});

const DONUS: Record<string, string> = {
  clientid: "1234",
  oid: "SIP-000042",
  AuthCode: "",
  procreturncode: "00",
  response: "Approved",
  mdstatus: "1",
  hashparams: "clientid:oid:AuthCode:procreturncode:response:mdstatus",
  hash: "02D24FA409A12C75B200932F910912E02C9A865715E00D63D5059FB023CBA7C6"
    + "52B92683AAE591D6EF6CF2E2FD72B82A88B56F467DBB8B956FF4A6CBB2C52F52",
};

test("dönüş hash'i bankanın bildirdiği alan sırasıyla doğrulanıyor", () => {
  assert.equal(donusHashiDogru(KIMLIK, DONUS), true);
});

test("tek alan oynatılınca dönüş reddediliyor", () => {
  // Asıl tehlike bu: tutarı ya da sonucu değiştirilmiş bir dönüşün
  // siparişi "ödendi" yapması.
  assert.equal(donusHashiDogru(KIMLIK, { ...DONUS, response: "Declined" }), false);
  assert.equal(donusHashiDogru(KIMLIK, { ...DONUS, mdstatus: "0" }), false);
});

test("başka mağaza anahtarıyla üretilmiş dönüş reddediliyor", () => {
  assert.equal(donusHashiDogru({ ...KIMLIK, magazaAnahtari: "87654321" }, DONUS), false);
});

test("hash ya da hashparams yoksa reddediliyor", () => {
  /* "Alan yoksa doğrulamayı atla" diyen bir sürüm, imzasız bir isteği
     geçerli sayardı — saldırganın yapacağı ilk şey o alanları silmek. */
  assert.equal(donusHashiDogru(KIMLIK, { ...DONUS, hash: "" }), false);
  assert.equal(donusHashiDogru(KIMLIK, { ...DONUS, hashparams: "" }), false);
  assert.equal(donusHashiDogru(KIMLIK, {}), false);
});

test("hashparams'ta adı geçen eksik alan BOŞ sayılıyor", () => {
  // AuthCode boş geliyor ve listede var; boş dizge olarak hash'e girmezse
  // başarılı ödemelerin dönüşü reddedilirdi.
  const { AuthCode: _yok, ...eksik } = DONUS;
  void _yok;
  assert.equal(donusHashiDogru(KIMLIK, eksik), true);
});
