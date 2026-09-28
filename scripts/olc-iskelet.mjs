// İskelet ↔ sayfa şekli ölçümü: node scripts/olc-iskelet.mjs
//
// NEDEN VAR. İskeletin işi "bir şey yükleniyor" demek değil, GELECEK
// ŞEYİN YERİNİ TUTMAK. Tutmazsa sayfa yerleşmiş gibi görünüp içerik
// gelince sıçrıyor — iskeletin önlemesi gereken şeyin ta kendisi.
//
// 28.09.2026'da ölçüldüğünde liste iskeletinin ilk satırı gerçek
// sayfadan 65 PİKSEL, ızgara iskeletininki 120 PİKSEL yukarıdaydı ve
// bunu kimse görmüyordu: iskelet göz açıp kapayana kadar geçiyor,
// sıçrama ise "sayfa biraz zıpladı" diye hissediliyor.
//
// Ölçüm gerçek CSS'i alıp iskelet ile sayfanın temsili bir örneğini
// yan yana çiziyor ve ilk satırın/ilk kutunun kaçıncı pikselde
// başladığını karşılaştırıyor. Canlı veriye ya da çalışan sunucuya
// gerek yok.
//
// Kapsamı: yerleşim geometrisi. Veriyle gelen sarmalanan uzun
// başlıklar gibi durumları ölçmez.

import fs from "node:fs"; import path from "node:path";
const { chromium } = await import("playwright").catch(async () => {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright/index.js");
});
const kok=path.resolve(path.dirname(new URL(import.meta.url).pathname),".."); const oku=(p)=>fs.readFileSync(path.join(kok,p),"utf8");
const css=(ek)=>["src/app/globals.css","src/app/(panel)/panel-tokens.css","src/app/(panel)/design.css","src/app/(panel)/panel.css",ek].map(oku).join("\n");
const img="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#89a"/></svg>').toString("base64");
const basIsk=`<section class="ac-bar"><div><div class="skel skel-title"></div><div class="skel skel-sub"></div></div></section>`;

const LISTE_ISK=`${basIsk}<div class="ac-stack">
<section class="ac ac-pad-sm list-toolbar"><div class="skel skel-search"></div><div class="skel skel-pill"></div><div class="skel skel-pill"></div></section>
<nav class="ac-filter skel-tabs">${Array.from({length:4},()=>'<div class="skel skel-tab"></div>').join("")}</nav>
<section class="ac table list-table skel-list"><div class="skel skel-list-head"></div>${Array.from({length:8},()=>'<div class="skel skel-list-row"></div>').join("")}</section></div>`;
const LISTE_GER=`<section class="ac-bar"><div><h1>Siparişler</h1><p>128 sipariş · Tüm zamanlar · satıra tıklayarak detayı açın</p></div></section>
<div class="ac-stack"><section class="ac ac-pad-sm list-toolbar"><form class="ac-filter order-search"><input placeholder="Sipariş no"><button class="ac-btn ac-btn-primary" type="button">Ara</button></form>
<nav class="ac-filter"><a class="ac-btn" href="#">Tümü</a><a class="ac-btn" href="#">Bugün</a></nav></section>
<nav class="ac-filter"><a class="ac-btn" href="#">Tümü<span class="ac-count">128</span></a><a class="ac-btn" href="#">Bekliyor<span class="ac-count">7</span></a></nav>
<section class="ac table list-table order-table"><div class="list-row th"><span>SİPARİŞ</span></div>${Array.from({length:8},()=>'<div class="list-row"><span>satır</span></div>').join("")}</section></div>`;

const IZG_ISK=`${basIsk}<div class="ac-stack">
<section class="ac ac-pad-sm list-toolbar"><div class="skel skel-search"></div><div class="skel skel-pill"></div></section>
<section class="ac ac-pad"><div class="skel-izgara">${Array.from({length:18},()=>'<div class="skel skel-kare"></div>').join("")}</div></section></div>`;
const IZG_GER=`<section class="ac-bar"><div><h1>Medya</h1><p>312 görsel · ürün sayfalarında kullanılan tüm fotoğraflar</p></div></section>
<div class="ac-stack"><section class="ac ac-pad-sm list-toolbar"><form class="ac-filter medya-ara"><input placeholder="Ürün adına göre ara"><button class="ac-btn ac-btn-primary" type="button">Ara</button></form></section>
<section class="ac ac-pad medya-kap"><div class="medya-izgara">${Array.from({length:18},()=>`<a class="medya-kart" href="#"><span class="medya-gorsel"><img src="${img}" alt=""></span><span class="medya-ad">Ürün</span><span class="medya-alt">Aktif · 1. görsel</span></a>`).join("")}</div></section></div>`;

const b=await chromium.launch();
const olc=async(ic,sec,ek)=>{const s=await b.newPage({viewport:{width:1440,height:900}});
  await s.setContent(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${css(ek)}body{margin:0;background:var(--bg)}</style></head><body><div class="panel-root"><div style="padding:24px;max-width:1180px">${ic}</div></div></body></html>`);
  const o=await s.evaluate((sec)=>{
    const h=(x)=>{const e=document.querySelector(x);return e?Math.round(e.getBoundingClientRect().height):null;};
    return {ust:Math.round(document.querySelector(sec).getBoundingClientRect().top),
            bar:h(".ac-bar"), arac:h(".ac-stack>section:first-child"), serit:h(".ac-stack>nav.ac-filter"), stack:h(".ac-stack")};
  },sec);
  await s.close(); return o;};
const a=await olc(LISTE_ISK,".skel-list-row","src/app/(panel)/siparisler/orders.css");
const g=await olc(LISTE_GER,".list-row:not(.th)","src/app/(panel)/siparisler/orders.css");
const rapor=(ad,i,g)=>{const sapma=Math.abs(i.ust-g.ust);
  console.log(`${ad.padEnd(7)} iskelet ${String(i.ust).padStart(4)}px · gerçek ${String(g.ust).padStart(4)}px · sapma ${sapma}px ${sapma<=4?"✓":"✗"}`);
  return sapma;};
let kotu=0; kotu+=rapor("Liste",a,g)>4?1:0;
const c=await olc(IZG_ISK,".skel-kare","src/app/(panel)/medya/medya.css");
const d=await olc(IZG_GER,".medya-gorsel","src/app/(panel)/medya/medya.css");
kotu+=rapor("Izgara",c,d)>4?1:0;
if(kotu){console.error("\nİskelet sayfanın yerini tutmuyor; sayfa gelince sıçrayacak.");process.exitCode=1;}
await b.close();
