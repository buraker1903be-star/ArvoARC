import assert from "node:assert/strict";
import test from "node:test";
import { panelYonetiminde, shopifyVaryantlari, uretilmisSku, varyantKimligi } from "@/lib/shopify-varyant";

/*
  CANLIDA OLAN ŞEY. 20.08.2026'daki tek bir içe aktarımda on beş ürünün
  her birine 4-5 hayalet varyant yazıldı: aynı SKU, boş nitelik,
  "Default" başlık, external_id handle:1…handle:6. Fiyat aktarımı
  SKU'ya yazdığı için bu kopyalar 28.09.2026'da ortaya çıktı.
*/
const SECENEKLER = { 1: "Renk", 2: "Beden", 3: "" };

test("GÖRSEL SATIRLARI varyant sayılmıyor, hayalet olarak bildiriliyor", () => {
  /*
    Görsel satırı aynı SKU ve fiyatı taşıyabiliyor; eski ayıklama
    anahtarı değerleri KIRPMADAN aldığı için yalnızca boşlukla ayrılan
    satırlar ayrı varyant sayılıyordu.
  */
  const { satirlar, hayalet } = shopifyVaryantlari(
    "stag-minimal-erkek-tisort-beyaz",
    [
      { "Option1 Value": "Beyaz", "Option2 Value": "XS", "Variant SKU": "TR-10673", "Variant Price": "649,90" },
      { "Option1 Value": " ", "Option2 Value": "", "Variant SKU": "TR-10673", "Variant Price": "649,90" },
      { "Option1 Value": "", "Option2 Value": "  ", "Variant SKU": "TR-10673", "Variant Price": "649,90" },
      { "Option1 Value": "", "Option2 Value": "", "Variant SKU": "TR-10673", "Variant Price": " 649,90 " },
    ],
    SECENEKLER,
  );
  assert.equal(satirlar.length, 1);
  assert.equal(hayalet, 3);
  assert.deepEqual(satirlar[0].attributes, { Renk: "Beyaz", Beden: "XS" });
  assert.equal(satirlar[0].title, "Beyaz / XS");
});

test("KİMLİK SKU'DAN üretiliyor, CSV'deki sıradan değil", () => {
  /*
    Eskiden `handle:n` yazılıyordu ve upsert anahtarı buydu: dosyaya bir
    satır eklenince sonraki varyantların verisi birbirinin üstüne
    yazılıyordu.
  */
  const oncesi = shopifyVaryantlari("t", [
    { "Option1 Value": "Beyaz", "Variant SKU": "A", "Variant Price": "10,00" },
    { "Option1 Value": "Siyah", "Variant SKU": "B", "Variant Price": "20,00" },
  ], SECENEKLER);
  const sonrasi = shopifyVaryantlari("t", [
    { "Option1 Value": "Kırmızı", "Variant SKU": "C", "Variant Price": "30,00" },
    { "Option1 Value": "Beyaz", "Variant SKU": "A", "Variant Price": "10,00" },
    { "Option1 Value": "Siyah", "Variant SKU": "B", "Variant Price": "20,00" },
  ], SECENEKLER);

  const kimlik = (l: { sku: string; external_id: string }[]) =>
    Object.fromEntries(l.map((v) => [v.sku, v.external_id]));
  assert.equal(kimlik(oncesi.satirlar).A, kimlik(sonrasi.satirlar).A);
  assert.equal(kimlik(oncesi.satirlar).B, kimlik(sonrasi.satirlar).B);
  assert.equal(varyantKimligi("t", "A"), "t:A");
});

test("NİTELİK TAŞIYAN satır, taşımayana tercih ediliyor", () => {
  // Gerçek varyant satırı genellikle önce gelir ama garanti değil.
  const { satirlar } = shopifyVaryantlari("t", [
    { "Variant SKU": "A", "Variant Price": "10,00" },
    { "Option1 Value": "Beyaz", "Option2 Value": "XS", "Variant SKU": "A", "Variant Price": "10,00" },
  ], SECENEKLER);
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].title, "Beyaz / XS");
});

test("başlık 'Default' DEĞİL; nitelik yoksa SKU yazılıyor", () => {
  /*
    "Default", aynı üründe birkaç kez görününce hangi varyantın hangisi
    olduğunu ekranda da veride de okunamaz hale getiriyordu.
  */
  const { satirlar } = shopifyVaryantlari("t", [{ "Variant SKU": "TR-1", "Variant Price": "10,00" }], {});
  assert.equal(satirlar[0].title, "TR-1");
});

test("SKU'suz satıra üretilen kimlik, handle kırpılsa da ÇAKIŞMIYOR", () => {
  /*
    Eskiden handle 35 karaktere kırpılıyordu: ilk 35 karakteri aynı olan
    iki ürün aynı sırada aynı SKU'yu alıyordu.
  */
  const a = uretilmisSku("arvoculture-x-dogaden-performans-tisort-beyaz", 1);
  const b = uretilmisSku("arvoculture-x-dogaden-performans-tisort-siyah", 1);
  assert.notEqual(a, b);
  assert.ok(a.startsWith("ArvoARC-ARVOCULTURE-X-DOGADEN-PERFOR"));
});

test("kısa handle'da özet eklenmiyor", () => {
  assert.equal(uretilmisSku("lr-serox-instant-serum", 1), "ArvoARC-LR-SEROX-INSTANT-SERUM-001");
});

test("ne fiyatı ne SKU'su ne seçeneği olan satır hiç sayılmıyor", () => {
  // Yalnızca görsel taşıyan satır; hayalet bile değil, varyant adayı değil.
  const { satirlar, hayalet } = shopifyVaryantlari("t", [
    { "Option1 Value": "Beyaz", "Variant SKU": "A", "Variant Price": "10,00" },
    { "Image Src": "https://x/y.jpg" },
  ], SECENEKLER);
  assert.equal(satirlar.length, 1);
  assert.equal(hayalet, 0);
});

test("üstü çizili fiyat ancak satıştan YÜKSEKSE yazılıyor", () => {
  const { satirlar } = shopifyVaryantlari("t", [
    { "Variant SKU": "A", "Variant Price": "10,00", "Variant Compare At Price": "8,00" },
    { "Variant SKU": "B", "Variant Price": "10,00", "Variant Compare At Price": "15,00" },
  ], {});
  assert.equal(satirlar[0].compare_at_price, null);
  assert.equal(satirlar[1].compare_at_price, 1500);
});

/*
  PANELDEN YÖNETİLEN ÜRÜN. SKU'su CSV'de olmayan ürünlerde içe aktarım
  kimliği yeniden üretip elle düzeltilmiş kaydın yanına ikinci bir
  varyant ekliyordu; işaretli ürüne hiç dokunulmuyor.
*/
test("işaret okunuyor; jsonb'den metin olarak gelse de", () => {
  assert.equal(panelYonetiminde({ panelden_yonetiliyor: true }), true);
  assert.equal(panelYonetiminde({ panelden_yonetiliyor: "true" }), true);
});

test("işaretsiz ürün korunmuyor", () => {
  assert.equal(panelYonetiminde({}), false);
  assert.equal(panelYonetiminde({ panelden_yonetiliyor: false }), false);
  assert.equal(panelYonetiminde(null), false);
  assert.equal(panelYonetiminde("true"), false);
});
