import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
  BAŞARISIZ DÖNÜŞ SESSİZ KALMAMALI.

  İlk sürümde imza ve tutar denetimlerinin kendi olayları vardı ama
  "banka reddetti" dalı hiçbir şey yazmıyordu. 07.10.2026'daki ilk canlı
  denemede tam o dal çalıştı: sipariş "bekliyor"da kaldı, müşteri hata
  sayfasını gördü ve SEBEBİ ARAYACAK YER YOKTU — ne olay kütüğünde ne
  sunucu günlüğünde. Teşhisin tamamı bankanın o dönüşteki alanlarındaydı
  ve hepsi çöpe gitti.

  Bu test kaynağı okuyor: dönüş ucundaki her başarısızlık dalının bir
  olay yazdığını ve doğrulanmamış verinin kütüğe DEĞER olarak
  girmediğini tutuyor.
*/
const KAYNAK = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/storefront/garanti-donus/route.ts"),
  "utf8",
);

/* Yorumlar ayıklanıyor: bir AÇIKLAMADA geçen "recordOrderEvent",
   koddaki çağrı sanılmamalı. */
const yorumsuz = KAYNAK.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("hata sayfasına giden her dal önce olay yazıyor", () => {
  /* hataYolu'na dönen her çağrıdan önce bir recordOrderEvent olmalı.
     Sayarak değil, SIRAYLA bakıyoruz: iki olay + üç dönüş de geçerdi. */
  const parcalar = yorumsuz.split("vitrineDon(vitrin, hataYolu)");
  // Son parça son dönüşten sonrası; ondan önceki her parça bir dalın gövdesi.
  const daller = parcalar.slice(0, -1);
  assert.ok(daller.length >= 4, `beklenenden az hata dalı var: ${daller.length}`);
  for (const [i, dal] of daller.entries()) {
    assert.ok(
      dal.includes("recordOrderEvent"),
      `${i + 1}. hata dalı olay yazmadan dönüyor: sebebi hiçbir yerde görünmez`,
    );
  }
});

test("banka reddi dalı mdstatus ve tanılama alanlarını taşıyor", () => {
  const dal = yorumsuz.slice(yorumsuz.indexOf("if (!odendi)"));
  assert.match(dal, /mdstatus:/, "3D sonucu yazılmıyor");
  assert.match(dal, /reason: sonuc\.mesaj/, "bankanın mesajı yazılmıyor");
  assert.match(dal, /\.\.\.tanilama\(alanlar\)/, "bankanın alanları yazılmıyor");
});

test("imza tutmayan dönüşte DEĞER değil yalnızca alan ADI yazılıyor", () => {
  /* Doğrulanmamış veriyi kütüğe almak, uydurma bir isteğin siparişin
     geçmişine istediği metni yazabilmesi demekti. */
  const bas = yorumsuz.indexOf("if (!donusHashiDogru");
  const dal = yorumsuz.slice(bas, yorumsuz.indexOf("return vitrineDon", bas));
  assert.match(dal, /gelen_alanlar: Object\.keys\(alanlar\)/);
  assert.ok(!dal.includes("tanilama(alanlar)"), "imzasız dönüşün değerleri kütüğe giriyor");
});

test("tanılama alanları kart verisi taşıyabilecek adları içermiyor", () => {
  const liste = /const TANILAMA_ALANLARI = \[([\s\S]*?)\] as const;/.exec(KAYNAK)?.[1] ?? "";
  assert.ok(liste.length > 0, "tanılama listesi bulunamadı");
  for (const yasak of ["cardnumber", "pan", "cvv", "cvc", "expdate", "cardholder"]) {
    assert.ok(!liste.toLowerCase().includes(yasak), `tanılama listesinde kart alanı: ${yasak}`);
  }
});

/*
  NE GÖNDERDİĞİMİZ DE KAYITLI OLMALI.

  Bankanın cevabını kaydetmeye başladık ama kendi isteğimizi
  kaydetmiyorduk: "form üretildi mi, hangi değerlerle" sorusunun cevabı
  hiçbir yerde durmuyordu. 07.10.2026'da ödeme açılmadığında teşhisin
  yarısı bu yüzden eksikti.
*/
const ODEME = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/storefront/odeme/route.ts"),
  "utf8",
);
const odemeYorumsuz = ODEME.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("garanti oturumu açılınca gönderilen alanlar kütüğe yazılıyor", () => {
  const bas = odemeYorumsuz.indexOf('"payment_session_opened"');
  assert.notEqual(bas, -1, "oturum açılışı kütüğe yazılmıyor");
  const blok = odemeYorumsuz.slice(bas, bas + 900);
  for (const alan of ["apiversion", "secure3dsecuritylevel", "terminalid", "txnamount", "successurl"]) {
    assert.ok(blok.includes(alan), `${alan} kütüğe yazılmıyor`);
  }
});

test("imzanın KENDİSİ kütüğe yazılmıyor, yalnızca uzunluğu", () => {
  /* İmza mağaza anahtarından türüyor ve kütük panelde görünüyor.
     Uzunluk zaten yetiyor: 128 ise SHA512, 40 ise SHA1. */
  const bas = odemeYorumsuz.indexOf('"payment_session_opened"');
  const blok = odemeYorumsuz.slice(bas, bas + 900);
  assert.ok(blok.includes("imza_uzunlugu: alanlar.secure3dhash.length"), "imza uzunluğu yazılmıyor");
  assert.ok(
    !/secure3dhash: alanlar\.secure3dhash\b(?!\.length)/.test(blok),
    "imzanın kendisi kütüğe giriyor",
  );
});
