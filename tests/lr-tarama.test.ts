import assert from "node:assert/strict";
import test from "node:test";
import { lrFiyatlariniTara } from "@/lib/lr/tarama";

/*
  Tarama BAŞKASININ SUNUCUSUNA istek atıyor: sınırları burada sabitleniyor.
  Sayfa sayısı ya da süre kaçarsa hem işlev ortada kesilir hem de LR'a
  gereksiz yük bineriz.

  Ağ yok: getir taklit ediliyor.
*/

const kart = (sku: string, fiyat: string) =>
  `<article class="product-element"><a href="?productAlias=${sku}"></a><h3><a>Ürün ${sku}</a></h3>` +
  `<div class="price"><span>${fiyat} ₺</span></div></article>`;

const sayfa = (baglar: string[], kartlar: string) =>
  baglar.map((b) => `<a href="${b}">k</a>`).join("") + kartlar;

function sunucu(sayfalar: Record<string, string>) {
  const istekler: string[] = [];
  const getir = async (adres: string) => {
    istekler.push(adres);
    const html = sayfalar[adres];
    return html === undefined ? { durum: 404, html: "", adres } : { durum: 200, html, adres };
  };
  return { getir: getir as never, istekler };
}

const KOK = "https://shop.lrworld.com/home/TR/tr";
const A = "https://shop.lrworld.com/cms/TR/tr/a.html";
const B = "https://shop.lrworld.com/cms/TR/tr/b.html";

test("kategoriler geziliyor, ürünler birleştiriliyor", async () => {
  const { getir, istekler } = sunucu({
    [KOK]: sayfa([A, B], kart("1-1", "10,00")),
    [A]: sayfa([], kart("2-1", "20,00")),
    [B]: sayfa([], kart("3-1", "30,00")),
  });
  const sonuc = await lrFiyatlariniTara({ getir });
  assert.deepEqual(sonuc.satirlar.map((s) => s.sku).sort(), ["1-1", "2-1", "3-1"]);
  assert.equal(sonuc.gezilen, 3);
  assert.equal(sonuc.hata, null);
  assert.equal(istekler.length, 3, "her sayfa bir kez");
});

test("AYNI SAYFA iki kez gezilmiyor", async () => {
  const { getir, istekler } = sunucu({
    [KOK]: sayfa([A, A, B], ""),
    [A]: sayfa([B, KOK], kart("2-1", "20,00")),
    [B]: sayfa([A], kart("3-1", "30,00")),
  });
  await lrFiyatlariniTara({ getir });
  assert.deepEqual(istekler, [KOK, A, B]);
});

test("SAYFA SINIRI aşılmıyor, kalan bildiriliyor", async () => {
  const cok = Array.from({ length: 30 }, (_, i) => `https://shop.lrworld.com/cms/TR/tr/${i}.html`);
  const sayfalar: Record<string, string> = { [KOK]: sayfa(cok, "") };
  for (const adres of cok) sayfalar[adres] = sayfa([], kart(`${adres.length}-1`, "5,00"));
  const { getir, istekler } = sunucu(sayfalar);

  const sonuc = await lrFiyatlariniTara({ getir, enFazlaSayfa: 5 });
  assert.equal(istekler.length, 5);
  assert.equal(sonuc.gezilen, 5);
  assert.ok(sonuc.kalan > 0, "gezilemeyen sayfa sayısı bildiriliyor");
});

test("SÜRE BÜTÇESİ dolunca duruyor", async () => {
  const cok = Array.from({ length: 10 }, (_, i) => `https://shop.lrworld.com/cms/TR/tr/${i}.html`);
  const sayfalar: Record<string, string> = { [KOK]: sayfa(cok, "") };
  for (const adres of cok) sayfalar[adres] = sayfa([], kart(`${adres.length}-1`, "5,00"));
  const { getir, istekler } = sunucu(sayfalar);

  /* Her sayfa 10 sn sürüyormuş gibi; bütçe 25 sn. */
  let saat = 0;
  const simdi = () => (saat += 10_000);
  await lrFiyatlariniTara({ getir, sureMs: 25_000, simdi });
  assert.ok(istekler.length <= 3, `bütçe aşıldı: ${istekler.length} istek`);
});

test("BAŞLANGIÇ SAYFASI açılmazsa hata dönüyor, boş liste değil", async () => {
  /*
    Boş liste "LR'da ürün kalmamış" gibi okunur ve panelde sessizce
    hiçbir şey olmaz.
  */
  const { getir } = sunucu({});
  const sonuc = await lrFiyatlariniTara({ getir });
  assert.match(sonuc.hata ?? "", /HTTP 404/);
  assert.deepEqual(sonuc.satirlar, []);
});

test("bir kategori düşerse tarama sürüyor", async () => {
  const { getir } = sunucu({
    [KOK]: sayfa([A, B], ""),
    [B]: sayfa([], kart("3-1", "30,00")),
  });
  const sonuc = await lrFiyatlariniTara({ getir });
  assert.deepEqual(sonuc.satirlar.map((s) => s.sku), ["3-1"]);
  assert.equal(sonuc.hata, null);
});
