import assert from "node:assert/strict";
import test from "node:test";
import { donusuCoz } from "@/lib/odeme/garanti/yanit";

/*
  Dönüşün iki ayrı sorusu var: 3D doğrulandı mı (mdstatus) ve para
  çekildi mi (procreturncode/response). Birini diğerinin yerine okumak
  ödenmemiş siparişi "ödendi" yapar.
*/

const BASARILI = {
  mdstatus: "1",
  procreturncode: "00",
  response: "Approved",
  hostrefnum: "123456789012",
  authcode: "A1B2C3",
};

test("tam doğrulama + onaylı provizyon başarılı", () => {
  const sonuc = donusuCoz(BASARILI, false);
  assert.equal(sonuc.durum, "basarili");
  if (sonuc.durum !== "basarili") return;
  assert.equal(sonuc.referans, "123456789012");
  assert.equal(sonuc.onayKodu, "A1B2C3");
});

test("3D doğrulandı ama PROVİZYON REDDEDİLDİ → başarısız", () => {
  // Yalnızca mdstatus'a bakan bir sürüm burada siparişi ödendi yapardı.
  const sonuc = donusuCoz({ ...BASARILI, procreturncode: "51", response: "Declined", hostmsg: "Yetersiz bakiye" }, false);
  assert.equal(sonuc.durum, "basarisiz");
  if (sonuc.durum !== "basarisiz") return;
  assert.match(sonuc.mesaj, /Yetersiz bakiye/);
});

test("3D doğrulanmadı → provizyon alanları ne derse desin başarısız", () => {
  for (const md of ["0", "5", "6", "7", "8", "9", ""]) {
    assert.equal(donusuCoz({ ...BASARILI, mdstatus: md }, true).durum, "basarisiz", `mdstatus=${md}`);
  }
});

test("yarı güvenli (2/3/4) yalnızca AÇIKÇA kabul edilmişse geçiyor", () => {
  for (const md of ["2", "3", "4"]) {
    assert.equal(donusuCoz({ ...BASARILI, mdstatus: md }, true).durum, "basarili", `mdstatus=${md}`);
    assert.equal(donusuCoz({ ...BASARILI, mdstatus: md }, false).durum, "basarisiz", `mdstatus=${md}`);
  }
});

test("procreturncode boşsa response'a bakılıyor (ve tersi)", () => {
  /* Bankanın bazı dönüşlerinde biri boş geliyor; yalnızca birine bakmak
     başarılı ödemeyi başarısız saymaya yol açıyordu. */
  assert.equal(donusuCoz({ ...BASARILI, procreturncode: "" }, false).durum, "basarili");
  assert.equal(donusuCoz({ ...BASARILI, response: "" }, false).durum, "basarili");
  assert.equal(donusuCoz({ ...BASARILI, procreturncode: "", response: "" }, false).durum, "basarisiz");
});

test("hata mesajı en açıklayıcı alandan seçiliyor", () => {
  const sonuc = donusuCoz({ mdstatus: "0", mderrormessage: "Şifre hatalı", errmsg: "genel", hostmsg: "host" }, false);
  assert.equal(sonuc.durum, "basarisiz");
  if (sonuc.durum !== "basarisiz") return;
  assert.equal(sonuc.mesaj, "Şifre hatalı");
});

test("hiçbir açıklama yoksa boş mesaj değil, anlaşılır bir cümle", () => {
  const sonuc = donusuCoz({ mdstatus: "" }, false);
  assert.equal(sonuc.durum, "basarisiz");
  if (sonuc.durum !== "basarisiz") return;
  assert.ok(sonuc.mesaj.length > 10, "boş mesaj ekrana basılamaz");
});
