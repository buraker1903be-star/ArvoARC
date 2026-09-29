import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { pgAuthToken, securityHash } from "@/lib/odeme/tami/imza";
import { kurusuTutara, odemeSayfasiAdresi, siparisNoGecerliMi, tamiTelefonu, tokenIstegi } from "@/lib/odeme/tami/istek";
import { odemeSonucu } from "@/lib/odeme/tami/yanit";

/*
  TAMİ ORTAK ÖDEME SAYFASI. Para tarafı: yanlış imza ödemeyi hiç
  başlatmaz, yanlış doğrulama ise ÖDENMEMİŞ siparişi ödenmiş gösterir —
  ikincisi çok daha pahalı.
*/

const JWK = { kid: "kid-1", k: Buffer.from("terminale-ozel-anahtar").toString("base64url") };

test("PG-Auth-Token merchant:terminal:base64(sha256) biçiminde", () => {
  const jeton = pgAuthToken({ merchantNumber: "1000", terminalNumber: "20", secretKey: "sir" });
  const [merchant, terminal, ozet] = jeton.split(":");
  assert.equal(merchant, "1000");
  assert.equal(terminal, "20");
  /* Sıradan base64 (base64url değil): Tami'nin örneği printBase64Binary. */
  assert.match(ozet, /^[A-Za-z0-9+/]+=*$/);
});

test("securityHash üç parçalı JWS; başlık HS512 ve kid taşıyor", () => {
  const imza = securityHash({ orderId: "abc", amount: 10 }, JWK);
  const [baslik, yuk, mac] = imza.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(baslik, "base64url").toString()), { alg: "HS512", typ: "JWT", kid: "kid-1" });
  assert.deepEqual(JSON.parse(Buffer.from(yuk, "base64url").toString()), { orderId: "abc", amount: 10 });
  const beklenen = createHmac("sha512", Buffer.from(JWK.k, "base64url")).update(`${baslik}.${yuk}`).digest("base64url");
  assert.equal(mac, beklenen);
});

test("securityHash İMZALANIRKEN kendi alanı gövdeden çıkarılıyor", () => {
  /* Belgede açıkça yazıyor; unutulursa imza hiçbir zaman tutmaz. */
  const a = securityHash({ orderId: "abc" }, JWK);
  const b = securityHash({ orderId: "abc", securityHash: "eski-deger" }, JWK);
  assert.equal(a, b);
});

test("SİPARİŞ NUMARASI kalıbı: uuid geçiyor, bizim sipariş numaralarımız geçmiyor", () => {
  assert.equal(siparisNoGecerliMi("043cbe09-4cb5-4214-9016-d35525f8311b"), true, "ödeme kaydının uuid'si");
  assert.equal(siparisNoGecerliMi("SPR#1018"), false, "# kabul edilmiyor");
  assert.equal(siparisNoGecerliMi("a--b"), false, "ayırıcılar art arda gelemez");
  assert.equal(siparisNoGecerliMi("-abc"), false);
  assert.equal(siparisNoGecerliMi("a"), false, "en az iki karakter");
  assert.equal(siparisNoGecerliMi("a".repeat(37)), false, "en çok 36 karakter");
});

test("tutar kuruştan ondalığa çevriliyor", () => {
  assert.equal(kurusuTutara(1999), 19.99);
  assert.equal(kurusuTutara(100000), 1000);
  assert.throws(() => kurusuTutara(0));
  assert.throws(() => kurusuTutara(19.9));
});

test("telefon Masterpass biçimine (905…) çevriliyor", () => {
  assert.equal(tamiTelefonu("0532 123 45 67"), "905321234567");
  assert.equal(tamiTelefonu("5321234567"), "905321234567");
  assert.equal(tamiTelefonu("+90 532 123 45 67"), "905321234567");
  /* Çevrilemeyen numara uydurulmuyor: müşteri doğrulama kodunu alamaz. */
  assert.equal(tamiTelefonu("212 123 45 67"), null);
  assert.equal(tamiTelefonu(""), null);
});

