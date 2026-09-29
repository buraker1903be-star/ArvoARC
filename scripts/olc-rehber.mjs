// Kurulum rehberi ölçümü: node scripts/olc-rehber.mjs
//
// NEDEN VAR. Bu kart, yeni bir kiracının panelde gördüğü İLK şey.
// 29.09.2026'da ilk kez gerçek CSS ile çizdirildiğinde üç kusur çıktı
// ve üçü de yalnızca HİÇBİR ADIMI BİTMEMİŞ mağazada görünüyordu —
// yani tam olarak kartın var olma sebebi olan durumda:
//
//   1. İlerleme çubuğunun zemini var(--surface-2) idi ve kart zemini de
//      açık; dolu kısım sıfırken çubuk tamamen kayboluyor, "0 / 6" ile
//      "adım tamam" arasında anlamsız bir boşluk kalıyordu.
//   2. Düğmeler metne göre 83–118px arasında değişiyor, sağa yaslı
//      sütunun sol kenarı tırtıklı çıkıyordu.
//   3. Başlık paragrafı tek kelimelik ikinci satıra düşüyordu.
//
// Üçü de "biraz dağınık" diye hissedilen, kimsenin hata olarak
// bildirmediği türden. Ölçü olmadan geri gelirler.
//
// Kapsamı: yerleşim ve okunurluk. Renk seçimini değerlendirmez.

import fs from "node:fs"; import path from "node:path";
const { chromium } = await import("playwright").catch(async () => {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright/index.js");
});

const kok = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const oku = (p) => fs.readFileSync(path.join(kok, p), "utf8");
const css = ["src/app/globals.css", "src/app/(panel)/panel-tokens.css", "src/app/(panel)/design.css",
  "src/app/(panel)/panel.css", "src/app/(panel)/dashboard.css"].map(oku).join("\n");

/* Adımlar ve etiketler kaynağın kendisinden: etiket uzarsa ölçü onu görsün. */
const kaynak = oku("src/lib/kurulum-adimlari.ts");
const alan = (ad) => [...kaynak.matchAll(new RegExp(`${ad}: "((?:[^"\\\\]|\\\\.)*)"`, "g"))].map((m) => m[1]);
const ADIMLAR = alan("baslik").map((baslik, i) => ({ baslik, aciklama: alan("aciklama")[i], eylem: alan("eylem")[i] }));
if (ADIMLAR.length < 4) throw new Error("kurulum adımları okunamadı; lib/kurulum-adimlari.ts değişmiş olabilir");

const tik = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
const kart = (tamamSayisi) => {
  const toplam = ADIMLAR.length;
  const siradaki = ADIMLAR[tamamSayisi]?.baslik;
  const satirlar = ADIMLAR.map((adim, i) => {
    const tamam = i < tamamSayisi, sirada = adim.baslik === siradaki;
    return `<li ${tamam ? 'data-tamam=""' : ""} ${sirada ? 'data-sirada=""' : ""}>
      <span class="kurulum-isaret">${tamam ? tik : ""}</span>
      <span class="kurulum-metin"><b>${adim.baslik}</b>${sirada ? `<small>${adim.aciklama}</small>` : ""}</span>
      ${tamam ? '<span class="kurulum-durum">Tamam</span>' : `<a class="ac-btn ${sirada ? "ac-btn-primary" : ""}" href="#">${adim.eylem}</a>`}
    </li>`;
  }).join("");
  return `<section class="kurulum"><div class="kurulum-head"><div><span class="panel-kicker">KURULUM</span>
    <h2>Mağazanı satışa hazırla</h2>
    <p>Bu adımlar tamamlanmadan müşteri sipariş veremez. Sıradaki iş aşağıda işaretli.</p></div>
    <div class="kurulum-ilerleme"><strong>${tamamSayisi} / ${toplam}</strong>
      <span class="kurulum-bar"><span style="width:${Math.round(tamamSayisi / toplam * 100)}%"></span></span>
      <small>adım tamam</small></div></div>
    <ol class="kurulum-liste">${satirlar}</ol></section>`;
};

