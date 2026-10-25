/*
  AÇIKLAMA ÇEVİRİSİ — MODELE SORULMUYOR.

  Bu katalogda açıklama düzyazı değil bir HTML TABLOSU (ürün
  özellikleri + beden çizelgesi). Modele sormak iki kez yanlıştı:
  7b beceremiyordu (195 üründe yalnızca birinin açıklaması yazıldı)
  ve tablodaki sayılar beden-kilo eşlemesi — "49-69" yerine "49-59"
  yazılsa hiçbir yerde görünmez, müşteri yanlış beden alırdı.

  Buradaki ölçüt: SAYIYA DOKUNULMAZ, HTML BOZULMAZ, çevrilemeyen
  metin YAZILMAZ.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { aciklamaCevir, hucreCevir, kapanmayanHucreler, KAPSAM_ESIGI } from "@/lib/ceviri/aciklama";

const TABLO = `<table><tbody>
<tr><td><strong>ÜRÜN ÖZELLİKLERİ</strong></td></tr>
<tr><td><strong>Cinsiyet</strong></td><td>Erkek</td></tr>
<tr><td><strong>Kumaş</strong></td><td>%80 Pamuk - %20 Polyester</td></tr>
<tr><td><strong>S Beden</strong></td><td>49-69 Kiloya Uygun</td></tr>
<tr><td><strong>M Beden</strong></td><td>69-79 Kiloya Uygun</td></tr>
</tbody></table>`;

test("SAYILARA DOKUNULMUYOR", () => {
  /*
    Tablodaki sayılar beden-kilo eşlemesi. Bir kilonun değişmesi
    müşterinin yanlış beden alması demek ve hiçbir yerde görünmez.
    Çevirmen sayıları hiç ellemiyor — eşleme tablosunun modele göre
    asıl üstünlüğü bu.
  */
  const { html } = aciklamaCevir(TABLO);
  assert.deepEqual(html.match(/\d+/g), TABLO.match(/\d+/g));
});

test("HTML BOZULMUYOR", () => {
  /* Yalnızca metin düğümleri çevriliyor; etiket ve öznitelikler
     olduğu gibi kalıyor, yoksa tablo dağılırdı. */
  const { html } = aciklamaCevir(TABLO);
  assert.deepEqual(html.match(/<[^>]+>/g), TABLO.match(/<[^>]+>/g));
});

test("etiketler ve değerler çevriliyor", () => {
  const { html } = aciklamaCevir(TABLO);
  assert.match(html, /PRODUCT DETAILS/);
  assert.match(html, /Gender/);
  assert.match(html, /Fabric/);
  assert.match(html, /size S/);
  assert.match(html, /49-69 kg/);
  assert.doesNotMatch(html, /Kiloya/);
});

test("TÜRKÇE HARFLE BAŞLAYAN KALIP DA EŞLEŞİYOR", () => {
  /*
    CANLIDA ÖLÜ KURAL BULUNDU (23.10.2026). JavaScript'te `\b`
    ASCII sözcük karakterine göre çalışıyor ve "ş", "ç", "ü" sözcük
    karakteri SAYILMIYOR — `\bşort` hiç eşleşmiyordu. Aynı kusur
    `\bselanik\s+örgü\b` kalıbını da öldürmüştü ("ü"den sonra sınır
    yok), çıktıda "milano knit knit" tekrarı görünüyordu.

    Kusur sessizdi: ASCII harfle başlayan kurallar çalıştığı için
    denetim genel olarak "çalışıyor" görünüyordu.
  */
  assert.equal(hucreCevir("Selanik Örgü").metin, "milano knit");
  assert.equal(hucreCevir("Şardonsuz Penye").metin.toLowerCase(), "unbrushed jersey");
});

test("bilinmeyen sözcüğe DOKUNULMUYOR", () => {
  /* Marka adı ve zaten İngilizce sözcükler olduğu gibi kalıyor;
     uydurma bir karşılık yazmaktansa kaynağı korumak. */
  const { metin } = hucreCevir("Nanogold Premium Penye");
  assert.match(metin, /Nanogold/);
  assert.match(metin, /Premium/);
  assert.match(metin, /jersey/);
});

test("KAPSAM ÖLÇÜLÜYOR: düzyazı eşiği geçemiyor", () => {
  /*
    "Ürün Hikayesi" hücreleri serbest pazarlama metni ve sözcük
    sözcük çevirmek bozuk İngilizce üretir ("comfort provides").
    Kapsam eşiği bunları eliyor ve vitrin Türkçe açıklamaya düşüyor:
    yarı Türkçe bir tablo, Türkçe bir tablodan KÖTÜ — müşteri hangi
    satıra güveneceğini bilemiyor.
  */
  const duzyazi =
    "<p>Bu ürün günlük kullanımda size eşsiz bir rahatlık sağlarken " +
    "zamansız tasarımıyla gardırobunuza şıklık kazandırır.</p>";
  assert.ok(aciklamaCevir(duzyazi).kapsam < KAPSAM_ESIGI);
  /* Tablo ise rahatça geçiyor. */
  assert.ok(aciklamaCevir(TABLO).kapsam >= KAPSAM_ESIGI);
});