test("token isteği tam ve doğru biçimde", () => {
  const istek = tokenIstegi({
    odemeKimligi: "043cbe09-4cb5-4214-9016-d35525f8311b",
    tutarKurus: 194590,
    telefon: "0532 123 45 67",
    donusAdresi: "https://arvoculture.com/odeme/donus",
  });
  assert.deepEqual(istek, {
    amount: 1945.9,
    orderId: "043cbe09-4cb5-4214-9016-d35525f8311b",
    successCallbackUrl: "https://arvoculture.com/odeme/donus",
    failCallbackUrl: "https://arvoculture.com/odeme/donus",
    mobilePhoneNumber: "905321234567",
  });
});

test("ödeme sayfası adresi jetonu kaçışlıyor", () => {
  const adres = odemeSayfasiAdresi("https://portal.tami.com.tr/hostedPaymentPage", "8wz8+KL/jrDI=");
  assert.equal(adres, "https://portal.tami.com.tr/hostedPaymentPage?token=8wz8%2BKL%2FjrDI%3D");
});

test("ÖDENDİ yalnızca SUCCESS + AUTH + tutar eşitken", () => {
  const sonuc = odemeSonucu(
    { success: true, PaymentStatus: "SUCCESS", orderStatus: "AUTH", amount: 1945.9, installmentCount: 1, bankAuthCode: "123456" },
    194590,
  );
  assert.equal(sonuc.durum, "odendi");
  assert.equal(sonuc.tutarKurus, 194590);
  assert.equal(sonuc.bankaOnayKodu, "123456");
});

test("TUTAR TUTMUYORSA ödendi denmiyor", () => {
  /*
    Sorgu cevabındaki amount "işlem yapılabilir tutar": kısmi iade
    sonrası düşüyor. Denetlenmezse iade edilmiş bir sipariş yeniden
    ödenmiş sayılırdı.
  */
  const sonuc = odemeSonucu({ success: true, PaymentStatus: "SUCCESS", orderStatus: "AUTH", amount: 1600 }, 194590);
  assert.equal(sonuc.durum, "basarisiz");
  assert.match(sonuc.hata ?? "", /Tutar uyuşmuyor/);
});

test("İADE EDİLMİŞ sipariş ödendi sayılmıyor", () => {
  for (const durum of ["REFUND", "PARTIAL_REFUND", "REVERSE", "PRE_AUTH"]) {
    const sonuc = odemeSonucu({ success: true, PaymentStatus: "SUCCESS", orderStatus: durum, amount: 1945.9 }, 194590);
    assert.notEqual(sonuc.durum, "odendi", durum);
  }
});

test("NOT_COMPLETE bekliyor; FAIL ve TIME_OUT başarısız", () => {
  assert.equal(odemeSonucu({ success: true, PaymentStatus: "NOT_COMPLETE", orderStatus: "" }, 100).durum, "bekliyor");
  assert.equal(odemeSonucu({ success: true, PaymentStatus: "FAIL" }, 100).durum, "basarisiz");
  assert.equal(odemeSonucu({ success: true, PaymentStatus: "TIME_OUT" }, 100).durum, "basarisiz");
  /* Küçük harfli yazım da okunuyor; tek yazıma güvenmek ödemeyi
     sessizce "bekliyor"da bırakırdı. */
  assert.equal(odemeSonucu({ success: true, paymentStatus: "SUCCESS", orderStatus: "AUTH", amount: 1 }, 100).durum, "odendi");
});

test("sorgulama başarısızsa hata metni taşınıyor", () => {
  const sonuc = odemeSonucu({ success: false, errorCode: "1001", errorMessage: "İşlem bulunamadı" }, 100);
  assert.equal(sonuc.durum, "basarisiz");
  assert.equal(sonuc.hata, "İşlem bulunamadı");
});
