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
import { aciklamaCevir, hucreCevir, KAPSAM_ESIGI } from "@/lib/ceviri/aciklama";

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
