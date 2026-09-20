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
