import assert from "node:assert/strict";
import test from "node:test";
import { KARGO_FIRMALARI, kargoFirmasiAdi, takipAdresi } from "@/lib/kargo-firmalari";

/*
  Takip bağlantısı. Sınanan şey adreslerin doğruluğu DEĞİL (firmalar sorgu
  sayfalarını haber vermeden değiştiriyor); elle girilmiş adresin şablonun
  önüne geçmesi ve şablonu olmayan firmada uydurma bağlantı üretilmemesi.
*/

test("bilinen firmada numara şablona yerleşiyor", () => {
  assert.equal(
    takipAdresi("yurtici", "1234567890"),
    "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890",
  );
});

test("ELLE GİRİLEN adres şablonun önüne geçiyor", () => {
  // Şablon eskimiş olabilir; kullanıcı doğrusunu yazdıysa o kullanılır.
  assert.equal(takipAdresi("yurtici", "123", "https://ozel.example/takip/123"), "https://ozel.example/takip/123");
});

test("şablonu olmayan firmada bağlantı UYDURULMUYOR", () => {
  // Boş sayfaya giden bir bağlantı, bağlantı olmamasından kötü.
  assert.equal(takipAdresi("diger", "123"), null);
  assert.equal(takipAdresi("bilinmeyen-firma", "123"), null);
});

test("numara yoksa bağlantı yok", () => {
  assert.equal(takipAdresi("yurtici", null), null);
  assert.equal(takipAdresi("yurtici", "   "), null);
});

test("numaradaki özel karakterler kaçışlanıyor", () => {
  /*
    Adres satırına doğrudan yazılan numara sorguyu bozabilir. Örnek
    firma Sürat'tan YURTİÇİ'ne alındı: Sürat'ın takip formu yalnızca
    POST kabul ettiği için şablonunda artık {no} yok (27.09.2026'da
    canlıda sınandı, lib/kargo-firmalari.ts).
  */
  assert.match(takipAdresi("yurtici", "12 34&x")!, /12%2034%26x$/);
});

test("numara taşımayan şablonda adres olduğu gibi kalıyor", () => {
  /*
    Sürat, MNG ve PTT numarayı adresten okumuyor; şablonda {no} yok.
    Bağlantı yine de doğru takip sayfasına gidiyor ve numara ekranda
    bağlantının yanında yazılı.
  */
  assert.equal(takipAdresi("surat", "12345"), "https://www.suratkargo.com.tr/KargoTakip/");
  assert.match(takipAdresi("mng", "12345")!, /dhlecommerce\.com\.tr\/gonderitakip$/);
});

test("firma adı koddan çözülüyor, bilinmeyen kod olduğu gibi kalıyor", () => {
  assert.equal(kargoFirmasiAdi("surat"), "Sürat Kargo");
  assert.equal(kargoFirmasiAdi("bilinmeyen"), "bilinmeyen");
  assert.equal(kargoFirmasiAdi(null), "—");
});

test("her firmanın kodu benzersiz", () => {
  const kodlar = KARGO_FIRMALARI.map((firma) => firma.kod);
  assert.equal(new Set(kodlar).size, kodlar.length);
});
