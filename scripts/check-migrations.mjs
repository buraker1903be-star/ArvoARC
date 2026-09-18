// Migration denetimi — derlemeden önce çalışır ("npm run build").
//
// Neden var: bu projede migration dosyaları bir süre gerçek tarihle değil
// "bir sonraki gün" mantığıyla adlandırıldı; sapma 24 Eylül 2026'ya kadar
// çıktı. Uygulanmış migration'lar Supabase tarafında SÜRÜM DİZESİYLE
// izlendiği için bunları geriye dönük yeniden adlandırmak defteri bozar —
// dosyalar olduğu gibi bırakıldı.
//
// Asıl tehlike şu: bugünün gerçek zaman damgasıyla ("supabase migration new"
// böyle üretir) açılan yeni bir dosya, zaten uygulanmış olanların ÖNÜNE
// sıralanır. Supabase bunu sırasız migration sayar; ya reddeder ya da
// beklenmedik sırada uygular. Bu denetim tam olarak onu yakalar.
//
// Kural: her yeni migration'ın sürümü, var olan en büyük sürümden kesinlikle
// büyük olmalı. Gerçek zaman 20260924100000'i geçtikten sonra normal zaman
// damgaları yeniden güvenli hale gelir ve bu denetim sessizce geçer.
//
// Yeni dosya açmak için: npm run db:new -- <ad>
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "supabase", "migrations");
const NAME_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;

if (!fs.existsSync(DIR)) {
  console.log("✓ Migration denetimi: supabase/migrations yok, atlandı");
  process.exit(0);
}

// Git'te izlenen dosya üretime çıkmış sayılır: sürümü Supabase tarafında
// durur, adı ne olursa olsun geçmiştir ve değiştirilmez. Biçim ve tarih
// kuralları yalnızca YENİ (izlenmeyen) dosyalara uygulanır. Böylece eski
// adlandırmalar (ör. "0002_…", "20260731_000001_…") ve gün içinde saatler
// tükenince yazılmış geçersiz saatler ("…280000" = saat 28) denetimi
// kırmaz, ama bir daha eklenemez.
let tracked = null;
try {
  tracked = new Set(
    execFileSync("git", ["ls-files", "--", "supabase/migrations"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((line) => path.basename(line.trim()))
      .filter(Boolean),
  );
} catch {
  // git yoksa (ör. dışa aktarılmış kaynak) bütün dosyalar yeni sayılır.
}
const isShipped = (name) => Boolean(tracked && tracked.has(name));

const problems = [];
const entries = fs.readdirSync(DIR).filter((name) => name.endsWith(".sql")).sort();
const versions = new Map();

for (const name of entries) {
  const match = NAME_PATTERN.exec(name);
  if (!match) {
    if (!isShipped(name)) problems.push(`${name}: ad biçimi YYYYMMDDHHMMSS_kucuk_harf_ad.sql olmalı`);
    continue;
  }
  const version = match[1];
  if (versions.has(version)) {
    if (!isShipped(name) || !isShipped(versions.get(version))) {
      problems.push(`${name}: ${versions.get(version)} ile aynı sürümü (${version}) kullanıyor`);
    }
    continue;
  }
  versions.set(version, name);

  // Takvimsel olarak geçerli mi (13. ay, 32. gün gibi hatalar)
  const [y, mo, d, h, mi, s] = [
    version.slice(0, 4), version.slice(4, 6), version.slice(6, 8),
    version.slice(8, 10), version.slice(10, 12), version.slice(12, 14),
  ].map(Number);
  const asDate = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const roundTrips =
    asDate.getUTCFullYear() === y && asDate.getUTCMonth() === mo - 1 && asDate.getUTCDate() === d &&
    asDate.getUTCHours() === h && asDate.getUTCMinutes() === mi && asDate.getUTCSeconds() === s;
  if (!roundTrips && !isShipped(name)) problems.push(`${name}: ${version} geçerli bir tarih/saat değil`);
}

// Asıl kural: yeni bir migration, gönderilmiş olanların en büyüğünden büyük
// bir sürüm taşımalı; yoksa uygulanmışların önüne sıralanır.
if (tracked && tracked.size) {
  const shippedMax = [...versions.entries()]
    .filter(([, name]) => isShipped(name))
    .map(([version]) => version)
    .sort()
    .pop();
  for (const [version, name] of versions) {
    if (isShipped(name)) continue;
    if (shippedMax && version <= shippedMax) {
      problems.push(
        `${name}: sürümü (${version}) gönderilmiş en son migration'dan (${shippedMax}) küçük. ` +
        `Uygulanmışların önüne sıralanır. "npm run db:new -- <ad>" doğru sürümü hesaplar.`,
      );
    }
  }
}

if (problems.length) {
  console.error(`✗ Migration denetimi: ${problems.length} sorun\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}

const last = [...versions.keys()].sort().pop();
const now = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const ahead = last > now;
console.log(
  `✓ Migration denetimi: ${entries.length} dosya, sürümler benzersiz ve sıralı (son: ${last})` +
  (ahead ? `\n  Not: son sürüm şu andan (${now}) ileride. Yeni migration ${last}'dan büyük bir sürüm almalı — "npm run db:new -- <ad>" bunu kendisi hesaplar.` : "")
);
