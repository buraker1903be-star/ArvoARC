// Uygulama kodu ↔ canlı veritabanı sözleşme denetimi.
//
//   node scripts/check-schema-usage.mjs [kaynakDizini] [katalogYolu]
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
// SORGU DEĞİŞKENLERİ VE SORGU DÖNDÜREN FONKSİYONLAR da izlenir (27.09.2026).
// Denetim eskiden yalnızca .from("…") ile BİTİŞİK metni o tablonun zinciri
// sayıyordu; koşullu süzgeç yazmanın en doğal biçimi ise şu:
//
//     let sorgu = supabase.from("user_session_logs").select("…");
//     if (aralik) sorgu = sorgu.gte("login_at", …);   // ← hiç denetlenmiyordu
//
// Buradaki sütun adı yanlış olsa denetim susuyordu. Aynı kör nokta ters
// yönde de vurdu: sorgu bir fonksiyona sarılınca
//
//     gecmisSorgusu().order("login_at", …)
//
// ifadesi metinde bir SONRAKİ .from()'un zincirine düşüyor ve sütun yanlış
// tabloda aranıp YANLIŞ ALARM üretiyordu. İkisi de aynı sebepten: "zincir"
// bitişik metin sanılıyordu. Artık sorgu bir değişkene ya da tek tablolu bir
// fonksiyona bağlandığında o ad da sahip sayılıyor ve her sütun kullanımı
// konumuna göre EN YAKIN ÖNCEKİ sahibe ait oluyor.
//
// Bilinçli sınırlar: dinamik tablo/sütun adları, gömülü ilişkilerin
// (organizations(name)) iç sütunları ve çok seviyeli nesneler denetlenmez.
// Birden çok tabloya dokunan bir fonksiyon da bağlanmaz: hangi sütunun
// hangi tabloya ait olduğu belirsizdir ve yanlış alarm, kaçırılan hatadan
// daha çok zarar verir. Amaç yazım hatası ve sütun adı kaymasını yakalamak,
// SQL'i doğrulamak değil.
//
// Denetimin kendisi ArvoOS'ta sınanır (tests/unit/check-schema-usage.test.ts
// + tests/fixtures/sema). Örnek ağaç oraya konuldu çünkü diğer iki depoda
// tsconfig/eslint "tests/fixtures"i dışarıda bırakmıyor ve kasıtlı hatalı
// dosyalar derlemeye girerdi; denetimin mantığı üçünde de aynı olduğu için
// tek yerde sınanması yetiyor.
// Aynı dosya ArvoOS, ArvoARC ve ArvoCulture-site'ta birebir durur.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Bu veritabanına ait OLMAYAN sorgular. ArvoLab ayrı bir Supabase projesi;
// ArvoOS köprü ve üye listesi için ona doğrudan bağlanıyor.
const OTHER_DATABASE_FILES = new Map([
  ["lib/arvolab.ts", "ArvoLab veritabanı (köprü)"],
]);
const OTHER_DATABASE_RECEIVERS = new Map([
  ["lab", "ArvoLab veritabanı istemcisi (arvolabClient)"],
  // Randevu da ayrı bir Supabase projesi; rdv_* tabloları orada.
  ["rdv", "Randevu veritabanı istemcisi (randevuClient)"],
]);

