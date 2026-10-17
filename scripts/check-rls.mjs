// RLS DENETİMİ: npm run check:rls
//
// NEDEN VAR (17.10.2026). Canlıda manuel sipariş oluşturmak ve elle stok
// hareketi yazmak ÇALIŞMIYORDU: `organization_modules` tablosunda RLS
// açıktı ama hiçbir politika yoktu, yani `authenticated` rolü tabloyu
// BOŞ görüyordu. arc_create_order ve arc_adjust_inventory çağıranın
// yetkisiyle çalışıp "modül açık mı" diye oraya baktığı için kural
// "modül kapalı" diyordu. Hata vermiyor, sessizce yanlış cevap
// veriyordu — üç akış (manuel sipariş, stok hareketi, iade stoğu)
// aylarca ölü kalmış olabilir.
//
// Denetim aynı kalıbı arıyor: RLS açık + politika yok + o tabloyu
// ÇAĞIRANIN YETKİSİYLE okuyan bir yer var (invoker fonksiyon ya da
// panel kodu). Politikasız ama hiçbir yerden okunmayan tablo (ArvoOS
// köprüsünün yazdığı kopyalar) yalnızca listelenir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semaYolu = process.argv[2] ?? path.join(kok, "supabase/schema/canli-sema.sql");
const kaynakKok = process.argv[3] ?? path.join(kok, "src");

const sema = fs.readFileSync(semaYolu, "utf8");

/** RLS açık tablolar. */
const rlsli = new Set([...sema.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]));
/** Politikası olan tablolar. */
const politikali = new Set([...sema.matchAll(/create policy [^\n]*? on public\.(\w+)/g)].map((m) => m[1]));

/*
  SECURITY DEFINER OLMAYAN fonksiyonlar çağıranın yetkisiyle işler;
  gövdelerinde geçen tablo adları RLS'e tabidir.
*/
const invoker = [];
for (const eslesme of sema.matchAll(/CREATE OR REPLACE FUNCTION (public|private)\.(\w+)\([\s\S]*?AS \$function\$([\s\S]*?)\n\$function\$/g)) {
  const [tam, sema_adi, ad, govde] = eslesme;
  const baslik = tam.slice(0, tam.indexOf("AS $function$"));
  if (!baslik.includes("SECURITY DEFINER")) invoker.push({ ad: `${sema_adi}.${ad}`, govde });
}

/** Panel kodu: kullanıcının oturumuyla okunan tablolar. */
function kaynakDosyalari(dizin) {
  const cikti = [];
  for (const oge of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, oge.name);
    if (oge.isDirectory()) cikti.push(...kaynakDosyalari(tam));
    else if (/\.(ts|tsx)$/.test(oge.name)) cikti.push(tam);
  }
  return cikti;
}
const kaynak = kaynakDosyalari(kaynakKok).map((dosya) => ({ yol: path.relative(kok, dosya), metin: fs.readFileSync(dosya, "utf8") }));

const sorunlar = [];
const sessizler = [];
for (const tablo of [...rlsli].sort()) {
  if (politikali.has(tablo)) continue;
  const fonksiyonlar = invoker.filter((f) => new RegExp(`\\b${tablo}\\b`).test(f.govde)).map((f) => f.ad);
  /* Servis anahtarıyla okuyan dosyalar RLS'in dışında: onlar sayılmıyor. */
  const dosyalar = kaynak
    .filter((d) => d.metin.includes(`from("${tablo}")`) && !d.metin.includes("createServiceClient") && !d.metin.includes("SERVICE_ROLE"))
    .map((d) => d.yol);
  if (fonksiyonlar.length || dosyalar.length) {
    sorunlar.push(`${tablo}: RLS açık ama politika yok — ${[...fonksiyonlar.map((f) => `invoker fonksiyon ${f}`), ...dosyalar.map((d) => `panel kodu ${d}`)].join(", ")}`);
  } else {
    sessizler.push(tablo);
  }
}

if (sorunlar.length) {
  console.error("RLS denetimi: politikasız tablo çağıranın yetkisiyle okunuyor (sorgu sessizce boş döner)\n");
  for (const sorun of sorunlar) console.error(`  ✖ ${sorun}`);
  console.error("\nÇözüm: tabloya SELECT politikası yazın (üyelik üzerinden) ya da okuyan fonksiyonu SECURITY DEFINER yapın.");
  process.exit(1);
}

console.log(`✓ RLS denetimi: ${rlsli.size} tablo, politikasız ve okunan tablo yok${sessizler.length ? ` (politikasız ama okunmayan: ${sessizler.join(", ")})` : ""}`);
