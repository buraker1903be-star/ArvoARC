import assert from "node:assert/strict";
import test from "node:test";
import { ALT_ALAN_SONEKI, altAlanAdresi, konakSadelestir, magazaAdresi, vitrinDefteri } from "@/lib/magaza-adresi";

/*
  Önizleme adresi yanlışsa kullanıcı BAŞKA bir mağazayı düzenliyor
  sanır: yedek adres ArvoCulture'ındı ve adresi olmayan her salon
  önizlemede o markanın vitrinini görüyordu.
*/

test("doğrulanmış özel alan adı önce geliyor", () => {
  assert.equal(
    magazaAdresi({ custom_domain: "Salon.com", domain_verified_at: "2026-09-01T00:00:00Z", platform_subdomain: "salon" }),
    "https://salon.com",
  );
});

test("doğrulanmamış özel alan adı kullanılmıyor", () => {
  /* DNS bağlanmadan o adres açılmıyor; önizleme 404 verirdi. */
  assert.equal(magazaAdresi({ custom_domain: "salon.com", platform_subdomain: "salon" }), `https://${altAlanAdresi("salon")}`);
  assert.equal(magazaAdresi({ custom_domain: "salon.com" }), null);
});

test("alt alan adı kiracı açılışında atandığı için yeni salonun adresi var", () => {
  assert.equal(magazaAdresi({ platform_subdomain: "Salon-Beta" }), `https://salon-beta.${ALT_ALAN_SONEKI}`);
});

test("eski mağazanın storefront_url'i son çare", () => {
  assert.equal(magazaAdresi({ storefront_url: "https://eski.com" }), "https://eski.com/");
});

test("dağıtım adresi ve http kabul edilmiyor", () => {
  /* Silinen bir Vercel dağıtımı editörü tamamen kullanılamaz yapıyordu. */
  assert.equal(magazaAdresi({ storefront_url: "https://arc-abc123.vercel.app" }), null);
  assert.equal(magazaAdresi({ storefront_url: "http://salon.com" }), null);
  assert.equal(magazaAdresi({ storefront_url: "salon.com" }), null);
});

test("adresi olmayan mağaza null dönüyor", () => {
  assert.equal(magazaAdresi(null), null);
  assert.equal(magazaAdresi({}), null);
  assert.equal(magazaAdresi({ platform_subdomain: "  ", storefront_url: "  " }), null);
});

/*
  ADRES DEFTERİ — gelen isteğin sahibi. İki kusur 29.09.2026'da
  üretildi; testler o iki senaryoyu sabitliyor.
*/

const AC = {
  organization_id: "arvoculture",
  custom_domain: "arvoculture.com",
  domain_verified_at: "2026-01-01T00:00:00Z",
  platform_subdomain: "arvoculture",
  storefront_url: "https://arvoculture.com",
};
const BETA = { organization_id: "salon-beta", platform_subdomain: "salon-beta" };

test("TEK adresi alt alan adı olan mağaza çözülüyor", () => {
  /*
    Kiracı açılışının verdiği adres bu. Eskiden ayarlardaki çıplak
    "salon-beta" ile isteğin konağı "salon-beta.shop.arvo-os.com"
    karşılaştırılıyor, eşleşmediği için yeni salonun sepeti, kuponu
    ve kimlik istekleri REDDEDİLİYORDU.
  */
  const defter = vitrinDefteri([AC, BETA]);
  assert.equal(defter.get("salon-beta.shop.arvo-os.com"), "salon-beta");
  assert.equal(defter.get("salon-beta"), undefined, "çıplak alt alan adı bir konak değil");
});

test("doğrulanmış özel alan adı ve www eşleşiyor", () => {
  const defter = vitrinDefteri([AC]);
  assert.equal(defter.get("arvoculture.com"), "arvoculture");
  assert.equal(defter.get(konakSadelestir("https://www.arvoculture.com/sepet")), "arvoculture");
});

test("storefront_url ile başka mağazanın adresi ÇALINAMIYOR", () => {
  /*
    storefront_url'in tekillik kısıtı yok. Eşleşme "listede önce gelen"
    ile bulunuyordu: rakibin vitrininden gelen sipariş yabancı bir
    kuruma yazılabilir, tahsilat o kurumun PayTR hesabına gidebilirdi.
    Kanıtlı adres her zaman kazanıyor — sıra ne olursa olsun.
  */
  const saldirgan = { organization_id: "saldirgan", platform_subdomain: "saldirgan", storefront_url: "https://arvoculture.com" };
  for (const satirlar of [[AC, saldirgan], [saldirgan, AC]]) {
    assert.equal(vitrinDefteri(satirlar).get("arvoculture.com"), "arvoculture");
  }
});

test("doğrulanmamış özel alan adı defterde yok", () => {
  /* Çözücüyle aynı ölçüt: doğrulanmadan o adres bize gelmiyor. */
  const defter = vitrinDefteri([{ organization_id: "beta", custom_domain: "salon.com", platform_subdomain: "beta" }]);
  assert.equal(defter.get("salon.com"), undefined);
  assert.equal(defter.get("beta.shop.arvo-os.com"), "beta");
});

test("eski mağazanın storefront_url'i, boştaki konağı doldurabiliyor", () => {
  /* Kimsenin kanıtlı adresi değilse eski mağaza çalışmaya devam eder. */
  const eski = { organization_id: "eski", storefront_url: "https://eskimagaza.com" };
  assert.equal(vitrinDefteri([AC, eski]).get("eskimagaza.com"), "eski");
});

test("iki eski kayıt aynı konağı iddia ederse kimseye verilmiyor", () => {
  /* Yanlış mağazaya yazmaktansa isteği reddetmek yeğdir. */
  const a = { organization_id: "a", storefront_url: "https://ortak.com" };
  const b = { organization_id: "b", storefront_url: "https://ortak.com" };
  assert.equal(vitrinDefteri([a, b]).get("ortak.com"), undefined);
});

test("aynı mağazanın iki alanı aynı konağa bakabiliyor", () => {
  /* AC'nin custom_domain'i ve storefront_url'i aynı; çakışma değil. */
  assert.equal(vitrinDefteri([AC]).get("arvoculture.com"), "arvoculture");
});

test("boş defter boş liste ve bozuk satırlarla çökmüyor", () => {
  assert.equal(vitrinDefteri([]).size, 0);
  assert.equal(vitrinDefteri([{ organization_id: "x", custom_domain: "  ", platform_subdomain: null, storefront_url: "" }]).size, 0);
});
