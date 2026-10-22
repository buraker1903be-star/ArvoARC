import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync("/Users/burakerdogan/Projects/ArvoARC/.env.local", "utf8")
    .split("\n").filter((s) => s.includes("="))
    .map((s) => [s.slice(0, s.indexOf("=")).trim(), s.slice(s.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

/*
  ELLE YAZILAN KARŞILIKLAR. Model bunları ya uydurdu ya da bağlamsız
  bir-iki kelimede yanıldı; hiçbiri mekanik denetimle yakalanamaz
  (hepsi geçerli İngilizce).
*/
const DOGRUSU = {
  // Model UYDURDU: kaynakta olmayan "Men's" ekledi.
  "Göz": "Eye",
  "Göz Çevresi": "Eye Contour",
  "Haftanın Fırsatları": "Deals of the Week",
  // Marka adi: cevrilmez. "L-Recapin" -> "ArvoCulture" olmustu.
  "L-Recapin": "L-Recapin",
  "Beauty Diamonds": "Beauty Diamonds",
  "Mood Infusion": "Mood Infusion",
  "Doğaden Terrain Club": "Doğaden Terrain Club",
  "The Society Collection": "The Society Collection",
  "Aloe Via": "Aloe Via",
  "Iconic Elixirs": "Iconic Elixirs",
  "Microsilver Plus": "Microsilver Plus",
  "Nanogold": "Nanogold",
  "Platinum": "Platinum",
  "Racine Q10": "Racine Q10",
  "Serox": "Serox",
  "Zeitgard": "Zeitgard",
  "Deodorant & Roll-on": "Deodorant & Roll-on",
  // Urunun NE OLDUGUNU yanlis soyluyordu.
  "Duş Jelleri": "Shower Gels",
  "Kadın Elbise": "Women's Dress",
  "Aksesuar Bere": "Accessories Beanie",
  "Aksesuar Kol Saati": "Accessories Watch",
  "Çocuk Alt Giyim": "Kids' Bottoms",
  "Saç Kremi": "Conditioner",
  "Saç Dökülmesi": "Hair Loss",
  "Erkek Alt Üst Takım": "Men's Top and Bottom Set",
  "Dudak": "Lip",
  "Temizleyiciler": "Cleansers",
  // Mont ile ceket/kaban ayrimi: ikisi ayni ada cokmustu.
  "Erkek Ceket": "Men's Jacket",
  "Erkek Mont": "Men's Coat",
  "Kadın Kaban": "Women's Overcoat",
  "Kadın Mont": "Women's Coat",
  // Hic cevrilemeyenler.
  "Kadın Tayt": "Women's Leggings",
  "Kadın Tulum": "Women's Jumpsuit",
  "Erkek İç Giyim Seti": "Men's Underwear Set",
  // Tutarlilik ve cogul.
  "Kadın": "Women's",
  "Serumlar": "Serums",
  "Tonikler": "Toners",
  "Vücut Losyonları": "Body Lotions",
  "Erkek Pantolon": "Men's Trousers",
  "Kadın Pantolon": "Women's Trousers",
  "Saç Şekillendirici": "Hair Styling",
  "Regular Fit": "Regular Fit",
};

const r = await fetch(`${url}/rest/v1/arc_collections?select=slug,title,title_en,organization_id&status=eq.active&limit=200`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
const satirlar = await r.json();
let degisen = 0, atlanan = [];
for (const [baslik, dogru] of Object.entries(DOGRUSU)) {
  const kayit = satirlar.find((s) => s.title === baslik);
  if (!kayit) { atlanan.push(`${baslik}: koleksiyon bulunamadi`); continue; }
  if (kayit.title_en === dogru) continue;
  const y = await fetch(
    `${url}/rest/v1/arc_collections?organization_id=eq.${kayit.organization_id}&slug=eq.${encodeURIComponent(kayit.slug)}`,
    { method: "PATCH", headers: h, body: JSON.stringify({ title_en: dogru, translated_at: new Date().toISOString() }) },
  );
  if (!y.ok) { atlanan.push(`${baslik}: ${(await y.text()).slice(0, 80)}`); continue; }
  console.log(`${baslik.padEnd(26)} ${String(kayit.title_en ?? "(yok)").padEnd(26)} -> ${dogru}`);
  degisen += 1;
}
console.log(`\n${degisen} koleksiyon duzeltildi`);
if (atlanan.length) { console.log("ATLANAN:"); for (const a of atlanan) console.log("  " + a); }
