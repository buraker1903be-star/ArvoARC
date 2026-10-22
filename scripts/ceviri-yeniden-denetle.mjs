import fs from "node:fs";
const { ceviriKarari, AD_SINIRI } = await import("/Users/burakerdogan/Projects/ArvoARC/src/lib/ceviri/dogrula.ts");
const env = Object.fromEntries(
  fs.readFileSync("/Users/burakerdogan/Projects/ArvoARC/.env.local", "utf8")
    .split("\n").filter((s) => s.includes("="))
    .map((s) => [s.slice(0, s.indexOf("=")).trim(), s.slice(s.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const YAZ = process.argv.includes("--yaz");

const r = await fetch(`${url}/rest/v1/arc_products?select=slug,name,name_en,organization_id&name_en=not.is.null&limit=1000`, { headers: h });
const d = await r.json();
const kotu = [];
for (const p of d) {
  const karar = ceviriKarari(p.name_en, p.name, AD_SINIRI, true);
  if (!karar.kabul) kotu.push({ ...p, sebep: karar.sebep });
}
console.log(`${d.length} cevrili kayit yeni denetimden geciriliyor`);
console.log(`YENI DENETIME TAKILAN: ${kotu.length}\n`);
const sebepler = new Map();
for (const k of kotu) sebepler.set(k.sebep, (sebepler.get(k.sebep) ?? 0) + 1);
for (const [s, n] of [...sebepler].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)} × ${s}`);
console.log("\nornekler:");
for (const k of kotu.slice(0, 6)) console.log(`  TR: ${k.name.slice(0, 58)}\n  EN: ${k.name_en.slice(0, 58)}\n      -> ${k.sebep}`);

if (!YAZ) { console.log("\n(kuru tur — hicbir sey yazilmadi, --yaz ile sifirlanir)"); process.exit(0); }
let sifirlanan = 0;
for (const k of kotu) {
  const y = await fetch(`${url}/rest/v1/arc_products?organization_id=eq.${k.organization_id}&slug=eq.${encodeURIComponent(k.slug)}`, {
    method: "PATCH", headers: h,
    body: JSON.stringify({ name_en: null, description_en: null, translated_at: null }),
  });
  if (y.ok) sifirlanan += 1;
  else console.error(`  ✗ ${k.slug}: ${(await y.text()).slice(0, 70)}`);
}
console.log(`\n${sifirlanan} kayit sifirlandi; sonraki turda yeniden denenecek.`);
