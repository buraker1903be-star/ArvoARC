import assert from "node:assert/strict";
import test from "node:test";
import {
  EN_FAZLA_VARYANT,
  kodParcasi,
  matrisiKur,
  seceneginDegerleri,
} from "@/lib/varyant-matrisi";

/*
  Matrisin tek işi çakışmasız bir liste üretmek. Veritabanında
  (organization_id, product_id, sku) tekil; tek çakışan kod, toplu
  eklemenin TAMAMINI düşürür. Bu yüzden senaryolar çakışmanın
  gelebileceği her yeri tutuyor: var olan varyant, iki değerin aynı
  koda inmesi, aynı değerin iki kez yazılması.
*/

const BOS = { skuOneki: "TSHIRT", mevcutSkular: [], mevcutBasliklar: [] };

test("çarpım seçeneklerin yazıldığı sırada kuruluyor", () => {
  const { satirlar, atlanan } = matrisiKur(
    [
      { ad: "Renk", degerler: ["Siyah", "Beyaz"] },
      { ad: "Beden", degerler: ["S", "M"] },
    ],
    BOS,
  );
  assert.equal(atlanan, 0);
  /* İlk seçenek en yavaş değişiyor: liste depoda okunduğu gibi akıyor. */
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Siyah / S", "Siyah / M", "Beyaz / S", "Beyaz / M"]);
  assert.deepEqual(satirlar.map((s) => s.sku), ["TSHIRT-SIYAH-S", "TSHIRT-SIYAH-M", "TSHIRT-BEYAZ-S", "TSHIRT-BEYAZ-M"]);
  assert.deepEqual(satirlar[0].nitelikler, { Renk: "Siyah", Beden: "S" });
});

test("üründe zaten olan başlık atlanıyor, sayısı bildiriliyor", () => {
  /* Sessizce eklemek aynı varyanttan iki tane bırakırdı. */
  const { satirlar, atlanan } = matrisiKur(
    [{ ad: "Renk", degerler: ["Siyah", "Beyaz"] }],
    { ...BOS, mevcutBasliklar: ["siyah"] },
  );
  assert.equal(atlanan, 1);
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Beyaz"]);
});

test("var olan SKU ile çakışan kod numaralanıyor", () => {
  /*
    Başlık yeni ama kod tutuyorsa varyant EKLENMELİ: kodu değiştirmek
    kullanıcının göremediği bir birleşimi kaybetmekten iyi.
  */
  const { satirlar } = matrisiKur(
    [{ ad: "Renk", degerler: ["Siyah"] }],
    { ...BOS, mevcutSkular: ["TSHIRT-SIYAH"] },
  );
  assert.deepEqual(satirlar.map((s) => s.sku), ["TSHIRT-SIYAH-2"]);
});

test("iki değer aynı koda inince ikincisi numaralanıyor", () => {
  /* "Small" 12 karaktere sığıyor ama "S" ile aynı kodu üretmiyor;
     asıl tuzak aynı kodu veren iki ayrı yazım. */
  const { satirlar } = matrisiKur([{ ad: "Beden", degerler: ["S", "s.", "S-"] }], BOS);
  /* "s." ve "S-" farklı değer sayılıyor (nokta/tire yazımda anlamlı),
     kodları aynı olduğu için numaralanıyor. */
  assert.deepEqual(satirlar.map((s) => s.sku), ["TSHIRT-S", "TSHIRT-S-2", "TSHIRT-S-3"]);
  assert.equal(new Set(satirlar.map((s) => s.sku)).size, satirlar.length);
});

test("Türkçe harfler koda ASCII olarak iniyor", () => {
  assert.equal(kodParcasi("Işıklı Gümüş"), "ISIKLI-GUMUS");
  assert.equal(kodParcasi("Çöl Bejı"), "COL-BEJI");
  assert.equal(kodParcasi("  "), "");
  /* Kırpma tirenin ortasında bitirmiyor: "ISIKLI-" gibi bir kod olmaz. */
  assert.equal(kodParcasi("ISIKLI GUMUS", 7), "ISIKLI");
});

test("değer listesi virgül, satır sonu ve noktalı virgülle ayrılıyor", () => {
  assert.deepEqual(seceneginDegerleri("Siyah, Beyaz\nLacivert; Gri"), ["Siyah", "Beyaz", "Lacivert", "Gri"]);
  /* Aynı değerin iki kez yazılması iki varyant üretmemeli. */
  assert.deepEqual(seceneginDegerleri("Siyah, siyah, SİYAH"), ["Siyah"]);
  assert.deepEqual(seceneginDegerleri("  ,  , "), []);
  assert.deepEqual(seceneginDegerleri("Açık  mavi"), ["Açık mavi"]);
});

test("adı olmayan seçenek yok sayılıyor", () => {
  /* Ekranda üç satır var; ikisi boş bırakılabilmeli. */
  const { satirlar } = matrisiKur(
    [
      { ad: "Renk", degerler: ["Siyah"] },
      { ad: "", degerler: ["S", "M"] },
      { ad: "Beden", degerler: [] },
    ],
    BOS,
  );
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Siyah"]);
});