const FROM_RE = /\.from\(\s*"([a-z_0-9]+)"\s*\)/g;
const FILTER_RE = /\.(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|order|not)\(\s*"([a-z_0-9]+)"/g;
/** Zincirin bittiği yer: noktalı virgül ya da yeni bir ifadenin başı. */
const KESME_RE = /;|\n\s*(const|let|if|return|await)\b/;
const EN_UZUN_ZINCIR = 900;

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

/** `{` konumundan dengeli `}`'a kadarki gövde. */
function blokGovdesi(kaynak, acilis) {
  let derinlik = 0;
  for (let i = acilis; i < kaynak.length; i += 1) {
    if (kaynak[i] === "{") derinlik += 1;
    else if (kaynak[i] === "}") {
      derinlik -= 1;
      if (derinlik === 0) return kaynak.slice(acilis, i + 1);
    }
  }
  return kaynak.slice(acilis);
}

/**
 * Dosyadaki sorgu değişkenleri ve sorgu döndüren fonksiyonlar → tablo adı.
 * Yalnızca TEK tabloya dokunanlar bağlanır (gerekçe dosyanın başında).
 */
export function sorguBaglari(kaynak) {
  const baglar = new Map();

  // const/let AD = <her ne ise>.from("tablo")
  for (const m of kaynak.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\.from\(\s*"([a-z_0-9]+)"\s*\)/g)) {
    baglar.set(m[1], m[2]);
  }

  /*
    Sorgu döndüren fonksiyon: gövdesinde tek bir .from("tablo") geçiyorsa.
    İki gövde biçimi de destekleniyor — süslü parantezli blok ve DOĞRUDAN
    İFADE (`const gecmis = () => supabase.from("…")…`). İkincisi sorgu
    yardımcılarının en yaygın yazımı; yalnızca bloklara bakan bir kural onu
    kaçırır ve fonksiyonun çağrıldığı yerdeki sütun yine yanlış tabloda
    aranırdı.
  */
  const fonksiyonlar = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*|\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?=\{)/g;
  for (const m of kaynak.matchAll(fonksiyonlar)) {
    const ad = m[1] ?? m[2];
    const sonrasi = kaynak.slice(m.index + m[0].length);
    /*
      İfade gövdesi noktalı virgülde biter. Uzunluk sınırı, noktalı virgülü
      olmayan bir dosyada gövdenin sonraki sorguları yutmasını engelliyor.
    */
    const govde = sonrasi.startsWith("{")
      ? blokGovdesi(kaynak, m.index + m[0].length)
      : sonrasi.slice(0, Math.min(sonrasi.indexOf(";") + 1 || EN_UZUN_ZINCIR, EN_UZUN_ZINCIR));
    const tablolar = new Set([...govde.matchAll(FROM_RE)].map((x) => x[1]));
    if (tablolar.size === 1) baglar.set(ad, [...tablolar][0]);
  }
  return baglar;
}

/**
 * Sütun kullanımlarının sahipleri, konuma göre sıralı. Bir sahip ya bir
 * `.from("tablo")` çağrısıdır ya da o tabloya bağlı bir adın kullanımı
 * (`sorgu.gte(…)`, `gecmisSorgusu().order(…)`).
 */
function sahipler(kaynak, baglar) {
  const liste = [...kaynak.matchAll(FROM_RE)].map((m) => ({
    index: m.index,
    bas: m.index + m[0].length,
    tablo: m[1],
    // Alıcı başka bir veritabanının istemcisiyse bu sorgu bizim değil.
    alici: kaynak.slice(Math.max(0, m.index - 60), m.index).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1],
  }));
  for (const [ad, tablo] of baglar) {
    // Yalnızca ÇAĞRI/zincir kullanımı: "sorgu = sorgu.gte(…)" satırındaki
    // atama hedefi sahip değil, sağdaki kullanım sahip.
    for (const m of kaynak.matchAll(new RegExp(`\\b${ad}\\s*(?=[.(])`, "g"))) {
      liste.push({ index: m.index, bas: m.index + m[0].length, tablo, alici: undefined });
    }
  }
  return liste.sort((a, b) => a.index - b.index);
}

