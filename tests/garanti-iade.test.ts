import assert from "node:assert/strict";
import test from "node:test";
import { iadeCevabiniCoz, iadeHash, iadeXml } from "@/lib/odeme/garanti/iade-istegi";
import { guvenlikVerisi, type GarantiKimligi } from "@/lib/odeme/garanti/imza";

const KIMLIK: GarantiKimligi = {
  isyeriNo: "7654321",
  terminalNo: "30691297",
  provizyonSifresi: "PROVSIFRE123",
  iadeSifresi: "IADESIFRE",
  magazaAnahtari: "12345678",
  surum: "v512",
};

/* Beklenen değerler bu kodla değil, tarifeden Python ile hesaplandı. */
test("iade hash'i — kart numarasının yeri BOŞ ama hash'te var", () => {
  assert.equal(
    iadeHash(KIMLIK, "SIP-000042", 5000),
    "5F04E946B45215F0FAA84F934C284C7681A728ECA1221947B38BE4EA72A0DE66"
      + "F4C754E39479AA3279DE7FD8635ABBC2EB4CE8F2D0325644F9CC90B4A06307F1",
  );
  assert.equal(iadeHash({ ...KIMLIK, surum: "v0.01" }, "SIP-000042", 5000), "91431932C8B2EB9783DF80258A5CEDDA7EA6BD5A");
});

test("iade hash'i PROVAUT'un değil PROVRFN'in şifresinden üretiliyor", () => {
  // PROVAUT ile iade denemek bankadan yetki hatası döndürür.
  const provaut = guvenlikVerisi(KIMLIK, "satis");
  const provrfn = guvenlikVerisi(KIMLIK, "iade");
  assert.notEqual(provaut, provrfn);
  assert.notEqual(
    iadeHash(KIMLIK, "SIP-000042", 5000),
    iadeHash({ ...KIMLIK, iadeSifresi: KIMLIK.provizyonSifresi }, "SIP-000042", 5000),
  );
});

test("iade şifresi yoksa ne hash ne XML üretiliyor", () => {
  /* Boş şifreyle hash üretip bankaya göndermek, iade edilmemiş parayı
     "istek gitti" diye göstermek olurdu. */
  const yok = { ...KIMLIK, iadeSifresi: null };
  assert.equal(iadeHash(yok, "SIP-000042", 5000), null);
  assert.equal(iadeXml(yok, true, { siparisNo: "SIP-000042", tutarKurus: 5000, tur: "refund", musteriIp: "1.2.3.4" }), null);
});

test("XML PROVRFN kullanıcısıyla ve doğru türle gidiyor", () => {
  const xml = iadeXml(KIMLIK, true, { siparisNo: "SIP-000042", tutarKurus: 5000, tur: "void", musteriIp: "1.2.3.4" })!;
  assert.match(xml, /<ProvUserID>PROVRFN<\/ProvUserID>/);
  assert.match(xml, /<UserID>PROVRFN<\/UserID>/);
  assert.match(xml, /<Type>void<\/Type>/);
  assert.match(xml, /<Mode>TEST<\/Mode>/);
  assert.match(xml, /<Amount>5000<\/Amount>/);
  assert.match(xml, /<CurrencyCode>949<\/CurrencyCode>/);
  assert.ok(xml.includes(iadeHash(KIMLIK, "SIP-000042", 5000)!), "XML'deki hash ile hesaplanan aynı olmalı");
});

test("canlı modda Mode PROD, sürüm alanı hash sürümüyle aynı", () => {
  const xml = iadeXml(KIMLIK, false, { siparisNo: "S1", tutarKurus: 100, tur: "refund", musteriIp: "1.2.3.4" })!;
  assert.match(xml, /<Mode>PROD<\/Mode>/);
  assert.match(xml, /<Version>512<\/Version>/);
  const eski = iadeXml({ ...KIMLIK, surum: "v0.01" }, false, { siparisNo: "S1", tutarKurus: 100, tur: "refund", musteriIp: "1.2.3.4" })!;
  assert.match(eski, /<Version>v0\.01<\/Version>/);
});

test("XML'i bozabilecek karakter kaçışlanıyor", () => {
  const xml = iadeXml({ ...KIMLIK, isyeriNo: "A&B<C" }, true, { siparisNo: "S1", tutarKurus: 100, tur: "refund", musteriIp: "1.2.3.4" })!;
  assert.match(xml, /<MerchantID>A&amp;B&lt;C<\/MerchantID>/);
  assert.ok(!/<MerchantID>A&B<C</.test(xml));
});

test("cevap: Approved ya da ReasonCode 00 başarılı", () => {
  const a = iadeCevabiniCoz("<GVPSResponse><Transaction><Response><Message>Approved</Message></Response><RetRefNum>987654</RetRefNum></Transaction></GVPSResponse>");
  assert.equal(a.ok, true);
  assert.equal(a.referans, "987654");
  assert.equal(iadeCevabiniCoz("<ReasonCode>00</ReasonCode>").ok, true);
});

test("cevap: hata mesajı taşınıyor", () => {
  const sonuc = iadeCevabiniCoz("<Message>Declined</Message><ReasonCode>12</ReasonCode><ErrorMsg>İşlem bulunamadı</ErrorMsg>");
  assert.equal(sonuc.ok, false);
  assert.match(sonuc.mesaj, /İşlem bulunamadı/);
});

test("tanınmayan ya da boş cevap BAŞARISIZ sayılıyor", () => {
  /* Boş bir cevabı onay saymak, iade edilmemiş parayı iade edilmiş
     göstermek demekti — müşteri parasını beklerken sipariş kapanırdı. */
  assert.equal(iadeCevabiniCoz("").ok, false);
  assert.equal(iadeCevabiniCoz("<html>502 Bad Gateway</html>").ok, false);
  assert.ok(iadeCevabiniCoz("").mesaj.length > 10);
});
