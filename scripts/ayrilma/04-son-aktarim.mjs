// ARC ayrılması, son aktarım: eski (ortak) projeden yeni ARC projesine
// hesaplar, bütün arc_ tabloları ve görseller. Bkz. AYRILMA.md.
//
// Önkoşul (bir kez): 04a-yeni-proje-fonksiyonlari.sql YENİ projede,
// 04b-eski-proje-fonksiyonu.sql ESKİ projede SQL Editor'den uygulanmış olmalı.
//
// Kullanım (ArvoARC klasöründe):
//   node scripts/ayrilma/04-son-aktarim.mjs
// Sırayla iki secret anahtar ister: önce ESKİ projenin (ArvoOS,
// oahshpkgdzrraqdzjqau), sonra YENİ projenin (ArvoARC, obaskcdxaaezjglayash).
// Her birinde Supabase → Project Settings → API Keys → Secret keys → kopyala
// düğmesine basıp Enter'a basmanız yeterli; anahtar panodan okunur, ekrana
// yazılmaz, hiçbir yere kaydedilmez.
//
// Tekrar çalıştırılabilir: satırlar varsa güncellenir, yoksa eklenir; eski
// tarafta artık olmayan satırlar yeni taraftan silinir. Tetikleyiciler kapalı
// yazılır (stok, kupon sayacı, sipariş olayı bir kez daha çalışmaz).
// Kurum/üyelik/lisans/modül tabloları taşınmaz: onları ArvoOS köprüsü yazar.

import { createClient } from "@supabase/supabase-js";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";

const ESKI = { ad: "ESKİ (ArvoOS, oahshpkgdzrraqdzjqau)", url: "https://oahshpkgdzrraqdzjqau.supabase.co", env: "ESKI_SECRET" };
const YENI = { ad: "YENİ (ArvoARC, obaskcdxaaezjglayash)", url: "https://obaskcdxaaezjglayash.supabase.co", env: "ARC_YENI_SECRET" };
const TABLOLAR = [
  "arc_suppliers", "arc_store_settings", "arc_store_themes", "arc_collections", "arc_products",
  "arc_product_variants", "arc_collection_products", "arc_discounts", "arc_orders", "arc_order_items",
  "arc_order_events", "arc_payment_orders", "arc_return_requests", "arc_customer_addresses",
  "arc_customer_favourites", "arc_import_batches", "arc_import_errors", "arc_inventory_movements",
];
// Tema ve benzeri kayıtlar eski projenin TAM depo adresini saklıyor; dosyalar
// kopyalandığı için adres yeni projeye çevrilir.
const ESKI_DEPO = "oahshpkgdzrraqdzjqau.supabase.co/storage/v1/object/public/";
const YENI_DEPO = "obaskcdxaaezjglayash.supabase.co/storage/v1/object/public/";
const SAYFA = 1000;
const PARCA_BAYT = 1_500_000;

const temizle = (s) => s.replace(/\x1b\[[0-9;]*[~A-Za-z]/g, "").replace(/[^\x21-\x7e]/g, "");
const enter = (soru) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(soru, () => { rl.close(); res(); });
});

async function anahtarAl(proje) {
  if (process.env[proje.env]) return temizle(process.env[proje.env]);
  for (let deneme = 0; deneme < 3; deneme++) {
    await enter(`\n${proje.ad} projesinin secret anahtarını Supabase'deki kopyala düğmesiyle kopyalayıp Enter'a basın: `);
    let pano = "";
    try { pano = temizle(execSync("pbpaste", { encoding: "utf8" })); } catch {}
    // Yeni tip secret anahtar (sb_secret_…) ya da eski tip service_role (JWT, eyJ…).
    if ((pano.startsWith("sb_secret_") && pano.length > 30) || (pano.startsWith("eyJ") && pano.length > 100)) return pano;
    console.log(pano.startsWith("sb_secret_")
      ? `  Panodaki anahtar eksik (${pano.length} karakter). Supabase mevcut secret anahtarı yalnızca oluşturulduğu an gösteriyor:
  API Keys → "New secret key" ile geçici bir anahtar oluşturup o an kopyalayın.`
      : "  Panoda secret anahtar yok (sb_secret_… ya da eski tip service_role eyJ…).");
  }
  process.exit(1);
}

