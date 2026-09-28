// CSS denetimi: npm run check:css
//
// NEDEN VAR. 28.09.2026'da bir toplu yeniden adlandırma sırasında
// `:is(a,b) :is(c,d,e)` biçimindeki bir seçici bozuldu ve
// `.x .y,form,a:not(.z))` gibi kapanmamış parantezli bir satıra döndü.
// `next build` buna HATA VERMEDİ: lightningcss ayrıştıramadığı kuralı
// sessizce atıyor, yani satırın tamamı kayboluyor ve bunu ancak
// tarayıcıda, o ekrana bakan biri fark ediyor. Test de yakalamıyor;
// CSS'in testi yok.
//
// İki kural denetleniyor:
//
//   1. DENGE — her dosyada süslü parantez ve normal parantez dengeli mi.
//      Kapanmamış bir parantez o noktadan sonraki kuralları da düşürüyor.
//
//   2. SABİT RENK — panel CSS'lerinde hex renk yazılmaz, jeton kullanılır
//      (panel-tokens.css hariç; palet orada). Bu kural dosyaların
//      yorumlarında zaten yazılıydı ama hiçbir şey uygulamıyordu; çok
//      kiracılı temada sabit renk kurumun markasını yok sayar.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = path.join(kok, "src");

/** Paletin kendisi; sabit renk yalnızca burada. */
const PALET = "src/app/(panel)/panel-tokens.css";
/** Vitrin ve giriş ekranı panel jetonlarını kullanmıyor. */
const PANEL_DISI = ["src/app/globals.css", "src/app/login/login.css"];

function cssDosyalari(dizin) {
  const cikti = [];
  for (const ad of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, ad.name);
    if (ad.isDirectory()) cikti.push(...cssDosyalari(tam));
    else if (ad.name.endsWith(".css")) cikti.push(tam);
  }
  return cikti;
}

/* Yorumlar ve dizgeler ayıklanıyor: içlerindeki parantez sayılmamalı. */
function yorumsuz(metin) {
  return metin
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const sorunlar = [];

for (const tam of cssDosyalari(KAYNAK)) {
  const göreli = path.relative(kok, tam);
  const ham = fs.readFileSync(tam, "utf8");
  const gövde = yorumsuz(ham);

  // 1. Denge
  const say = (karakter) => gövde.split(karakter).length - 1;
  if (say("{") !== say("}")) {
    sorunlar.push(`${göreli}: süslü parantez dengesiz ({ ${say("{")}, } ${say("}")})`);
  }
  if (say("(") !== say(")")) {
    sorunlar.push(`${göreli}: parantez dengesiz (( ${say("(")}, ) ${say(")")})`);
  }

  /*
    Satır bazında da bakılıyor: dosya genelinde sayılar tutup tek bir
    satırda fazladan ")" olması mümkün — bugünkü kusur tam olarak
    böyleydi, `:is(` silinince kapanış parantezi yerinde kalmıştı.
  */
  let derinlik = 0;
  gövde.split("\n").forEach((satir, i) => {
    for (const karakter of satir) {
      if (karakter === "(") derinlik += 1;
      else if (karakter === ")") derinlik -= 1;
      if (derinlik < 0) {
        sorunlar.push(`${göreli}:${i + 1}: fazladan ")" — seçici bozuk, kural sessizce düşer`);
        derinlik = 0;
        break;
      }
    }
  });

  /*
    2. Sabit renk.

    SAF BEYAZ muaf: renkli ya da koyu zemine basılan metin ve simgeler
    için kullanılıyor ve temayla değişmemesi gereken tek renk o —
    jetona bağlamak, karanlık modda okunmaz bir düğme üretirdi.
    Alfası olan beyaz (#fff9 gibi) muaf değil: rgb(255 255 255/.6)
    yazmak hem okunur hem denetimden geçer.
  */
  if (göreli !== PALET && !PANEL_DISI.includes(göreli)) {
    const hexler = [...gövde.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].filter(
      (m) => !/^#(fff|ffffff)$/i.test(m[0]),
    );
    if (hexler.length) {
      const ornek = [...new Set(hexler.map((m) => m[0]))].slice(0, 4).join(", ");
      sorunlar.push(`${göreli}: sabit renk var (${ornek}) — jeton kullanın, palet ${PALET}`);
    }
  }
}

if (sorunlar.length) {
  console.error("✗ CSS denetimi:");
  for (const sorun of sorunlar) console.error("  " + sorun);
  process.exit(1);
}

const adet = cssDosyalari(KAYNAK).length;
console.log(`✓ CSS denetimi: ${adet} dosya, parantezler dengeli, panelde sabit renk yok`);