test("boş açıklama kapsam düşürmüyor", () => {
  /* Çevrilecek sözcük yoksa kapsam 1: bölme hatası olmasın ve boş
     açıklama "başarısız" sayılmasın. */
  assert.equal(aciklamaCevir("").kapsam, 1);
  assert.equal(aciklamaCevir("<p></p>").kapsam, 1);
});

test('"… İÇİN UYGUNDUR" DÖRT YAZIMLA DA ÇEVRİLİYOR', () => {
  /*
    25.10.2026'da ölçüldü: 497 ürünün açıklaması %85 kapsam eşiğini
    geçemiyordu ve kapanmayan en sık hücreler beden satırlarıydı.
    Tabloda aynı bilgi dört yazımla duruyor; yalnızca "Kiloya Uygun"
    tanınıyordu ve kalan üçünde "İçin Uygundur" çevrilmeden kalıp
    tek başına tabloyu eşiğin altına düşürüyordu (kilo satırları
    300'den fazla geçiş).

    Karşılık "kg"/"years": "Kiloya Uygun" ve "Yaşa Uygun" için
    seçilmiş biçimin aynısı — yoksa aynı tablonun iki satırı iki
    ayrı dille yazılırdı.

    KALIPLARIN SIRASI ÖNEMLİ ve bu test onu da tutuyor. Kurallar
    listedeki sırayla uygulanıyor; "yaş için uygundur" listenin
    SONUNA yazıldığında üstteki `(\d+)-(\d+)\s+yaş` kuralı önce
    çalışıp "2-3 Yaş"ı yiyor ve geriye "ages 2-3 İçin Uygundur"
    kalıyordu — yarı çevrilmiş bir hücre. Kural kardeşlerinin
    hemen ardına konur.
  */
  assert.equal(hucreCevir("50-65 Kiloya Uygun").metin, "50-65 kg");
  assert.equal(hucreCevir("50-65 Kilo İçin Uygundur").metin, "50-65 kg");
  assert.equal(hucreCevir("50–59 kg için uygundur.").metin, "50–59 kg");
  assert.equal(hucreCevir("2-3 Yaş İçin Uygundur").metin, "2-3 years");
  assert.equal(hucreCevir("5-6 Yaşa Uygundur").metin, "5-6 years");
  /* Sayılar her yazımda yerinde kalıyor; betiğin rakam denetimi
     bunu her kayıtta ayrıca sınıyor. */
  for (const ham of ["50-65 Kilo İçin Uygundur", "2-3 Yaş İçin Uygundur"]) {
    assert.deepEqual(hucreCevir(ham).metin.match(/\d+/g), ham.match(/\d+/g));
  }
});

test("BÜYÜK İ İLE YAZILAN KALIP DA EŞLEŞİYOR", () => {
  /*
    `/i` bayrağı Türkçe İ/i çiftini KATLAMIYOR: `su\s+itici` kalıbı
    başlık biçimli "Su İtici Mikro" hücresini hiç görmüyordu ve
    hücre çevrilmemiş sayılıyordu (22 geçiş). Aynı tuzak "kiloya"
    için lib dosyasında zaten yazılıydı; bu kalıpta gözden
    kaçmıştı.
  */
  assert.equal(hucreCevir("su itici").metin, "water-repellent");
  assert.equal(hucreCevir("Su İtici").metin, "water-repellent");
});

test("sonradan gelen kategorilerin etiketleri de tanınıyor", () => {
  /* Gözlük, saat, parfüm ve pijama kataloğa sonradan girdi; tablo
     yalnızca giyim sözcüklerini tanıyordu. */
  for (const [tr, en] of [
    ["Materyal Bileşeni", "Material composition"],
    ["Kutu İçeriği", "Box contents"],
    ["İade Koşulları", "Returns policy"],
    ["Çerçeve Rengi", "Frame colour"],
    ["Garanti Süresi", "Warranty period"],
    ["Türkiye", "Turkey"],
  ] as const) {
    assert.equal(hucreCevir(tr).metin, en, tr);
  }
});

