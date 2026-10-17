import assert from "node:assert/strict";
import test from "node:test";
import {
  DEGISKENLER,
  SABLON_ANAHTARLARI,
  SABLON_KAYDI,
  metindekiDegiskenler,
  sablonuCoz,
  sablonuUygula,
  taninmayanDegiskenler,
} from "@/lib/eposta-sablonu";

/*
  Müşteri postalarının metni kiracının; zarf (logo, renk, altbilgi)
  kodda kalıyor. En kritik kural: ŞABLON YOKSA BUGÜNKÜ METİN. Hiçbir
  kiracı bir şey yazmadığı sürece postalar birebir aynı kalmalı,
  yoksa bu özellik sessizce bütün mağazaların postalarını değiştirir.
*/
test("kayıt yoksa varsayılan metin aynen dönüyor", () => {
  for (const anahtar of SABLON_ANAHTARLARI) {
    const cozulen = sablonuCoz(anahtar, null)!;
    assert.deepEqual(cozulen, SABLON_KAYDI[anahtar].varsayilan, `${anahtar}: varsayılan değişti`);
  }
});

test("boş ya da boşluktan oluşan alan varsayılana düşüyor", () => {
  /* Kiracı bir alanı temizlerse posta boş gitmemeli. */
  const cozulen = sablonuCoz("fulfilled", { baslik: "   ", govde: "" })!;
  assert.deepEqual(cozulen, SABLON_KAYDI.fulfilled.varsayilan);
});

test("kiracının metni varsayılanı eziyor", () => {
  const cozulen = sablonuCoz("fulfilled", { baslik: "Gönderiniz yola çıktı", govde: "Paketiniz kuryede." })!;
  assert.equal(cozulen.baslik, "Gönderiniz yola çıktı");
  assert.equal(cozulen.govde, "Paketiniz kuryede.");
});

test("tanınmayan anahtar null dönüyor", () => {
  /* Panelde silinmiş ya da yeniden adlandırılmış bir anahtar
     kalmışsa posta üretilmemeli. */
  assert.equal(sablonuCoz("boyle_bir_posta_yok", { baslik: "x", govde: "y" }), null);
});

test("değişkenler yerleştiriliyor", () => {
  const sonuc = sablonuUygula(
    { baslik: "{{magaza}} · {{siparis_no}}", govde: "Merhaba {{musteri}}, {{tutar}} ödemeniz alındı." },
    { magaza: "Örnek", siparis_no: "AC-1", musteri: "Ayşe", tutar: "100 TL" },
  );
  assert.equal(sonuc.baslik, "Örnek · AC-1");
  assert.equal(sonuc.govde, "Merhaba Ayşe, 100 TL ödemeniz alındı.");
});

test("boşluklu yazım da tanınıyor", () => {
  /* Panelde elle yazılırken "{{ musteri }}" olması olağan. */
  const sonuc = sablonuUygula({ baslik: "{{ musteri }}", govde: "{{  siparis_no  }}" }, { musteri: "Ayşe", siparis_no: "AC-1" });
  assert.equal(sonuc.baslik, "Ayşe");
  assert.equal(sonuc.govde, "AC-1");
});

test("değeri olmayan değişken OLDUĞU GİBİ kalıyor", () => {
  /*
    Sessizce boşluk bırakmak daha kötü: "Takip numaranız: " diye
    yarım bir cümle gider ve kimse fark etmez. Ham değişken görünürse
    biri fark eder.
  */
  const sonuc = sablonuUygula({ baslik: "x", govde: "Takip: {{takip_no}}" }, { musteri: "Ayşe" });
  assert.equal(sonuc.govde, "Takip: {{takip_no}}");
});

test("tanınmayan değişken kaydetmeden önce bildiriliyor", () => {
  const eksik = taninmayanDegiskenler("fulfilled", { baslik: "{{magaza}}", govde: "{{takip_no}} ve {{uydurma}}" });
  /* fulfilled şablonunda takip_no yok: o posta takip numarası
     girilmediğinde gidiyor. */
  assert.deepEqual(eksik.sort(), ["takip_no", "uydurma"]);
});

test("izinli değişkenler sorun sayılmıyor", () => {
  assert.deepEqual(taninmayanDegiskenler("fulfilled", { baslik: "{{magaza}}", govde: "Merhaba {{musteri}}, {{siparis_no}}" }), []);
});

test("her şablonun değişkenleri örnek değer tablosunda var", () => {
  /* Panel önizlemesi DEGISKENLER'den besleniyor; listede olmayan bir
     değişken önizlemede ham kalır. */
  for (const [anahtar, tanim] of Object.entries(SABLON_KAYDI)) {
    for (const ad of tanim.degiskenler) {
      assert.ok(ad in DEGISKENLER, `${anahtar}: ${ad} örnek değer tablosunda yok`);
    }
  }
});

test("metindeki değişkenler listelenebiliyor", () => {
  assert.deepEqual(metindekiDegiskenler("{{a_b}} ve {{c}} ve tekrar {{a_b}}"), ["a_b", "c", "a_b"]);
});