function istemci(proje, anahtar) {
  return createClient(proje.url, anahtar, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function dogrula(ad, adim) {
  const { error } = await adim();
  if (error) {
    const ipucu = /Invalid API key/i.test(error.message) ? " — anahtar bu projeye ait değil" :
      /arc_aktarim/.test(error.message) || error.code === "PGRST202" ? " — yardımcı fonksiyon uygulanmamış (04a/04b SQL dosyaları)" : "";
    console.error(`✗ ${ad}: ${error.message}${ipucu}`);
    process.exit(1);
  }
}

const rapor = { basla: new Date().toISOString(), hesap: null, tablolar: {}, adres_cevrilen: 0, gorsel: null, hatalar: [] };

// ---- 1. Anahtarlar ve önkoşullar ------------------------------------------
const eskiAnahtar = await anahtarAl(ESKI);
const eski = istemci(ESKI, eskiAnahtar);
await dogrula("eski proje", () => eski.rpc("arc_aktarim_hesaplar"));
console.log("  ✓ eski proje: bağlantı ve yardımcı fonksiyon tamam");

const yeniAnahtar = await anahtarAl(YENI);
if (yeniAnahtar === eskiAnahtar) { console.error("✗ İki anahtar aynı; yeni projenin anahtarını kopyalayın."); process.exit(1); }
const yeni = istemci(YENI, yeniAnahtar);
await dogrula("yeni proje", () => yeni.rpc("arc_aktarim_pk", { p_tablo: "arc_orders" }));
console.log("  ✓ yeni proje: bağlantı ve yardımcı fonksiyonlar tamam");

// ---- 2. Hesaplar (şifre özetleriyle) ----------------------------------------
console.log("\nHesaplar…");
{
  const { data, error } = await eski.rpc("arc_aktarim_hesaplar");
  if (error) { console.error("✗ hesaplar okunamadı:", error.message); process.exit(1); }
  const sonuc = await yeni.rpc("arc_aktarim_hesap_yukle", { p_kullanicilar: data.kullanicilar, p_kimlikler: data.kimlikler });
  if (sonuc.error) { console.error("✗ hesaplar yazılamadı:", sonuc.error.message); process.exit(1); }
  rapor.hesap = { eski: data.kullanicilar.length, ...sonuc.data };
  console.log(`  ✓ ${sonuc.data.kullanici} hesap, ${sonuc.data.kimlik} giriş kimliği`);
}

// ---- 3. Tablolar ------------------------------------------------------------
console.log("\nTablolar…");
for (const tablo of TABLOLAR) {
  const pk = await yeni.rpc("arc_aktarim_pk", { p_tablo: tablo });
  if (pk.error || !pk.data?.length) { rapor.hatalar.push(`${tablo}: birincil anahtar bulunamadı`); console.log(`  ✗ ${tablo}: birincil anahtar yok`); continue; }
  const anahtarlar = [];
  let okunan = 0, yazilan = 0, cevrilen = 0;
  let parca = [], parcaBayt = 0;
  const gonder = async () => {
    if (!parca.length) return;
    const { data, error } = await yeni.rpc("arc_aktarim_yukle", { p_tablo: tablo, p_satirlar: parca });
    if (error) throw new Error(`yazma: ${error.message}`);
    yazilan += data;
    parca = []; parcaBayt = 0;
  };
  try {
    for (let bas = 0; ; bas += SAYFA) {
      let sorgu = eski.from(tablo).select("*");
      for (const s of pk.data) sorgu = sorgu.order(s, { ascending: true });
      const { data, error } = await sorgu.range(bas, bas + SAYFA - 1);
      if (error) throw new Error(`okuma: ${error.message}`);
      for (const satir of data) {
        let metin = JSON.stringify(satir);
        if (metin.includes(ESKI_DEPO)) {
          cevrilen += metin.split(ESKI_DEPO).length - 1;
          metin = metin.split(ESKI_DEPO).join(YENI_DEPO);
        }
        anahtarlar.push(Object.fromEntries(pk.data.map((s) => [s, satir[s]])));
        parca.push(JSON.parse(metin));
        parcaBayt += metin.length;
        if (parcaBayt > PARCA_BAYT) await gonder();
      }
      okunan += data.length;
      if (data.length < SAYFA) break;
    }
    await gonder();
    const sil = await yeni.rpc("arc_aktarim_sil", { p_tablo: tablo, p_anahtarlar: anahtarlar });
    if (sil.error) throw new Error(`silme: ${sil.error.message}`);
    const { count } = await yeni.from(tablo).select("*", { count: "exact", head: true });
    rapor.tablolar[tablo] = { eski: okunan, yeni: count, yazilan, silinen: sil.data, adres: cevrilen };
    rapor.adres_cevrilen += cevrilen;
    const esit = count === okunan;
    console.log(`  ${esit ? "✓" : "✗"} ${tablo.padEnd(26)} eski ${String(okunan).padStart(6)} · yeni ${String(count).padStart(6)}${sil.data ? ` · ${sil.data} silindi` : ""}${cevrilen ? ` · ${cevrilen} adres çevrildi` : ""}`);
    if (!esit) rapor.hatalar.push(`${tablo}: sayılar farklı (eski ${okunan}, yeni ${count})`);
  } catch (e) {
    rapor.hatalar.push(`${tablo}: ${e.message}`);
    console.log(`  ✗ ${tablo}: ${e.message}`);
  }
}

// ---- 4. Görseller -----------------------------------------------------------
console.log("\nGörseller…");
{
  const gorsel = spawnSync(process.execPath, ["scripts/ayrilma/03-gorselleri-kopyala.mjs"], {
    stdio: "inherit",
    env: { ...process.env, ARC_YENI_SECRET: yeniAnahtar },
  });
  rapor.gorsel = gorsel.status === 0 ? "tamam" : `hata (çıkış ${gorsel.status})`;
  if (gorsel.status !== 0) rapor.hatalar.push("görsel kopyalama hatalı; .ayrilma/gorsel-rapor.json");
}

// ---- 5. Sonuç -------------------------------------------------------------
rapor.bitis = new Date().toISOString();
fs.mkdirSync(".ayrilma", { recursive: true });
fs.writeFileSync(".ayrilma/son-aktarim-rapor.json", JSON.stringify(rapor, null, 2));
console.log(rapor.hatalar.length
  ? `\n✗ ${rapor.hatalar.length} sorun var:\n  ${rapor.hatalar.join("\n  ")}`
  : `\n✓ Son aktarım tamam: ${rapor.hesap.kullanici} hesap, ${TABLOLAR.length} tablo birebir, ${rapor.adres_cevrilen} depo adresi yeni projeye çevrildi, görseller kopyalandı.`);
console.log("Ayrıntı: .ayrilma/son-aktarim-rapor.json");
process.exit(rapor.hatalar.length ? 1 : 0);