const tarayici = await chromium.launch();
const olc = async (tema, tamamSayisi, genislik) => {
  const sayfa = await tarayici.newPage({ viewport: { width: genislik, height: 900 } });
  await sayfa.setContent(`<!doctype html><html data-theme="${tema}"><head><meta charset="utf-8">
    <style>${css}body{margin:0;background:var(--bg)}</style></head>
    <body><div class="panel-root"><div style="padding:24px;max-width:1180px">${kart(tamamSayisi)}</div></div></body></html>`);
  const sonuc = await sayfa.evaluate(() => {
    /*
      Chromium hesaplanmış rengi "color(srgb 0.94 0.92 0.90)" ile de
      döndürüyor; ilk yazımda hepsini 0–255 sanıp 255'e bölmüştüm ve
      ölçü ışık modunda 0.89 gibi anlamsız bir fark veriyordu. İki
      yazım da tanınıyor.
    */
    const bilesenler = (renk) => {
      const sayilar = (renk.match(/-?[\d.]+/g) ?? []).map(Number);
      if (sayilar.length < 3) return null;
      const [r, g, b] = sayilar;
      return renk.startsWith("color(") ? [r, g, b] : [r / 255, g / 255, b / 255];
    };
    const isik = (renk) => {
      const parcalar = bilesenler(renk);
      if (!parcalar) return null;
      const [r, g, b] = parcalar.map((o) => (o <= 0.03928 ? o / 12.92 : ((o + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const kart = document.querySelector(".kurulum");
    const cubuk = document.querySelector(".kurulum-bar");
    const p = document.querySelector(".kurulum-head p");
    const dugmeler = [...document.querySelectorAll(".kurulum-liste .ac-btn")];
    /*
      Kartın zemini degrade olduğu için backgroundColor saydam geliyor;
      çubuğun arkasındaki ton degradenin İLK durağı.
    */
    const degrade = getComputedStyle(kart).backgroundImage;
    const ilkDurak = degrade.match(/(?:color\(srgb[^)]*\)|rgba?\([^)]*\))/)?.[0];
    const zemin = isik(ilkDurak ?? getComputedStyle(document.body).backgroundColor);
    return {
      solKenarlar: [...new Set(dugmeler.map((d) => Math.round(d.getBoundingClientRect().left)))],
      paragrafSatir: Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)),
      /*
        Çubuğu görünür kılan iki şey var: zemini ve iç çerçevesi. Koyu
        temada zemin karta neredeyse eşit (0.0002) ve okunurluğu
        TAMAMEN çerçeve sağlıyor; yalnızca zemine bakan ilk ölçü bu
        yüzden yanlış alarm veriyordu. Büyük olan hangisiyse o.
      */
      cubukFarki: Math.max(
        Math.abs(isik(getComputedStyle(cubuk).backgroundColor) - zemin),
        Math.abs((isik(getComputedStyle(cubuk).boxShadow.match(/(?:color\(srgb[^)]*\)|rgba?\([^)]*\))/)?.[0] ?? "") ?? zemin) - zemin),
      ),
      tasma: kart.scrollWidth > kart.clientWidth,
    };
  });
  await sayfa.close();
  return sonuc;
};

/*
  EŞİK ÖLÇÜLEREK KONDU, TAHMİNLE DEĞİL. Düzeltmeden önceki hâl (zemin
  var(--surface-2), iç çerçeve yok) 0.0274 (ışık) ve 0.0086 (koyu)
  veriyordu ve çubuk gözle görünmüyordu; düzeltmeden sonra 0.2755 ve
  0.0361. Eşik ikisinin arasında: 0.008 seçseydim ölçü, düzelttiğim
  kusuru YAKALAMAZDI — ilk yazımda öyleydi, geri alıp denedim ve
  geçti.

  Koyu temadaki pay dar (0.0361 / 0.03). Çubuk koyu temada yalnızca
  çerçevesiyle okunuyor; payı büyütmek istersek çözüm eşiği indirmek
  değil, çerçeveyi güçlendirmek olur.
*/
const EN_AZ_FARK = 0.03;
let hata = 0;
for (const tema of ["light", "dark"]) {
  for (const [ad, sayi, genislik] of [["boş", 0, 1440], ["yarım", 4, 1440], ["dar", 0, 1100]]) {
    const o = await olc(tema, sayi, genislik);
    const sorunlar = [];
    if (o.solKenarlar.length > 1) sorunlar.push(`düğme sütunu tırtıklı (${o.solKenarlar.join(", ")})`);
    if (o.paragrafSatir > 2) sorunlar.push(`başlık paragrafı ${o.paragrafSatir} satır`);
    if (o.cubukFarki < EN_AZ_FARK) sorunlar.push(`boş çubuk kartla aynı tonda (${o.cubukFarki.toFixed(4)})`);
    if (o.tasma) sorunlar.push("yatay taşma");
    hata += sorunlar.length ? 1 : 0;
    console.log(
      `${tema.padEnd(5)} ${ad.padEnd(6)} ${String(genislik).padStart(4)}px  ` +
      `düğme sol ${String(o.solKenarlar[0]).padStart(4)}px · paragraf ${o.paragrafSatir} satır · ` +
      `çubuk farkı ${o.cubukFarki.toFixed(4)}  ${sorunlar.length ? "✗ " + sorunlar.join("; ") : "✓"}`,
    );
  }
}
await tarayici.close();
if (hata) { console.error(`\n${hata} durumda kusur var.`); process.exit(1); }