/** Bir kaynak dosyadaki şema sözleşmesi sorunları. */
export function dosyaSorunlari(kaynak, { tables, functions, etiket = "" }) {
  const sorunlar = [];
  const satir = (index) => `${etiket}${etiket ? ":" : ""}${kaynak.slice(0, index).split("\n").length}`;
  const baglar = sorguBaglari(kaynak);
  const sahipListesi = sahipler(kaynak, baglar);

  sahipListesi.forEach((sahip, i) => {
    if (sahip.alici && OTHER_DATABASE_RECEIVERS.has(sahip.alici)) return;
    const cols = tables.get(sahip.tablo);
    if (!cols) {
      // "tablo yok" yalnızca gerçek .from() çağrısında bildirilir; bağlı ad
      // aynı tabloyu gösterdiği için aynı sorunu tekrar yazmaz.
      if (sahip.alici !== undefined || kaynak.slice(sahip.index, sahip.bas).startsWith(".from")) {
        sorunlar.push(`${satir(sahip.index)}  tablo yok: ${sahip.tablo}`);
      }
      return;
    }
    /*
      Zincir, bir SONRAKİ sahibe kadar sürer. Eskiden yalnızca bir sonraki
      .from()'a kadar sürüyordu; araya giren bir sorgu değişkeni ya da
      fonksiyon çağrısı, sütunlarını yanlış tabloya yazdırıyordu.
    */
    const sinir = i + 1 < sahipListesi.length ? sahipListesi[i + 1].index : kaynak.length;
    let chain = kaynak.slice(sahip.bas, Math.min(sinir, sahip.bas + EN_UZUN_ZINCIR));
    const cut = chain.search(KESME_RE);
    if (cut >= 0) chain = chain.slice(0, cut);

    const select = chain.match(/\.select\(\s*"([^"]*)"/);
    if (select) {
      for (const col of selectColumns(select[1])) {
        if (!cols.has(col)) sorunlar.push(`${satir(sahip.index)}  ${sahip.tablo}.${col} yok (select)`);
      }
    }
    for (const f of chain.matchAll(FILTER_RE)) {
      if (!cols.has(f[1])) sorunlar.push(`${satir(sahip.index)}  ${sahip.tablo}.${f[1]} yok (filtre/sıralama)`);
    }
    const write = chain.match(/^\s*\.(insert|update|upsert)\(\s*\{([^{}]*)\}/);
    if (write) {
      for (const k of write[2].matchAll(/(?:^|,)\s*([a-z_0-9]+)\s*(?=:|,|$)/g)) {
        if (!cols.has(k[1])) sorunlar.push(`${satir(sahip.index)}  ${sahip.tablo}.${k[1]} yok (${write[1]})`);
      }
    }
  });

  for (const m of kaynak.matchAll(/(?:\.rpc|\brpc(?:OrEmpty|OrNull)?(?:<[^>()]*>)?)\(\s*"([a-z_0-9]+)"|\/rest\/v1\/rpc\/([a-z_0-9]+)/g)) {
    const name = m[1] ?? m[2];
    /*
      Alıcı denetimi tablolarda vardı, RPC'de yoktu: lab.rpc("…") bu
      projenin kataloğunda aranıyor ve "fonksiyon yok" deniyordu. Oysa
      ArvoLab ayrı bir veritabanı ve fonksiyonu orada.
    */
    const receiver = kaynak.slice(Math.max(0, m.index - 60), m.index).match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    if (receiver && OTHER_DATABASE_RECEIVERS.has(receiver)) continue;
    if (!functions.has(name)) sorunlar.push(`${satir(m.index)}  fonksiyon yok: ${name}()`);
  }
  return sorunlar;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

// --- CLI. Argümanlar yalnızca denetimin kendi testi için; normalde yok. ---
const [kaynakArg, katalogArg] = process.argv.slice(2);
const catalogPath = katalogArg ? path.resolve(katalogArg) : path.join(root, "supabase", "schema", "katalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const tables = new Map(Object.entries(catalog.tables).map(([t, cols]) => [t, new Set(cols)]));
const functions = new Set(catalog.functions);

const SOURCE_DIRS = kaynakArg
  ? [kaynakArg]
  : ["app", "lib", "src"].filter((d) => fs.existsSync(path.join(root, d)));

const problems = [];
for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.resolve(root, dir))) {
    const rel = path.relative(root, file);
    if (OTHER_DATABASE_FILES.has(rel)) continue;
    problems.push(...dosyaSorunlari(fs.readFileSync(file, "utf8"), { tables, functions, etiket: rel }));
  }
}

if (problems.length) {
  console.error(`✗ Şema sözleşmesi: ${problems.length} sorun\n${problems.map((p) => `  ${p}`).join("\n")}\n` +
    "  Sütun gerçekten yeniyse önce migration'ı canlıya uygulayın, sonra anlık görüntüyü ve kataloğu yenileyin " +
    "(ArvoARC/supabase/schema/README.md).");
  process.exit(1);
}
console.log(`✓ Şema sözleşmesi: ${tables.size} tablo, ${functions.size} fonksiyon; kod ile uyumlu`);
