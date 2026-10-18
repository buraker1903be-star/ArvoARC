import assert from "node:assert/strict";
import test from "node:test";
import { kaynakAdi } from "@/lib/ziyaret-kaynagi";

/*
  Ham kaynak ("l.instagram.com", "google.com.tr") listede olduğu
  gibi gösterilince aynı platform üç satıra bölünüyor ve
  "l.instagram.com" kimseye bir şey söylemiyor.
*/
test("aynı platformun bütün konakları tek ada iniyor", () => {
  for (const ham of ["instagram.com", "www.instagram.com", "l.instagram.com", "instagram"]) {
    assert.equal(kaynakAdi(ham), "Instagram", ham);
  }
  for (const ham of ["google.com", "www.google.com.tr", "google.de"]) {
    assert.equal(kaynakAdi(ham), "Google", ham);
  }
  /* t.co Twitter/X'in kısaltma alan adı. */
  for (const ham of ["t.co", "x.com", "twitter.com"]) {
    assert.equal(kaynakAdi(ham), "X", ham);
  }
});

test("boş kaynak doğrudan ziyaret", () => {
  /* Adres çubuğuna yazarak ya da yer iminden gelen ziyaret;
     uydurma bir "Bilinmeyen" etiketi onu platform gibi
     gösterirdi. */
  assert.equal(kaynakAdi(null), "Doğrudan");
  assert.equal(kaynakAdi(""), "Doğrudan");
  assert.equal(kaynakAdi("   "), "Doğrudan");
});

test("tanınmayan kaynak olduğu gibi kalıyor", () => {
  /* "Diğer" diye toplamak hangi siteden geldiğini gizlerdi. */
  assert.equal(kaynakAdi("www.ornekblog.com"), "ornekblog.com");
  assert.equal(kaynakAdi("haberler.test"), "haberler.test");
});

test("büyük harf ve boşluk ayrı satır üretmiyor", () => {
  assert.equal(kaynakAdi(" Instagram "), "Instagram");
  assert.equal(kaynakAdi("GOOGLE.COM"), "Google");
});
