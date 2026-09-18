// Uygulama kodu ↔ canlı veritabanı sözleşme denetimi.
//
//   node scripts/check-schema-usage.mjs
//
// Neden var: 18 Eylül 2026 denetiminde iki üretim hatası çıktı ve ikisi de
// derlemede, lint'te ve testte görünmüyordu:
//  - arvo-os.com talep formu, var olmayan bir sütuna (organizations.is_active)
//    başvuran SQL fonksiyonu yüzünden 5 gün her başvuruyu düşürdü;
//  - Platform → Ödemeler, var olmayan bir sütunu (payment_provider_events.
//    created_at) seçtiği için 2 gün "Sorunlu bildirim yok" gösterdi.
// Supabase istemcisi tipsiz kullanıldığı için TypeScript sütun adını bilmiyor.
//
// Ne denetler: kaynak koddaki
//   .from("tablo") … .select("…") / .eq("sütun") / .order("sütun") …
//   .from("tablo").insert|update|upsert({ sütun: … })
//   .rpc("fonksiyon") ve /rest/v1/rpc/fonksiyon
// ifadelerini supabase/schema/katalog.json ile karşılaştırır. Katalog canlı
// şemanın anlık görüntüsünden üretilir (scripts/sema-katalog.mjs, ArvoARC).
//
// Bilinçli sınırlar: dinamik tablo/sütun adları, gömülü ilişkilerin
// (organizations(name)) iç sütunları ve çok seviyeli nesneler denetlenmez.
// Amaç yazım hatası ve sütun adı kaymasını yakalamak, SQL'i doğrulamak değil.
//
// Aynı dosya ArvoOS, ArvoARC ve ArvoCulture-site'ta birebir durur.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "supabase", "schema", "katalog.json");

// Bu veritabanına ait OLMAYAN sorgular. ArvoLab ayrı bir Supabase projesi;
// ArvoOS köprü ve üye listesi için ona doğrudan bağlanıyor.
const OTHER_DATABASE_FILES = new Map([
  ["lib/arvolab.ts", "ArvoLab veritabanı (köprü)"],
]);
const OTHER_DATABASE_RECEIVERS = new Map([
  ["lab", "ArvoLab veritabanı istemcisi (arvolabClient)"],
]);

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const tables = new Map(Object.entries(catalog.tables).map(([t, cols]) => [t, new Set(cols)]));
const functions = new Set(catalog.functions);

const SOURCE_DIRS = ["app", "lib", "src"].filter((d) => fs.existsSync(path.join(root, d)));
const FILTER_RE = /\.(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|order|not)\(\s*"([a-z_0-9]+)"/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** "id,name,org:organization_id,organizations(name)" → ["id","name","organization_id"] */
export function selectColumns(select) {
  let body = select;
  // Gömülü ilişkileri (iç içe parantez dahil) at.
  for (let prev = null; prev !== body; ) {
    prev = body;
    body = body.replace(/[a-z_0-9!:]+\s*\([^()]*\)/gi, "");
  }
  return body
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== "*" && !part.startsWith("count"))
    .map((part) => part.split(":").pop().trim().split("::")[0].split("->")[0].trim())
    .filter((col) => /^[a-z_0-9]+$/.test(col));
}

const problems = [];
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file);
    if (OTHER_DATABASE_FILES.has(rel)) continue;
    const s = fs.readFileSync(file, "utf8");
    const at = (index) => `${rel}:${s.slice(0, index).split("\n").length}`;

    const froms = [...s.matchAll(/\.from\(\s*"([a-z_0-9]+)"\s*\)/g)];
    froms.forEach((m, i) => {
      const receiver = s.slice(Math.max(0, m.index - 60), m.index).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
      if (receiver && OTHER_DATABASE_RECEIVERS.has(receiver)) return;
      const table = m[1];
      const cols = tables.get(table);
      if (!cols) {
        problems.push(`${at(m.index)}  tablo yok: ${table}`);
        return;
      }
      const next = i + 1 < froms.length ? froms[i + 1].index : s.length;
      let chain = s.slice(m.index + m[0].length, Math.min(next, m.index + m[0].length + 900));
      const cut = chain.search(/;|\n\s*(const|let|if|return|await)\b/);
      if (cut >= 0) chain = chain.slice(0, cut);

      const select = chain.match(/\.select\(\s*"([^"]*)"/);
      if (select) {
        for (const col of selectColumns(select[1])) {
          if (!cols.has(col)) problems.push(`${at(m.index)}  ${table}.${col} yok (select)`);
        }
      }
      for (const f of chain.matchAll(FILTER_RE)) {
        if (!cols.has(f[1])) problems.push(`${at(m.index)}  ${table}.${f[1]} yok (filtre/sıralama)`);
      }
      const write = chain.match(/^\s*\.(insert|update|upsert)\(\s*\{([^{}]*)\}/);
      if (write) {
        for (const k of write[2].matchAll(/(?:^|,)\s*([a-z_0-9]+)\s*(?=:|,|$)/g)) {
          if (!cols.has(k[1])) problems.push(`${at(m.index)}  ${table}.${k[1]} yok (${write[1]})`);
        }
      }
    });

    for (const m of s.matchAll(/(?:\.rpc|\brpc(?:OrEmpty|OrNull)?(?:<[^>()]*>)?)\(\s*"([a-z_0-9]+)"|\/rest\/v1\/rpc\/([a-z_0-9]+)/g)) {
      const name = m[1] ?? m[2];
      if (!functions.has(name)) problems.push(`${at(m.index)}  fonksiyon yok: ${name}()`);
    }
  }
}

if (problems.length) {
  console.error(`✗ Şema sözleşmesi: ${problems.length} sorun\n${problems.map((p) => `  ${p}`).join("\n")}\n` +
    "  Sütun gerçekten yeniyse önce migration'ı canlıya uygulayın, sonra anlık görüntüyü ve kataloğu yenileyin " +
    "(ArvoARC/supabase/schema/README.md).");
  process.exit(1);
}
console.log(`✓ Şema sözleşmesi: ${tables.size} tablo, ${functions.size} fonksiyon; kod ile uyumlu`);
