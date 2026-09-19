// ARC ayrılması: görselleri eski (ortak) projeden yeni ARC projesine kopyalar.
// Bkz. AYRILMA.md.
//
// Neden betik: görseller veritabanında YOL olarak duruyor (metadata.image_paths,
// logo_path, favicon_path, tema *_path); adres çalışma anında projenin
// URL'sinden kuruluyor. Geçişten sonra dosyalar yeni projede olmazsa görseller
// kırılır.
//
// Hangi dosyalar: yeni veritabanındaki kayıtların gösterdiği yollar (veri
// aktarımı önce yapılmış olmalı). İki depo da herkese açık; dosyalar eski
// projeden anahtarsız indirilir, yeni projeye secret anahtarla yüklenir.
// Hiçbir erişim kuralı gevşetilmez.
//
// Kullanım (ArvoARC klasöründe):
//   node scripts/ayrilma/03-gorselleri-kopyala.mjs
// Yeni projenin secret anahtarını önce panodan okur (Supabase → API Keys →
// kopyala düğmesi); yoksa sorar. Ekrana yazılmaz, hiçbir yere kaydedilmez. Tekrar çalıştırılabilir (aynı dosyanın üzerine yazar).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import readline from "node:readline";
import { execSync } from "node:child_process";

const ESKI = "https://oahshpkgdzrraqdzjqau.supabase.co";
const YENI = "https://obaskcdxaaezjglayash.supabase.co";
const ESZAMANLI = 6;

async function gizliSor(soru) {
  if (process.env.ARC_YENI_SECRET) return process.env.ARC_YENI_SECRET.trim();
  // Önce pano: terminale yapıştırmada anahtar iki kez 15 karaktere kısaldı
  // (19.09.2026). Supabase'deki kopyala düğmesiyle alınan anahtar panodan
  // doğrudan okunur; ekrana yazılmaz.
  try {
    const pano = execSync("pbpaste", { encoding: "utf8" }).trim();
    if (pano.startsWith("sb_secret_") && pano.length > 30) {
      console.log("Anahtar panodan okundu.");
      return pano;
    }
    if (pano.startsWith("sb_secret_")) console.log(`Panodaki anahtar eksik görünüyor (${pano.length} karakter); Supabase'de kopyala düğmesini kullanın.`);
  } catch {}
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(soru)) rl.output.write(s); };
  const cevap = await new Promise((res) => rl.question(soru, res));
  rl.close();
  process.stdout.write("\n");
  return cevap.trim();
}

