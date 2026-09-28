// Liste yoğunluğu ölçümü: node scripts/olc-yogunluk.mjs
//
// NEDEN VAR. "Ekranda kaç kayıt görünüyor" panelin en çok konuşulan
// ama en az ölçülen özelliği. Siparişler ekranında bir kez elle
// ölçülmüştü (27.09.2026: 900px'lik ekranda ilk satır 595. pikselde
// başlıyor, 40 kayıttan 4'ü görünüyordu) ve o ölçüm bir düzeltmeye yol
// açtı. Diğer listelerde hiç ölçülmedi; yoğunluk kararları göz kararı
// veriliyordu.
//
// Bu betik panelin GERÇEK CSS'ini alıp temsili bir liste çiziyor ve
// tarayıcıda ölçüyor: ilk satır kaçıncı pikselde başlıyor, ekrana kaç
// satır sığıyor. Canlı veriye ya da çalışan sunucuya ihtiyaç yok, yani
// her değişiklikten sonra tekrar koşturulabiliyor.
//
// Ölçtüğü şey CSS'in kendisi; veriyle gelen sarmalanan uzun başlıklar
// gibi durumları kapsamaz. Amaç mutlak doğruluk değil, bir değişikliğin
// yoğunluğu hangi yöne kaç piksel taşıdığını görebilmek.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/*
  playwright PROJE BAĞIMLILIĞI DEĞİL: yalnızca bu ölçüm için gerekiyor
  ve derlemeye, teste, dağıtıma girmemeli. Küresel kurulum da kabul
  ediliyor; bulunamazsa ne yapılacağı söyleniyor.
*/
const { chromium } = await import("playwright").catch(async () => {
  const { createRequire } = await import("node:module");
  const gerekli = createRequire(import.meta.url);
  for (const yol of ["/opt/node22/lib/node_modules/playwright/index.js", "playwright"]) {
    try { return gerekli(yol); } catch { /* sıradaki */ }
  }
  console.error("playwright bulunamadı. Kurulum: npm i -D playwright  (ya da küresel)");
  process.exit(2);
});

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oku = (p) => fs.readFileSync(path.join(kok, p), "utf8");

const stiller = [
  "src/app/globals.css",
  "src/app/(panel)/panel-tokens.css",
  "src/app/(panel)/design.css",
  "src/app/(panel)/panel.css",
]
  .map(oku)
  .join("\n");

/** Ölçülen listeler: kendi modül CSS'i ve satır işaretlemesiyle. */
const LISTELER = [
  {
    ad: "Siparişler",
    css: "src/app/(panel)/siparisler/orders.css",
    kap: "ac table list-table order-table",
    basliklar: ["", "SİPARİŞ", "MÜŞTERİ", "TUTAR", "KÂR", "DURUM", "KARGO", ""],
    hucreler: ["list-check", "order-cell-main", "order-cell-customer", "order-amount", "order-profit", "order-status", "order-shipping", "order-action"],
  },
  {
    ad: "Ürünler",
    css: "src/app/(panel)/catalog.css",
    kap: "ac table list-table product-list",
    basliklar: ["", "", "ÜRÜN", "FİYAT", "MARJ", "STOK", "DURUM"],
    hucreler: ["list-check", "pl-thumb", "pl-name", "pl-price", "pl-margin", "pl-stock", "pl-status"],
  },
  {
    ad: "Müşteriler",
    css: "src/app/(panel)/musteriler/customers.css",
    kap: "ac table list-table customer-list",
    basliklar: ["", "MÜŞTERİ", "SİPARİŞ", "HARCAMA", "SON ALIŞVERİŞ", "ETİKET"],
    hucreler: ["cl-avatar", "cl-name", "cl-orders", "cl-spent", "cl-last", "cl-tags"],
    sekme: true,
  },
  {
    ad: "Stok",
    css: "src/app/(panel)/catalog.css",
    kap: "ac table list-table stock-list",
    basliklar: ["VARYANT", "SKU", "ADET", "POLİTİKA", ""],
    hucreler: ["sl-name", "sl-sku", "sl-qty", "sl-policy", "sl-adjust"],
    sekme: true,
  },
  {
    ad: "Koleksiyonlar",
    css: "src/app/(panel)/modules.css",
    kap: "ac table list-table collection-list",
    basliklar: ["KOLEKSİYON", "KAYNAK", "ÜRÜN", "DURUM"],
    hucreler: ["col-name", "col-source", "col-count", "col-status"],
    sekme: true,
  },
  {
    ad: "İndirimler",
    css: "src/app/(panel)/modules.css",
    kap: "ac table list-table discount-product-list",
    basliklar: ["ÜRÜN / VARYANT", "ESKİ FİYAT", "YENİ FİYAT", "İNDİRİM", "ROZET", ""],
    hucreler: ["dl-name", "dl-old", "dl-new", "dl-rate", "dl-badge", "dl-edit"],
    sekme: false,
  },
];

