/*
  AÇIKLAMANIN MODELE KALAN KISMI — SENİN MAKİNENDE koşar.

    node scripts/aciklama-modelle.mjs              (kuru tur)
    node scripts/aciklama-modelle.mjs --yaz

  NEDEN AYRI BİR BETİK: ürün açıklaması bir HTML tablosu ve
  hücrelerinin çoğunu eşleme tablosu KESİN çeviriyor
  (scripts/aciklama-ingilizce.mjs → lib/ceviri/aciklama). Geriye
  kalan, kapalı dağarcığa sığmayan DÜZYAZI: "Kış aylarında şıklığı
  ve sıcaklığı bir arada sunan…". Onu sözcük sözcük çevirmek bozuk
  İngilizce üretir; cümleyi çevirmek modelin işi.

  25.10.2026'da ölçüldü: eşiği geçemeyen 497 üründe kapanmayan 853
  benzersiz hücre var ve 399'u böyle cümle. Aynı cümle onlarca
  üründe tekrar ediyor (947 geçiş), o yüzden parça başına BİR KEZ
  soruluyor ve karşılığı hepsine yazılıyor.

  MODELE TABLONUN TAMAMI VERİLMİYOR: 3 KB HTML'i 7b bir model
  bozar ve beden-kilo sayıları sessizce kayar. Yalnızca hücre metni
  gidiyor; yapı ve sayılar bu tarafta kalıyor.

  SIRA: önce `npm run ceviri` (ad), sonra `npm run aciklama -- --yaz`
  (eşleme tablosu), sonra bu. Her biri bir öncekinin bıraktığına
  bakıyor ve iş kaldığı yerden devam ediyor.
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { aciklamaCevir, kapanmayanHucreler, KAPSAM_ESIGI } from "../src/lib/ceviri/aciklama.ts";
import { ACIKLAMA_SINIRI, aciklamaParcaIstemi, ceviriKarari, jsonCikar, yankiTutuyor } from "../src/lib/ceviri/dogrula.ts";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const dosya of [".env.local", ".env"]) {
  const yol = path.join(kok, dosya);
  if (!fs.existsSync(yol)) continue;
  for (const satir of fs.readFileSync(yol, "utf8").split("\n")) {
    const es = satir.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (es && !process.env[es[1]]) process.env[es[1]] = es[2].replace(/^["']|["']$/g, "");
  }
}

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i < 0 ? varsayilan : (process.argv[i + 1] ?? true);
};
const YAZ = process.argv.includes("--yaz");
const ADET = Number(arg("adet", 4000));
/* Parti beş: ürün adı isteminde ölçülen denge (dogrula.ts). */
const PARTI = Number(arg("parti", 5));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anahtar = process.env.SUPABASE_SERVICE_ROLE_KEY;
const taban = process.env.AI_TABAN_URL;
const model = process.env.AI_MODEL;
const eksik = [
  !url && "NEXT_PUBLIC_SUPABASE_URL", !anahtar && "SUPABASE_SERVICE_ROLE_KEY",
  !taban && "AI_TABAN_URL", !model && "AI_MODEL",
].filter(Boolean);
if (eksik.length) {
  console.error(`✗ Eksik ortam değişkeni: ${eksik.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(url, anahtar, { auth: { persistSession: false } });

async function sor(istem) {
  const yanit = await fetch(`${taban.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(Number(process.env.AI_ZAMAN_ASIMI_MS ?? 120_000)),
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_ANAHTAR ? { Authorization: `Bearer ${process.env.AI_ANAHTAR}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      messages: [{ role: "user", content: istem }],
    }),
  });
  if (!yanit.ok) throw new Error(`model ${yanit.status}: ${(await yanit.text()).slice(0, 200)}`);
  const veri = await yanit.json();
  return veri?.choices?.[0]?.message?.content ?? "";
}

/* PostgREST bin satırda kesiyor ve bunu söylemiyor (AGENTS.md). */
const SAYFA = 1000;
async function urunler() {
  const toplanan = [];
  for (let sayfa = 0; toplanan.length < ADET; sayfa += 1) {
    const bas = sayfa * SAYFA;
    const { data, error } = await supabase
      .from("arc_products")
      .select("slug, organization_id, description")
      .eq("status", "active")
      .eq("international_blocked", false)
      .not("name_en", "is", null)
      .is("description_en", null)
      .not("description", "is", null)
      .order("slug")
      .range(bas, Math.min(bas + SAYFA, ADET) - 1);
    if (error) throw new Error(`ürünler okunamadı: ${error.message}`);
    if (!data || data.length === 0) break;
    toplanan.push(...data);
    if (data.length < SAYFA) break;
  }
  return toplanan;
}

function partilere(liste, boy) {
  const cikti = [];
  for (let i = 0; i < liste.length; i += boy) cikti.push(liste.slice(i, i + boy));
  return cikti;
}

async function calistir() {
  const kayitlar = await urunler();
  /* Eşleme tablosunun zaten kapattığı ürünler bu betiğin işi
     değil: onları `npm run aciklama -- --yaz` yazıyor. */
  const kalan = kayitlar.filter((u) => aciklamaCevir(u.description ?? "").kapsam < KAPSAM_ESIGI);

  const parcalar = [];
  const gorulen = new Set();
  for (const urun of kalan) {
    for (const parca of kapanmayanHucreler(urun.description ?? "")) {
      if (gorulen.has(parca)) continue;
      gorulen.add(parca);
      parcalar.push(parca);
    }
  }

  console.log(
    `${kalan.length} ürün · ${parcalar.length} benzersiz parça · parti ${PARTI} · model ${model}` +
      (YAZ ? "" : " · KURU TUR"),
  );
  if (parcalar.length === 0) {
    console.log("✓ Modele sorulacak parça yok.");
    return;
  }

  /* Parça → İngilizce karşılık. Yalnızca DENETİMDEN GEÇENLER
     giriyor; geçmeyen parça sözlükte hiç olmuyor ve o hücre
     eşleme tablosuna düşüyor (yani Türkçe kalıyor). */
  const sozluk = new Map();
  const basarisiz = [];
  const yeniden = [];

  /* İki tur: önce partiler, sonra başarısızlar TEK TEK — ürün adı
     betiğindeki gerekçenin aynısı, partinin bağlamı değişince
     sonuç da değişiyor. */
  for (let tur = 1; tur <= 2; tur += 1) {
    const kaynak = tur === 1 ? parcalar : yeniden.slice();
    if (tur === 2) {
      if (kaynak.length === 0) break;
      console.log(`\n! ${kaynak.length} parça tek tek yeniden deneniyor…`);
      yeniden.length = 0;
      basarisiz.length = 0;
    }

    for (const parti of partilere(kaynak, tur === 1 ? PARTI : 1)) {
      let ham;
      try {
        ham = await sor(aciklamaParcaIstemi(parti));
      } catch (sorun) {
        console.error(`  ✗ parti atlandı (${sorun.message})`);
        if (tur === 1) yeniden.push(...parti); else basarisiz.push(...parti);
        continue;
      }
      const dizi = jsonCikar(ham);
      if (!dizi) {
        console.error(`  ✗ parti atlandı (JSON çıkmadı): ${ham.slice(0, 120)}`);
        if (tur === 1) yeniden.push(...parti); else basarisiz.push(...parti);
        continue;
      }
      const gelenler = new Map(
        dizi.filter((s) => s && Number.isFinite(Number(s.id))).map((s) => [Number(s.id), s]),
      );
      for (const [sira, parca] of parti.entries()) {
        const satir = gelenler.get(sira + 1);
        /* Yankı denetimi: sıraya dayalı eşleşmede 7b model
           partideki BAŞKA kalemin cevabını verebiliyor. */
        if (!satir || !yankiTutuyor(parca, satir.source)) {
          if (tur === 1) yeniden.push(parca); else basarisiz.push(parca);
          continue;
        }
        /* Hedef grup denetimi KAPALI: bu bir ürün adı değil, tablo
           hücresi — "Kadın" sözcüğünün geçmesi zorunlu değil.
           Sayı denetimi ve "Türkçe kalmış mı" denetimi açık. */
        const karar = ceviriKarari(satir.text, parca, ACIKLAMA_SINIRI);
        if (!karar.kabul) {
          if (tur === 1) yeniden.push(parca); else basarisiz.push(`${karar.sebep}: ${parca.slice(0, 60)}`);
          continue;
        }
        sozluk.set(parca, karar.metin);
        process.stdout.write(".");
      }
    }
  }

  console.log(`\n✓ ${sozluk.size}/${parcalar.length} parça çevrildi`);

  let yazilan = 0;
  const esikAltinda = [];
  for (const urun of kalan) {
    const { html, kapsam } = aciklamaCevir(urun.description ?? "", sozluk);
    if (kapsam < KAPSAM_ESIGI) {
      esikAltinda.push(`${urun.slug}: kapsam %${(kapsam * 100).toFixed(0)}`);
      continue;
    }
    /*
      SON DENETİM — SAYI KORUNMASI. Eşleme tablosu sayılara hiç
      dokunmuyor ama MODEL dokunabilir; beden-kilo tablosunda bir
      kilonun kayması müşteriye yanlış beden aldırır ve ekranda
      hiçbir belirtisi olmaz.
    */
    const oncesi = ((urun.description ?? "").match(/\d+/g) ?? []).join(",");
    const sonrasi = (html.match(/\d+/g) ?? []).join(",");
    if (oncesi !== sonrasi) {
      console.error(`  ✗ ${urun.slug}: SAYI DEĞİŞTİ, yazılmadı`);
      continue;
    }
    if (!YAZ) { yazilan += 1; continue; }
    const { error } = await supabase
      .from("arc_products")
      .update({ description_en: html })
      .eq("organization_id", urun.organization_id)
      .eq("slug", urun.slug);
    if (error) { console.error(`  ✗ ${urun.slug}: ${error.message}`); continue; }
    yazilan += 1;
    if (yazilan % 50 === 0) process.stdout.write("·");
  }

  console.log(`\n✓ ${yazilan} açıklama ${YAZ ? "yazıldı" : "yazılabilir"}`);
  if (esikAltinda.length) {
    console.log(`! ${esikAltinda.length} ürün hâlâ eşiğin altında (Türkçe kalıyor):`);
    for (const satir of esikAltinda.slice(0, 10)) console.log(`   ${satir}`);
    if (esikAltinda.length > 10) console.log(`   … ve ${esikAltinda.length - 10} tane daha`);
  }
  if (basarisiz.length) {
    console.log(`\n! ${basarisiz.length} parça iki turda da geçemedi:`);
    for (const satir of basarisiz.slice(0, 10)) console.log(`   ${String(satir).slice(0, 110)}`);
    if (basarisiz.length > 10) console.log(`   … ve ${basarisiz.length - 10} tane daha`);
  }
  if (!YAZ) console.log("\n(kuru tur — hiçbir şey yazılmadı; --yaz ile uygulanır)");
}

calistir().catch((sorun) => {
  console.error(`✗ ${sorun.message}`);
  process.exit(1);
});
