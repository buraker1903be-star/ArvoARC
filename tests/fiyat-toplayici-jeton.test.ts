import assert from "node:assert/strict";
import test from "node:test";

/*
  Toplayıcının jetonu. Uç, mağazayı BAŞKA hiçbir şeyden bilmiyor: istek
  LR'ın sayfasından, çerezsiz geliyor ve servis anahtarıyla yazıyor.
  İmza tutmuyorsa yazmamalı — yoksa herhangi biri herhangi bir mağazanın
  fiyat önizlemesine satır bırakabilir.

  Anahtar modül yüklenirken değil, çağrı anında okunuyor; test burada
  ortam değişkenini kendisi kuruyor.
*/
process.env.PAYMENT_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");

const { GECERLILIK_GUN, jetonAnahtariVar, jetonuCoz, toplayiciJetonu } = await import("@/lib/fiyat-toplayici-jeton");

const KURUM = "11111111-2222-4333-8444-555555555555";

test("üretilen jeton aynı mağazayı geri veriyor", () => {
  const { jeton, bitis } = toplayiciJetonu(KURUM);
  const cozum = jetonuCoz(jeton);
  assert.equal(cozum?.organizationId, KURUM);
  assert.equal(cozum?.bitis.getTime(), Math.floor(bitis.getTime() / 1000) * 1000);
});

test("MAĞAZA KİMLİĞİ DEĞİŞTİRİLİRSE jeton geçersiz", () => {
  const { jeton } = toplayiciJetonu(KURUM);
  const baskasi = jeton.replace(KURUM, "99999999-2222-4333-8444-555555555555");
  assert.equal(jetonuCoz(baskasi), null);
});

test("bitiş zamanı ileri alınırsa jeton geçersiz", () => {
  const [kimlik, saniye, imza] = toplayiciJetonu(KURUM).jeton.split(".");
  assert.equal(jetonuCoz(`${kimlik}.${Number(saniye) + 86_400}.${imza}`), null);
});

test("SÜRESİ DOLMUŞ jeton geçersiz", () => {
  const { jeton } = toplayiciJetonu(KURUM);
  const sonra = new Date(Date.now() + (GECERLILIK_GUN + 1) * 86_400_000);
  assert.equal(jetonuCoz(jeton, sonra), null);
  assert.notEqual(jetonuCoz(jeton), null);
});

test("bozuk biçim ve boş değer geçersiz", () => {
  for (const deger of ["", "abc", `${KURUM}.123`, `${KURUM}.abc.imza`, `${KURUM}..imza`]) {
    assert.equal(jetonuCoz(deger), null, deger);
  }
});

test("ANAHTAR YOKSA kapalı başarısızlık", () => {
  /*
    Anahtar tanımlı değilse uç 401 dönmeli; istisna fırlatıp 500 dönmek
    ya da doğrulamayı atlamak değil.
  */
  const { jeton } = toplayiciJetonu(KURUM);
  const eski = process.env.PAYMENT_CREDENTIALS_KEY;
  delete process.env.PAYMENT_CREDENTIALS_KEY;
  try {
    assert.equal(jetonAnahtariVar(), false);
    assert.equal(jetonuCoz(jeton), null);
  } finally {
    process.env.PAYMENT_CREDENTIALS_KEY = eski;
  }
});
