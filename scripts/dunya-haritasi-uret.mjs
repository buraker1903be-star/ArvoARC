// world-atlas TopoJSON → hazır SVG yolu (src/lib/dunya-haritasi.ts)
//
//   node scripts/dunya-haritasi-uret.mjs
//
// NEDEN DERLEME ANINDA: countries-110m.json 110 KB ve topojson
// çözümü her istek için işlemci yakar. Tarayıcıya veri değil,
// tek bir `d` dizgesi gidiyor (~25 KB) — ne paket ne de istek.
//
// PROJEKSİYON EQUIRECTANGULAR (düz silindirik): enlem/boylamı
// doğrudan x/y'ye çeviriyor, yani ziyaret noktasını haritaya
// koymak için formül değil tek satırlık bir oran yetiyor. Mercator
// kutupları şişirir ve nokta yerleştirmeyi zorlaştırırdı.
import fs from "node:fs";
import * as topo from "topojson-client";
import dunya from "world-atlas/countries-110m.json" with { type: "json" };

const GENISLIK = 1000;
const YUKSEKLIK = 500;

/** Boylam/enlem → viewBox koordinatı. Aynı formül bileşende de var. */
const x = (lon) => ((lon + 180) / 360) * GENISLIK;
const y = (lat) => ((90 - lat) / 180) * YUKSEKLIK;

const yuvarla = (n) => Math.round(n);

/*
  BASİTLEŞTİRME. Ham veri 118 KB'lık bir yol üretiyor ve bu, panel
  paketine giren tek bir dizge için fazla. Birbirine çok yakın
  noktalar atılıyor: 1000x500'lük bir çizimde bir pikselden kısa
  kenarlar gözle görülmüyor ama yolun yarısını yiyor.
*/
const ESIK = 1.2;

/*
  180° MERİDYENİ. Rusya, Fiji ve Antarktika gibi ülkelerin
  halkaları boylamın iki ucu arasında atlıyor: -179 → +179.
  Düz silindirik projeksiyonda bu, x'in 0'dan 1000'e sıçraması
  demek ve araya haritayı boydan boya kesen yatay bir çizgi
  çiziliyor (canlıda görüldü).

  Böyle bir sıçramada halka KAPATILIP yeni bir parça
  başlatılıyor: iki kıta parçası ayrı ayrı çiziliyor, aradaki
  uydurma çizgi hiç doğmuyor.
*/
const SICRAMA = 180;

function halka(noktalar) {
  const parcalar = [];
  let suanki = [];
  let sx = null;
  let sy = null;
  let sonLon = null;

  const bitir = () => {
    /* Üç noktadan az kalan parça bir şey çizmiyor. */
    if (suanki.length > 2) parcalar.push(suanki.join("") + "Z");
    suanki = [];
    sx = null;
    sy = null;
  };

  for (const [lon, lat] of noktalar) {
    if (sonLon !== null && Math.abs(lon - sonLon) > SICRAMA) bitir();
    sonLon = lon;

    const px = yuvarla(x(lon));
    const py = yuvarla(y(lat));
    if (sx !== null && Math.abs(px - sx) < ESIK && Math.abs(py - sy) < ESIK) continue;
    suanki.push(`${sx === null ? "M" : "L"}${px} ${py}`);
    sx = px;
    sy = py;
  }
  bitir();

  return parcalar.join("");
}

const ozellikler = topo.feature(dunya, dunya.objects.countries).features;
const parcalar = [];
for (const ozellik of ozellikler) {
  const g = ozellik.geometry;
  if (!g) continue;
  const cokgenler = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const cokgen of cokgenler) {
    /* Yalnızca dış halka: iç halkalar (göller) bu ölçekte bir
       iki piksel ve yolu iki katına çıkarıyor. */
    if (!(cokgen[0]?.length > 3)) continue;
    const d = halka(cokgen[0]);
    if (d) parcalar.push(d);
  }
}

const yol = parcalar.join("");
fs.writeFileSync(
  "src/lib/dunya-haritasi.ts",
  `/*
  ÜRETİLMİŞ DOSYA — elle düzenlemeyin.
  Kaynak: world-atlas/countries-110m.json
  Üreten: scripts/dunya-haritasi-uret.mjs

  Kıtaların SVG yolu. Projeksiyon equirectangular: enlem/boylam
  doğrudan x/y'ye çevriliyor, bu yüzden ziyaret noktasını
  yerleştirmek için tek satırlık bir oran yetiyor (bileşende aynı
  formül duruyor).
*/
export const HARITA_GENISLIK = ${GENISLIK};
export const HARITA_YUKSEKLIK = ${YUKSEKLIK};

/** Boylam → viewBox x. */
export const haritaX = (lon: number) => ((lon + 180) / 360) * HARITA_GENISLIK;
/** Enlem → viewBox y. */
export const haritaY = (lat: number) => ((90 - lat) / 180) * HARITA_YUKSEKLIK;

export const DUNYA_YOLU =
  ${JSON.stringify(yol)};
`,
);

console.log(`✓ ${parcalar.length} parça, ${(yol.length / 1024).toFixed(1)} KB`);