/*
  Hücre içeriği gerçek işaretlemeyi taklit ediyor. Kutucuk ve görsel
  kendi boyutlarını taşıyor; eylem hücresi bir düğme.

  data-manage KAPSAYICIDA ŞART: ızgara şablonu ona bakıyor ve
  şablonda adı geçmeyen bir grid-area sessizce İKİNCİ BİR SATIR
  açıyor. İlk ölçümde eylem hücresini data-manage olmadan çizmiştim
  ve satır 105px göründü; gerçek kodda ikisi de aynı canManage'e
  bağlı olduğu için böyle bir hal oluşmuyor.
*/
const satirIcerigi = (sinif) => {
  if (sinif === "list-check") return '<input type="checkbox">';
  if (sinif === "pl-thumb" || sinif === "cl-avatar") return "<b>AB</b>";
  if (sinif === "order-action") return '<button class="row-action">Hazırla →</button>';
  if (sinif === "sl-adjust") return '<button class="ac-btn">+ Giriş</button><button class="ac-btn">− Çıkış</button>';
  if (sinif === "dl-edit") return '<a>Düzenle →</a>';
  /* Rozet taşıyan hücreler tek satırlık: ikinci satır uydurmak boyu şişirirdi. */
  if (["pl-stock", "cl-tags", "col-count", "col-status", "dl-rate", "dl-badge", "sl-qty", "sl-policy"].includes(sinif)) {
    return '<em class="ac-tag">Örnek</em>';
  }
  return "<b>Örnek değer</b><small>ikincil satır</small>";
};

function belge(liste, modulCss) {
  /* Başlık hücreleri DÜZ METİN: gerçek .th'de b/small yok, iki satır olmuyor. */
  const th = liste.basliklar
    .map((b, i) => `<span class="${liste.hucreler[i]}">${b}</span>`)
    .join("");
  const satir = liste.hucreler.map((s) => `<span class="${s}">${satirIcerigi(s)}</span>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0}
    ${stiller}
    ${modulCss}
  </style></head><body><div class="panel-root"><div class="panel-shell"><main class="panel-content">
    <div class="ac-bar"><div><h1>${liste.ad}</h1><p>Örnek alt başlık · 128 kayıt</p></div>
      <div class="ac-bar-actions"><a class="ac-btn ac-btn-primary">+ Yeni</a></div></div>
    <section class="ac ac-pad-sm list-toolbar">
      <form class="ac-filter" style="flex:1 1 380px"><input placeholder="Ara"><button class="ac-btn ac-btn-primary">Ara</button></form>
      <nav class="ac-filter"><a class="ac-btn">Bugün</a><a class="ac-btn">7 gün</a><a class="ac-btn">30 gün</a><a class="ac-btn">Tümü</a></nav>
    </section>
    ${liste.sekme === false ? "" : `<nav class="ac-filter"><a class="ac-btn">Tümü<span class="ac-count">128</span></a><a class="ac-btn">Bekleyen<span class="ac-count">12</span></a><a class="ac-btn">Hazırlanan<span class="ac-count">7</span></a><a class="ac-btn">Tamamlanan<span class="ac-count">109</span></a></nav>`}
    <section class="${liste.kap}" data-manage>
      <div class="list-row th" id="ilk-baslik">${th}</div>
      ${Array.from({ length: 40 }, () => `<div class="list-row">${satir}</div>`).join("")}
    </section>
  </main></div></div></body></html>`;
}

const ekranlar = [
  { ad: "1440×900 (dizüstü)", genislik: 1440, yukseklik: 900 },
  { ad: "1280×800 (küçük dizüstü)", genislik: 1280, yukseklik: 800 },
];

const tarayici = await chromium.launch();
console.log("Liste yoğunluğu — CSS ölçümü\n");

for (const liste of LISTELER) {
  const html = belge(liste, oku(liste.css));
  for (const ekran of ekranlar) {
    const sayfa = await tarayici.newPage({ viewport: { width: ekran.genislik, height: ekran.yukseklik } });
    await sayfa.setContent(html);
    const olcum = await sayfa.evaluate(() => {
      const satirlar = [...document.querySelectorAll(".list-row:not(.th)")];
      const ilk = satirlar[0].getBoundingClientRect();
      const yukseklik = satirlar[1].getBoundingClientRect().top - ilk.top;
      const gorunen = satirlar.filter((s) => s.getBoundingClientRect().bottom <= window.innerHeight).length;
      return { ilkSatirUst: Math.round(ilk.top), satirYuksekligi: Math.round(yukseklik), gorunen };
    });
    console.log(
      `${liste.ad.padEnd(12)} ${ekran.ad.padEnd(26)} ` +
        `ilk satır ${String(olcum.ilkSatirUst).padStart(4)}px · ` +
        `satır ${String(olcum.satirYuksekligi).padStart(3)}px · ` +
        `görünen ${olcum.gorunen}`,
    );
    await sayfa.close();
  }
}

await tarayici.close();