/*
  TABLONUN İÇİNDEKİ DÜZYAZI — MODELE KALAN KISIM (25.10.2026).

  Eşleme tablosu kapalı bir dağarcık tanıyor. Katalogda aynı HTML
  tablosunun içinde pazarlama cümleleri de var ("Kış aylarında
  şıklığı ve sıcaklığı bir arada sunan…") ve onları sözcük sözcük
  çevirmek bozuk İngilizce üretiyor — kapsam eşiği o ürünleri
  eliyordu: 497 üründe 853 kapanmayan hücre, 399'u cümle.

  Çözüm iş bölümü: hücre eşleme tablosuna sığıyorsa orada çevriliyor,
  sığmıyorsa MODELE soruluyor ve karşılığı sözlükle geri veriliyor
  (scripts/aciklama-modelle.mjs). Bu dosya saf kalıyor: ağ yok.
*/
const DUZYAZILI = `<table><tbody>
<tr><td><strong>Cinsiyet</strong></td><td>Erkek</td></tr>
<tr><td colspan="2">Kış aylarında şıklığı ve sıcaklığı bir arada sunar.</td></tr>
</tbody></table>`;

test("KAPANMAYAN HÜCRELER sorulacak parçaları veriyor", () => {
  const parcalar = kapanmayanHucreler(DUZYAZILI);
  assert.deepEqual(parcalar, ["Kış aylarında şıklığı ve sıcaklığı bir arada sunar."]);
  /* Eşleme tablosunun kapattığı hücre sorulmuyor: "Cinsiyet" ve
     "Erkek" zaten çevriliyor, modele sormak hem para hem risk. */
  assert.ok(!parcalar.some((p) => /Cinsiyet|Erkek/.test(p)));
});

test("içinde Türkçe sözcük olmayan hücre SORULMUYOR", () => {
  /* Sayı, yüzde, marka adı ve zaten İngilizce metin çevrilmemiş
     sayılmıyor; sormak uydurma bir karşılık davet etmek olurdu. */
  assert.deepEqual(kapanmayanHucreler("<td>%80 Cotton - 42 cm</td>"), []);
  assert.deepEqual(kapanmayanHucreler("<td>Polyester</td>"), []);
});

test("aynı cümle bir kez soruluyor", () => {
  /* Katalogda aynı paragraf onlarca üründe tekrar ediyor (947
     geçiş / 399 benzersiz). Tekrarı ayıklamak işi iki buçuk kat
     küçültüyor. */
  const iki = `<td>Kış aylarında şıklığı ve sıcaklığı bir arada sunar.</td>` +
    `<td>Kış aylarında   şıklığı ve sıcaklığı bir arada sunar.</td>`;
  assert.equal(kapanmayanHucreler(iki).length, 1, "boşluk farkı ayrı parça sayılmamalı");
});

test("SÖZLÜKTEKİ KARŞILIK yerine konuyor ve kapsamı tamamlıyor", () => {
  const once = aciklamaCevir(DUZYAZILI);
  assert.ok(once.kapsam < KAPSAM_ESIGI, "düzyazı tek başına eşiği düşürüyor");

  const sozluk = new Map([[
    "Kış aylarında şıklığı ve sıcaklığı bir arada sunar.",
    "Combines style and warmth through the winter months.",
  ]]);
  const sonra = aciklamaCevir(DUZYAZILI, sozluk);
  assert.match(sonra.html, /Combines style and warmth/);
  assert.ok(!sonra.html.includes("Kış aylarında"));
  assert.ok(sonra.kapsam >= KAPSAM_ESIGI);
  /* HTML bozulmuyor: etiketler ve öznitelikler yerinde. */
  assert.match(sonra.html, /<td colspan="2">/);
});

test("sözlükte olmayan hücre yine EŞLEME TABLOSUNA düşüyor", () => {
  /* Model bir parçayı çeviremediyse (denetimden geçmediyse)
     sözlüğe hiç girmiyor; o hücre Türkçe kalıyor ve kapsam
     düştüğü için ürün yazılmıyor. Yarım çeviri yazmaktansa
     Türkçe bırakmak. */
  const sonuc = aciklamaCevir(DUZYAZILI, new Map());
  /* Eşleme tablosu cümleyi YARIM çeviriyor ("winter aylarında
     şıklığı and sıcaklığı…") ve bu tam olarak yazılmaması gereken
     şey; kapsam oranı onu eliyor. */
  assert.ok(/aylarında|şıklığı/.test(sonuc.html), "Türkçe sözcük kalmalı");
  assert.ok(sonuc.kapsam < KAPSAM_ESIGI);
});

test("sözlük SAYILARA dokunmuyor", () => {
  const ham = `<td>50-65 Kilo İçin Uygundur</td><td>Günlük kullanımda rahatlık sağlar.</td>`;
  const sozluk = new Map([["Günlük kullanımda rahatlık sağlar.", "Comfortable for everyday wear."]]);
  const { html } = aciklamaCevir(ham, sozluk);
  assert.deepEqual(html.match(/\d+/g), ham.match(/\d+/g));
});
