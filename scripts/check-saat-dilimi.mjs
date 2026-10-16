// Saat dilimi denetimi: sunucu ve veritabanı UTC'de, müşteri ve mağaza
// Türkiye'de. UTC'ye göre alınan bir GÜN, gece 00:00–03:00 arasında
// bir önceki günü verir; 16.10.2026'da 02:23'te verilen sipariş
// "AC261015-…" numarasını aldı, dışa aktarılan CSV'lerin adı da dünü
// taşıyordu. Bu betik kalıbın geri gelmesini yakalar.
//
// İki alan taranır:
//   - src/**: argümansız new Date()'ten UTC gün anahtarı, saat dilimi
//     verilmeden biçimlendirme, yerel saat okuyan get*/set* çağrıları;
//   - supabase/migrations: KESİM'den sonraki dosyalarda dilimsiz
//     to_char(now(), …), now()::date, current_date, date_trunc(…, now()).
//     Veritabanının dilimi artık Türkiye (20261016080951), ama bağlantı ya
//     da rol düzeyindeki bir ayar onu ezebilir; gün alan kod dilimi
//     açıkça yazar. Eski migration'lar geçmiş kayıt, taranmaz.
//
// Bilerek dilimsizse satırın üstüne ya da sonuna gerekçe yazılır:
//   TS:  // dilim-tamam: <sebep>
//   SQL: -- dilim-tamam: <sebep>
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(import.meta.dirname, "..");
const KESIM = "20261016080951";

const TS_KURALLARI = [
  {
    desen: /new Date\(\)\s*\.toISOString\(\)\s*\.(slice|substring|substr)\(\s*0\s*,\s*10\s*\)|new Date\(\)\s*\.toISOString\(\)\s*\.split\(\s*["']T["']\s*\)/,
    neden: "UTC gün anahtarı (gece 00:00–03:00 arası DÜN) — trToday() kullanın (lib/tr-time)",
  },
  {
    desen: /\.toLocale(Date|Time)String\(/,
    dilimGerekir: true,
    neden: "saat dilimi verilmeden tarih biçimlendirme — timeZone: \"Europe/Istanbul\" ekleyin",
  },
  {
    desen: /new Date\([^)]*\)\s*\.toLocaleString\(/,
    dilimGerekir: true,
    neden: "saat dilimi verilmeden tarih biçimlendirme — timeZone: \"Europe/Istanbul\" ekleyin",
  },
  {
    desen: /new Intl\.DateTimeFormat\(/,
    dilimGerekir: true,
    neden: "saat dilimi verilmeden biçimlendirici — timeZone ekleyin",
  },
  {
    desen: /\.(getHours|getDate|getDay|getMonth|getFullYear|setHours|setDate)\(/,
    neden: "yerel saat okuma/yazma (sunucu UTC'de) — getUTC* ve TR_OFFSET (lib/tr-time) kullanın",
  },
];

const SQL_KURALLARI = [
  { desen: /to_char\(\s*(now|clock_timestamp|current_timestamp|statement_timestamp|transaction_timestamp)\s*(\(\s*\))?\s*,/i, neden: "to_char(now(), …) dilimsiz — now() at time zone 'Europe/Istanbul' yazın" },
  { desen: /\b(now|clock_timestamp)\(\)\s*::\s*date\b/i, neden: "now()::date dilimsiz — (now() at time zone 'Europe/Istanbul')::date yazın" },
  { desen: /\bcurrent_date\b/i, neden: "current_date dilimsiz — (now() at time zone 'Europe/Istanbul')::date yazın" },
  { desen: /date_trunc\(\s*'[a-z]+'\s*,\s*(now|clock_timestamp)\(\)\s*\)/i, neden: "date_trunc(…, now()) dilimsiz — now() at time zone 'Europe/Istanbul' yazın" },
];

function dosyalar(dizin, uzantilar) {
  const sonuc = [];
  for (const ad of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, ad.name);
    if (ad.isDirectory()) {
      if (ad.name === "node_modules" || ad.name.startsWith(".")) continue;
      sonuc.push(...dosyalar(tam, uzantilar));
    } else if (uzantilar.some((u) => ad.name.endsWith(u))) sonuc.push(tam);
  }
  return sonuc;
}

const sorunlar = [];
const muaf = (satirlar, i, isaret) =>
  satirlar[i].includes(isaret) || (i > 0 && satirlar[i - 1].includes(isaret));

for (const dosya of dosyalar(path.join(KOK, "src"), [".ts", ".tsx"])) {
  const satirlar = fs.readFileSync(dosya, "utf8").split(/\r?\n/);
  satirlar.forEach((satir, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(satir) || muaf(satirlar, i, "dilim-tamam:")) return;
    for (const kural of TS_KURALLARI) {
      if (!kural.desen.test(satir)) continue;
      if (kural.dilimGerekir) {
        // Seçenekler çoğu zaman aynı satırda, bazen birkaç satır aşağıda.
        const pencere = satirlar.slice(i, i + 4).join(" ");
        if (/timeZone\s*:/.test(pencere)) continue;
        // Sayı biçimlendirme (adet.toLocaleString) tarih değil; yalnız Date üzerindekiler aranıyor.
      }
      sorunlar.push(`${path.relative(KOK, dosya)}:${i + 1}  ${kural.neden}`);
    }
  });
}

const gocDizini = path.join(KOK, "supabase", "migrations");
for (const ad of fs.readdirSync(gocDizini).filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= KESIM).sort()) {
  const satirlar = fs.readFileSync(path.join(gocDizini, ad), "utf8").split(/\r?\n/);
  let yorumda = false;
  satirlar.forEach((ham, i) => {
    // Blok ve satır yorumları ayıklanır: gerekçe metni kalıbı anlatabilir.
    let satir = ham;
    if (yorumda) {
      const son = satir.indexOf("*/");
      if (son < 0) return;
      satir = satir.slice(son + 2);
      yorumda = false;
    }
    satir = satir.replace(/\/\*.*?\*\//g, "");
    const bas = satir.indexOf("/*");
    if (bas >= 0) { satir = satir.slice(0, bas); yorumda = true; }
    satir = satir.replace(/--.*$/, "");
    if (muaf(satirlar, i, "dilim-tamam:")) return;
    for (const kural of SQL_KURALLARI) {
      if (kural.desen.test(satir) && !/at time zone/i.test(satir)) {
        sorunlar.push(`supabase/migrations/${ad}:${i + 1}  ${kural.neden}`);
      }
    }
  });
}

if (sorunlar.length) {
  console.error(`✗ Saat dilimi denetimi: ${sorunlar.length} sorun`);
  for (const s of sorunlar) console.error("  " + s);
  console.error("  Bilerek dilimsizse satıra gerekçe yazın: dilim-tamam: <sebep>");
  process.exit(1);
}
console.log("✓ Saat dilimi denetimi: src ve yeni migration'larda UTC günü yok");