test("sınır aşılınca hiçbir şey üretilmiyor", () => {
  /*
    İlk yüzü ekleyip gerisini atmak eksik bir katalog bırakır ve hangi
    birleşimin düştüğü ekranda görünmez.
  */
  const cok = Array.from({ length: 11 }, (_, i) => `D${i}`);
  const sonuc = matrisiKur(
    [
      { ad: "A", degerler: cok },
      { ad: "B", degerler: cok },
    ],
    BOS,
  );
  assert.equal(sonuc.satirlar.length, 0);
  assert.match(sonuc.hata ?? "", new RegExp(String(EN_FAZLA_VARYANT)));
});

test("boş girdi, fazla seçenek ve öneksiz çağrı hata veriyor", () => {
  assert.match(matrisiKur([], BOS).hata ?? "", /en az bir seçenek/i);
  assert.match(matrisiKur([{ ad: "Renk", degerler: ["Siyah"] }], { ...BOS, skuOneki: "  " }).hata ?? "", /SKU öneki/i);
  const dortSecenek = ["A", "B", "C", "D"].map((ad) => ({ ad, degerler: ["1"] }));
  assert.match(matrisiKur(dortSecenek, BOS).hata ?? "", /en fazla 3 seçenek/i);
});

test("hepsi zaten varsa hata dönüyor, boş ekleme yapılmıyor", () => {
  const sonuc = matrisiKur(
    [{ ad: "Renk", degerler: ["Siyah", "Beyaz"] }],
    { ...BOS, mevcutBasliklar: ["Siyah", "Beyaz"] },
  );
  assert.equal(sonuc.satirlar.length, 0);
  assert.equal(sonuc.atlanan, 2);
  assert.match(sonuc.hata ?? "", /zaten var/i);
});

test("üretilen kodlar kendi içinde de tekil", () => {
  /* Tek çakışan kod toplu eklemenin tamamını düşürür. */
  const { satirlar } = matrisiKur(
    [
      { ad: "Renk", degerler: ["Açık Mavi", "Acik Mavi"] },
      { ad: "Beden", degerler: ["S", "M"] },
    ],
    BOS,
  );
  assert.equal(satirlar.length, 4);
  assert.equal(new Set(satirlar.map((s) => s.sku)).size, 4);
});

/*
  VİTRİN İLK PARÇAYI RENK OKUYOR (get_arvoculture_storefront_variants
  başlığı "/" ile bölüp birinci parçayı renk sayıyor). Matrise
  seçenekleri "Beden, Renk" sırasıyla yazmak, vitrine "renk: M"
  yazdırırdı — panelde her şey doğru görünürken müşteri yanlış
  etiketi görür. Aşağıdakiler o sırayı sabitliyor.
*/

test("renk seçeneği başta değilse öne alınıyor", () => {
  const { satirlar, not } = matrisiKur(
    [
      { ad: "Beden", degerler: ["S", "M"] },
      { ad: "Renk", degerler: ["Siyah", "Beyaz"] },
    ],
    BOS,
  );
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Siyah / S", "Siyah / M", "Beyaz / S", "Beyaz / M"]);
  assert.deepEqual(satirlar[0].nitelikler, { Renk: "Siyah", Beden: "S" });
  /* Sessiz sıralama, SKU'ların neden böyle çıktığını açıklamazdı. */
  assert.match(not ?? "", /başa alındı/);
  assert.equal(satirlar[0].sku, "TSHIRT-SIYAH-S");
});

test("renk zaten baştaysa sıra değişmiyor ve not verilmiyor", () => {
  const { satirlar, not } = matrisiKur(
    [
      { ad: "Renk", degerler: ["Siyah"] },
      { ad: "Beden", degerler: ["S", "M"] },
    ],
    BOS,
  );
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Siyah / S", "Siyah / M"]);
  assert.equal(not, undefined);
});

test("renk adı büyük/küçük ve İngilizce yazımla da tanınıyor", () => {
  /* Türkçe küçültme tuzağı: "RENK" → "renk", I/İ ayrımı bozmamalı. */
  for (const ad of ["RENK", "Renk", "renk", "Color", "COLOUR", " Renkler "]) {
    const { not } = matrisiKur([{ ad: "Beden", degerler: ["S"] }, { ad, degerler: ["Siyah"] }], BOS);
    assert.match(not ?? "", /başa alındı/, ad);
  }
});

test("renk seçeneği yoksa yazılan sıra korunuyor", () => {
  /* Renk kavramı olmayan üründe (hacim, koku) kullanıcının sırası esas. */
  const { satirlar, not } = matrisiKur(
    [
      { ad: "Hacim", degerler: ["50 ml", "100 ml"] },
      { ad: "Koku", degerler: ["Lavanta"] },
    ],
    BOS,
  );
  assert.deepEqual(satirlar.map((s) => s.baslik), ["50 ml / Lavanta", "100 ml / Lavanta"]);
  assert.equal(not, undefined);
});

test("üç seçenekte renk öne alınırken ötekiler sırasını koruyor", () => {
  const { satirlar } = matrisiKur(
    [
      { ad: "Beden", degerler: ["S"] },
      { ad: "Kalıp", degerler: ["Dar"] },
      { ad: "Renk", degerler: ["Siyah"] },
    ],
    BOS,
  );
  assert.deepEqual(satirlar.map((s) => s.baslik), ["Siyah / S / Dar"]);
  assert.deepEqual(satirlar[0].nitelikler, { Renk: "Siyah", Beden: "S", Kalıp: "Dar" });
});
