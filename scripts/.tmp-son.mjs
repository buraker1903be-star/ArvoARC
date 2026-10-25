import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { giysiTuruDogru } from "../src/lib/ceviri/dogrula.ts";
for (const s of fs.readFileSync(".env.local","utf8").split("\n")) {
  const e = s.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (e && !process.env[e[1]]) process.env[e[1]] = e[2].replace(/^["']|["']$/g,"");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const hepsi = [];
for (let s = 0; ; s += 1) {
  const { data } = await db.from("arc_products").select("slug,organization_id,name,name_en,description,description_en")
    .eq("status","active").eq("international_blocked",false).order("slug").range(s*1000, s*1000+999);
  if (!data?.length) break; hepsi.push(...data); if (data.length < 1000) break;
}
const adYok = hepsi.filter(p=>!p.name_en);
const ihlal = hepsi.filter(p=>p.name_en && giysiTuruDogru(p.name,p.name_en)!==null);
const acYok = hepsi.filter(p=>(p.description??"").trim() && !p.description_en);
console.log(`toplam ${hepsi.length}`);
console.log(`  adı çevrilmemiş      ${adYok.length}`);
console.log(`  adı denetime takılan ${ihlal.length}`);
console.log(`  açıklaması eksik     ${acYok.length}`);
const sebep = new Map();
for (const p of ihlal) { const s=giysiTuruDogru(p.name,p.name_en); sebep.set(s,(sebep.get(s)??0)+1); }
for (const [k,n] of [...sebep.entries()].sort((a,b)=>b[1]-a[1])) console.log(`    ${String(n).padStart(4)}  ${k}`);
console.log("\nörnekler:");
for (const p of ihlal.slice(0,6)) console.log(`  ${p.name}\n   → ${p.name_en}\n   (${giysiTuruDogru(p.name,p.name_en)})`);
