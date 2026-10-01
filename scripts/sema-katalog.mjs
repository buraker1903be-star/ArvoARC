// supabase/schema/canli-sema.sql → supabase/schema/katalog.json
//
//   node scripts/sema-katalog.mjs
//
// Katalog, uygulama kodunun veritabanıyla sözleşmesini denetlemek için
// kullanılır (scripts/check-schema-usage.mjs): hangi tabloda hangi sütunlar
// var ve public şemasında hangi fonksiyonlar tanımlı. Anlık görüntü her
// yenilendiğinde bu betik de çalıştırılmalı; katalog farkı (git diff) şemanın
// uygulamayı ilgilendiren kısmında neyin değiştiğini gösterir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// sema-kaydet.mjs ile aynı gerekçe: dışa aktarım ArvoOS için de kullanılıyor.
const targetRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
const source = path.join(targetRoot, "supabase", "schema", "canli-sema.sql");
const target = path.join(targetRoot, "supabase", "schema", "katalog.json");

/** SELECT listesini üst düzey virgüllerden böler (parantez ve tırnak gözetir). */
function ustDuzeyParcalar(liste) {
  const parcalar = [];
  let derinlik = 0, tirnak = null, suan = "";
  for (const ch of liste) {
    if (tirnak) {
      suan += ch;
      if (ch === tirnak) tirnak = null;
      continue;
    }
    if (ch === "'" || ch === '"') { tirnak = ch; suan += ch; continue; }
    if (ch === "(") derinlik += 1;
    if (ch === ")") derinlik -= 1;
    if (ch === "," && derinlik === 0) { parcalar.push(suan); suan = ""; continue; }
    suan += ch;
  }
  if (suan.trim()) parcalar.push(suan);
  return parcalar;
}

/** Bir SELECT listesinin ürettiği sütun adları. */
function sutunlariAyikla(liste) {
  return ustDuzeyParcalar(liste.replace(/^\s*SELECT\s+/i, "")).flatMap((parca) => {
    const sade = parca.trim();
    if (!sade) return [];
    /* "ifade AS ad" — AS yalnızca üst düzeydeyse geçerli; parantez
       içindeki bir AS (cast ya da alt sorgu) sütun adı değildir. */
    const diziler = ustDuzeyParcalar(sade);
    const son = diziler[diziler.length - 1] ?? sade;
    const takma = son.match(/\s+AS\s+("?)([a-z_0-9]+)\1\s*$/i);
    if (takma) return [takma[2]];
    const duz = sade.match(/^(?:[a-z_0-9]+\.)?("?)([a-z_0-9]+)\1$/i);
    return duz ? [duz[2]] : [];
  });
}

export function buildCatalog(sql) {
  const tables = {};
  for (const m of sql.matchAll(/create table if not exists public\.("?)([a-z_0-9]+)\1 \(\n([\s\S]*?)\n\);/g)) {
    tables[m[2]] = m[3]
      .split("\n")
      .map((line) => line.trim().match(/^"?([a-z_0-9]+)"?\s/))
      .filter(Boolean)
      .map((match) => match[1])
      .sort();
  }
  /*
    GÖRÜNÜMLER DE KATALOĞA GİRİYOR.

    Kod ops_contracts, ops_opportunities ve ops_proposals'ı okuyor ama
    bu betik yalnızca "create table" arıyordu; görünümler kataloğa hiç
    girmiyordu. 01.10.2026'da ortaya çıktı: döküm yenilenince üç
    görünüm birden kaybolup `check:schema` çalışan kodu "tablo yok"
    diye reddetti. Önceki katalogda duruyorlardı, demek ki bir kez
    elle eklenmişler — yani her döküm yenilemede yeniden eklenmeleri
    gerekirdi ve denetim sessizce kendi kendini yanıltır hâle gelirdi.

    Sütun adları SELECT listesinden okunuyor: ya "ifade AS ad" ya da
    düz "tablo.sutun". Virgüller parantez ve tırnak derinliği
    gözetilerek bölünüyor, çünkü jsonb_build_object(...) içindeki
    virgüller sütun ayırıcı değil.
  */
  for (const m of sql.matchAll(/create or replace view public\.("?)([a-z_0-9]+)\1 as\n([\s\S]*?)\n\s*FROM /g)) {
    tables[m[2]] = sutunlariAyikla(m[3]).sort();
  }

  const functions = [...new Set(
    [...sql.matchAll(/^CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/gm)].map((m) => m[1]),
  )].sort();
  return { tables: Object.fromEntries(Object.entries(tables).sort()), functions };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!fs.existsSync(source)) {
    console.error(`Anlık görüntü yok: ${path.relative(root, source)} (bkz. supabase/schema/README.md)`);
    process.exit(1);
  }
  const catalog = buildCatalog(fs.readFileSync(source, "utf8"));
  fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`✓ ${path.relative(root, target)}: ${Object.keys(catalog.tables).length} tablo, ${catalog.functions.length} fonksiyon`);
}
