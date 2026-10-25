import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { giysiTuruDogru, uydurmaOzellik } from "../src/lib/ceviri/dogrula.ts";
for (const s of fs.readFileSync(".env.local","utf8").split("\n")) {
  const e = s.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (e && !process.env[e[1]]) process.env[e[1]] = e[2].replace(/^["']|["']$/g,"");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const hepsi = [];
for (let s = 0; ; s += 1) {
  const { data } = await db.from("arc_products").select("slug,name,name_en,description,description_en")
    .eq("status","active").eq("international_blocked",false).order("slug").range(s*1000, s*1000+999);
  if (!data?.length) break; hepsi.push(...data); if (data.length < 1000) break;
}
const yok = hepsi.filter(p=>!p.name_en).length;
const tur = hepsi.filter(p=>p.name_en && giysiTuruDogru(p.name,p.name_en)).length;
const uyd = hepsi.filter(p=>p.name_en && !giysiTuruDogru(p.name,p.name_en) && uydurmaOzellik(p.name,p.name_en)).length;
const ac = hepsi.filter(p=>(p.description??"").trim());
console.log(`ad: çevirili ${hepsi.length-yok}/${hepsi.length} · eksik ${yok} · giysi türü ${tur} · uydurma ${uyd}`);
console.log(`açıklama: çevirili ${ac.filter(p=>p.description_en).length}/${ac.length} · eksik ${ac.filter(p=>!p.description_en).length}`);
