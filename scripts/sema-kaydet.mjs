// Canlı şema dışa aktarımını supabase/schema/canli-sema.sql'e kaydeder.
//
//   node scripts/sema-kaydet.mjs ~/Downloads/<indirilen>.csv
//
// SQL Editor'de scripts/sema-disa-aktar.sql'i çalıştırıp sonucu "Download
// CSV" ile indirin. CSV tek sütun (ddl) ve tek satırdır; değer tırnak içinde,
// içindeki tırnaklar ikilenmiş ("") olarak gelir. Bu betik başlığı atar ve
// kaçışı çözer — elle kopyalayıp yapıştırmanın aksine çıktı bayt bayt aynıdır.
// Tırnaksız düz metin (hücreden doğrudan kopyalanmış) da kabul edilir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const input = process.argv[2];
if (!input) {
  console.error("Kullanım: node scripts/sema-kaydet.mjs <indirilen.csv> [hedef-depo-kökü]");
  process.exit(1);
}

// Aynı dışa aktarım sorgusu ArvoOS'un SQL Editor'ünde de çalıştırılıyor
// (AGENTS.md → Veritabanı). Hedef kök verilmezse bu depoya yazılır.
const targetRoot = process.argv[3] ? path.resolve(process.argv[3]) : root;
const target = path.join(targetRoot, "supabase", "schema", "canli-sema.sql");

let text = fs.readFileSync(input, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
text = text.replace(/^ddl\n/, "");
const trimmed = text.trim();
if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
  text = trimmed.slice(1, -1).replace(/""/g, '"');
}
text = text.trimEnd() + "\n";

if (!text.startsWith("-- Canlı şema dışa aktarımı")) {
  console.error("Beklenen başlık yok; bu dosya sema-disa-aktar.sql çıktısı gibi görünmüyor.");
  process.exit(1);
}

// Sır taraması: dışa aktarım yalnızca yapı içermeli. Bir fonksiyon gövdesine
// anahtar gömülmüşse dosya yazılmaz, satır numarasıyla bildirilir.
const suspicious = [
  /sb_secret_[A-Za-z0-9_-]{8,}/,
  /eyJhbGciOi[A-Za-z0-9._-]{20,}/,
  /sk_(live|test)_[A-Za-z0-9]{8,}/,
  /re_[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const hits = text.split("\n").flatMap((line, i) =>
  suspicious.some((re) => re.test(line)) ? [`  satır ${i + 1}: ${line.trim().slice(0, 80)}`] : []);
if (hits.length) {
  console.error(`✗ Şüpheli anahtar bulundu, dosya YAZILMADI:\n${hits.join("\n")}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, text);
const count = (re) => (text.match(re) || []).length;
console.log(`✓ ${path.relative(root, target)}`);
console.log(`  ${count(/^create table/gim)} tablo, ${count(/^CREATE OR REPLACE FUNCTION/gm)} fonksiyon, ` +
  `${count(/^create policy/gim)} politika, ${count(/^CREATE (UNIQUE )?INDEX/gm)} indeks, ${count(/^CREATE TRIGGER/gm)} tetikleyici`);