const ham = await gizliSor("Yeni ARC projesinin secret anahtarı (sb_secret_…), yapıştırıp Enter: ");
// Terminal yapıştırılan metnin başına/sonuna görünmez kaçış dizileri ekleyebiliyor
// ("bracketed paste": ESC[200~ … ESC[201~). İlk denemede anahtar bu yüzden
// "Invalid API key" aldı. Kaçış dizileri ve yazdırılamayan karakterler atılır.
const anahtar = ham.replace(/\x1b\[[0-9;]*[~A-Za-z]/g, "").replace(/[^\x21-\x7e]/g, "");
console.log(`Anahtar alındı: ${anahtar.length} karakter${anahtar.length !== ham.length ? ` (${ham.length - anahtar.length} görünmez karakter temizlendi)` : ""}.`);
if (!anahtar.startsWith("sb_secret_") && !anahtar.startsWith("eyJ")) {
  console.error("Bu bir secret anahtar gibi görünmüyor (sb_secret_ ile başlamalı). Publishable anahtar yükleme yapamaz.");
  process.exit(1);
}
const yeni = createClient(YENI, anahtar, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- Kopyalanacak yollar -------------------------------------------------
const hedefler = new Map(); // "depo|yol" → { depo, yol }
const ekle = (depo, yol) => {
  if (typeof yol !== "string" || !yol || yol.startsWith("http")) return;
  hedefler.set(`${depo}|${yol}`, { depo, yol });
};
const eskiAdrestenYol = (url, depo) => {
  const isaret = `/storage/v1/object/public/${depo}/`;
  if (typeof url !== "string" || !url.includes(isaret)) return null;
  return decodeURIComponent(url.split(isaret)[1].split("?")[0]);
};

for (let bas = 0; ; bas += 1000) {
  const { data, error } = await yeni.from("arc_products").select("metadata").range(bas, bas + 999);
  if (error) { console.error("Ürünler okunamadı:", error.message, "— anahtar yeni projenin secret anahtarı mı?"); process.exit(1); }
  for (const urun of data) for (const yol of urun.metadata?.image_paths ?? []) ekle("arc-product-images", yol);
  if (data.length < 1000) break;
}
{
  const { data, error } = await yeni.from("arc_store_settings").select("logo_path,favicon_path");
  if (error) { console.error("Mağaza ayarları okunamadı:", error.message); process.exit(1); }
  for (const s of data) { ekle("organization-assets", s.logo_path); ekle("organization-assets", s.favicon_path); }
}
{
  const { data, error } = await yeni.from("arc_store_themes").select("config");
  if (error) { console.error("Temalar okunamadı:", error.message); process.exit(1); }
  for (const t of data) {
    for (const [k, v] of Object.entries(t.config ?? {})) {
      if (k.endsWith("_path")) ekle("organization-assets", v);
      if (k.endsWith("_url")) ekle("organization-assets", eskiAdrestenYol(v, "organization-assets"));
    }
  }
}

const liste = [...hedefler.values()];
console.log(`Kopyalanacak dosya: ${liste.length} (ürün görseli ${liste.filter((x) => x.depo === "arc-product-images").length}, mağaza/tema ${liste.filter((x) => x.depo === "organization-assets").length})`);

// ---- Kopyalama -------------------------------------------------------------
const rapor = { kopyalandi: 0, bayt: 0, eskideYok: [], hata: [] };
let sira = 0;
async function isci() {
  while (sira < liste.length) {
    const { depo, yol } = liste[sira++];
    const adres = `${ESKI}/storage/v1/object/public/${depo}/${yol.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const yanit = await fetch(adres);
      if (yanit.status === 404 || yanit.status === 400) { rapor.eskideYok.push(`${depo}/${yol}`); continue; }
      if (!yanit.ok) throw new Error(`indirme ${yanit.status}`);
      const icerik = Buffer.from(await yanit.arrayBuffer());
      const { error } = await yeni.storage.from(depo).upload(yol, icerik, {
        contentType: yanit.headers.get("content-type") ?? undefined,
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) throw new Error(`yükleme: ${error.message}`);
      rapor.kopyalandi += 1;
      rapor.bayt += icerik.length;
      if (rapor.kopyalandi % 25 === 0) console.log(`  ${rapor.kopyalandi}/${liste.length}`);
    } catch (e) {
      rapor.hata.push(`${depo}/${yol}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
await Promise.all(Array.from({ length: ESZAMANLI }, isci));

fs.mkdirSync(".ayrilma", { recursive: true });
fs.writeFileSync(".ayrilma/gorsel-rapor.json", JSON.stringify(rapor, null, 2));
console.log(`\n✓ Kopyalandı: ${rapor.kopyalandi} dosya, ${(rapor.bayt / 1048576).toFixed(1)} MB`);
if (rapor.eskideYok.length) console.log(`• Eski projede zaten olmayan: ${rapor.eskideYok.length} (kayıtta yol var, dosya yok — geçişle ilgisiz)`);
if (rapor.hata.length) { console.log(`✗ Hata: ${rapor.hata.length} — ilk üçü:`); rapor.hata.slice(0, 3).forEach((h) => console.log("   " + h)); }
console.log("Ayrıntı: .ayrilma/gorsel-rapor.json");
process.exit(rapor.hata.length ? 1 : 0);
