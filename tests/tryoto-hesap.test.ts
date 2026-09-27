import assert from "node:assert/strict";
import test from "node:test";
import { hesabiCozumle } from "@/lib/tryoto/hesap";

/*
  accountInfo bağlantı sınamasının dayanağı: anahtarı doğruluyor ve
  BAKİYEYİ söylüyor (gönderi oluşturmak OTO cüzdanından düşüyor). Sınanan
  şey, tanınmayan gövdede uydurma hesap bilgisi göstermemesi.
*/

test("belgelenen alanlar okunuyor", () => {
  assert.deepEqual(
    hesabiCozumle({ name: "ArvoCulture", email: "a@b.com", packageName: "freePackage", remainingCredit: 0 }),
    { ad: "ArvoCulture", eposta: "a@b.com", paket: "freePackage", bakiye: 0 },
  );
});

test("sarmalayıcı içindeki gövde de okunuyor", () => {
  const hesap = hesabiCozumle({ success: true, data: { name: "X", remainingCredit: 125.5 } });
  assert.equal(hesap?.ad, "X");
  assert.equal(hesap?.bakiye, 125.5);
});

test("bakiye metin olarak gelse de sayıya çevriliyor", () => {
  assert.equal(hesabiCozumle({ name: "X", remainingCredit: "42" })?.bakiye, 42);
  assert.equal(hesabiCozumle({ name: "X", remainingCredit: "abc" })?.bakiye, null);
});

test("SIFIR bakiye null değil sıfır", () => {
  // Sıfır bakiye gönderi oluşturmayı engelliyor; "bilinmiyor" diye
  // gösterilirse kullanıcı sebebi anlamaz.
  assert.equal(hesabiCozumle({ name: "X", remainingCredit: 0 })?.bakiye, 0);
});

test("TANINMAYAN gövde null dönüyor, uydurmuyor", () => {
  assert.equal(hesabiCozumle({ beklenmeyen: true }), null);
  assert.equal(hesabiCozumle(null), null);
  assert.equal(hesabiCozumle("metin"), null);
});

test("tek alan bile olsa hesap sayılıyor", () => {
  // Bağlantı kurulduğunu göstermek için bu yeterli.
  assert.equal(hesabiCozumle({ packageName: "scalePackage" })?.paket, "scalePackage");
});
