import assert from "node:assert/strict";
import test from "node:test";
import { ayarlardanOlgular, kurulumDurumu, type KurulumOlgulari } from "@/lib/kurulum-adimlari";

/*
  Rehber yanlış "tamam" derse kullanıcı satışa hazır olduğunu sanır ve
  kusuru müşteri bulur. En tehlikelisi ödeme: kutucuğu işaretli ama
  IBAN'ı boş bir havale, panelde "açık" görünürken müşteriyi ödeme
  adımında duvara çarptırır.
*/

const HAZIR: KurulumOlgulari = {
  urunSayisi: 12,
  yayindaUrunSayisi: 8,
  logoVar: true,
  odemeAcik: true,
  kargoUcretiVar: true,
  vitrinAdresiVar: true,
};

test("her şey tamamken rehber kayboluyor", () => {
  /* Kalıcı bir "kurulum" kartı, bu panelde kaldırdığımız bantların
     büyüğü olurdu. */
  const durum = kurulumDurumu(HAZIR);
  assert.equal(durum.gorunsun, false);
  assert.equal(durum.tamamlanan, durum.toplam);
  assert.equal(durum.sonraki, null);
});

test("boş mağazada hiçbir adım tamam değil", () => {
  const durum = kurulumDurumu({
    urunSayisi: 0, yayindaUrunSayisi: 0, logoVar: false,
    odemeAcik: false, kargoUcretiVar: false, vitrinAdresiVar: false,
  });
  assert.equal(durum.gorunsun, true);
  assert.equal(durum.tamamlanan, 0);
  assert.equal(durum.sonraki?.anahtar, "urun", "ilk iş ürün eklemek");
});

test("sıradaki adım listedeki ilk eksik", () => {
  /* Sıra rastgele değil: ürün eklemeden yayına almanın anlamı yok. */
  const durum = kurulumDurumu({ ...HAZIR, yayindaUrunSayisi: 0, logoVar: false });
  assert.equal(durum.sonraki?.anahtar, "yayin");
  assert.equal(durum.tamamlanan, 4);
});

test("her adımın açıklaması ve gideceği yer var", () => {
  /* Adım "ne yapılacağını" değil NEDEN gerektiğini anlatmalı. */
  for (const adim of kurulumDurumu(HAZIR).adimlar) {
    assert.ok(adim.baslik.length > 3, adim.anahtar);
    assert.ok(adim.aciklama.length > 20, `${adim.anahtar}: açıklama sebep söylemeli`);
    assert.ok(adim.yol.startsWith("/"), adim.anahtar);
    assert.ok(adim.eylem.length > 2, adim.anahtar);
  }
  const anahtarlar = kurulumDurumu(HAZIR).adimlar.map((adim) => adim.anahtar);
  assert.equal(new Set(anahtarlar).size, anahtarlar.length, "anahtarlar tekil olmalı");
});

const SAYILAR = { urunSayisi: 3, yayindaUrunSayisi: 1 };

test("işaretli ama IBAN'sız havale ödeme açık saymıyor", () => {
  const olgular = ayarlardanOlgular({ bank_transfer_enabled: true, bank_iban: "  " }, SAYILAR);
  assert.equal(olgular.odemeAcik, false);
  assert.equal(ayarlardanOlgular({ bank_transfer_enabled: true, bank_iban: "TR00" }, SAYILAR).odemeAcik, true);
});

test("anahtarı olmayan PayTR ödeme açık saymıyor", () => {
  assert.equal(ayarlardanOlgular({ paytr_enabled: true, paytr_merchant_id: "123" }, SAYILAR).odemeAcik, false);
  assert.equal(
    ayarlardanOlgular({ paytr_enabled: true, paytr_merchant_id: "123", paytr_merchant_key_enc: "sifreli" }, SAYILAR).odemeAcik,
    true,
  );
});

test("sıfır kargo ücreti geçerli, eksik ücret değil", () => {
  /* Ücretsiz kargo bir karar; NULL ise ayar hiç yapılmamış. */
  assert.equal(ayarlardanOlgular({ shipping_fee: 0 }, SAYILAR).kargoUcretiVar, true);
  assert.equal(ayarlardanOlgular({ shipping_fee: null }, SAYILAR).kargoUcretiVar, false);
  assert.equal(ayarlardanOlgular({}, SAYILAR).kargoUcretiVar, false);
});

test("doğrulanmamış özel alan adı vitrin adresi sayılmıyor", () => {
  /* Doğrulanmadan adres çalışmıyor; "tamam" demek yanlış olurdu. */
  assert.equal(ayarlardanOlgular({ custom_domain: "magaza.com" }, SAYILAR).vitrinAdresiVar, false);
  assert.equal(
    ayarlardanOlgular({ custom_domain: "magaza.com", domain_verified_at: "2026-09-01T00:00:00Z" }, SAYILAR).vitrinAdresiVar,
    true,
  );
  assert.equal(ayarlardanOlgular({ storefront_url: "https://magaza.com" }, SAYILAR).vitrinAdresiVar, true);
});

test("ayar satırı hiç yoksa çökmeden hepsi eksik dönüyor", () => {
  /* Yeni salonun satırı bir an için olmayabilir; rehberin ilk
     karşılaştığı durum tam olarak bu. */
  const olgular = ayarlardanOlgular(null, { urunSayisi: 0, yayindaUrunSayisi: 0 });
  assert.deepEqual(olgular, {
    urunSayisi: 0, yayindaUrunSayisi: 0, logoVar: false,
    odemeAcik: false, kargoUcretiVar: false, vitrinAdresiVar: false,
  });
  assert.equal(kurulumDurumu(olgular).gorunsun, true);
});
