/*
  ÜRÜN AÇIKLAMALARININ İNGİLİZCESİNİ YAZAR — MODEL KULLANMAZ.

  Çeviri kararı `src/lib/ceviri/aciklama.ts` içinde ve saf; burada
  yalnızca okuma/yazma var. Gerekçe orada yazılı: açıklama bir HTML
  tablosu, sözcük dağarcığı dar ve kapalı, sayılar beden-kilo
  eşlemesi. Eşleme tablosu modelden hem hızlı hem KESİN.

  KAPSAM EŞİĞİNİ GEÇEMEYEN AÇIKLAMA YAZILMAZ ve bu bilinçli: yarı
  Türkçe bir tablo, Türkçe bir tablodan kötü.

  ADI ÇEVRİLMEMİŞ ÜRÜNE AÇIKLAMA YAZILMAZ. Adı Türkçe, açıklaması
  İngilizce bir kart tutarsız görünüyor; ad çeviri turunda
  yazıldığında bu betik yeniden koşturulur.

  Varsayılan KURU TUR. Yazmak için: npm run aciklama -- --yaz
*/
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { aciklamaCevir, KAPSAM_ESIGI } from "../src/lib/ceviri/aciklama.ts";

for (const satir of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const esit = satir.indexOf("=");
  if (esit > 0 && !satir.trimStart().startsWith("#")) {
    const ad = satir.slice(0, esit).trim();
    if (!process.env[ad]) process.env[ad] = satir.slice(esit + 1).trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anahtar = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anahtar) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
  process.exit(1);
}

const YAZ = process.argv.includes("--yaz");
/*
  YENİDEN KİPİ (25.10.2026).

  Betik normalde yalnızca `description_en is null` olan ürünlere
  bakıyor, yani KURAL DÜZELDİĞİNDE eski satırlar olduğu yerde
  kalıyor. Bedeli ölçüldü: yazılmış 2.451 İngilizce açıklamanın
  370'inde Türkçe metin duruyordu ("50 - 59 Kg Uygundur." 90
  üründe) ve kapsam denetimi bunu göremiyordu çünkü "uygundur"
  Türkçeye özgü harf taşımıyor (lib/ceviri/aciklama → TURKCE_ASCII).

  `--yeniden` çevirisi OLAN ürünleri de alıyor. Yazma koşulu aynı:
  eşiği geçecek ve rakamlar birebir duracak. Sonuç eskisiyle
  aynıysa yazılmıyor — gereksiz bir güncelleme kütüğü kabartmaktan
  başka işe yaramaz.
*/
const YENIDEN = process.argv.includes("--yeniden");
const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
};
const ADET = Number(arg("adet", 4000));

const supabase = createClient(url, anahtar, { auth: { persistSession: false } });

/*
  POSTGREST BİN SATIRDA KESİYOR ve bunu SÖYLEMİYOR (25.10.2026).

  `.limit(4000)` yazmak yetmiyor: Supabase'in `max-rows` ayarı yanıtı
  1.000 satırda kesiyor, hata da vermiyor. Bu betik 2.625 ürünün
  hepsini aldığını sanıp 1.000'ini işliyor, "832 açıklama yazılabilir"
  deyip bitiyordu — kalan 1.600 ürüne hiç bakılmadı ve hiçbir yerde
  hata görünmedi. Vitrinde o ürünlerin açıklaması Türkçe duruyordu.

  Aynı tuzak bu depoda üç kez kuruldu: arama dizini ve site haritası
  (AGENTS.md, 17.10.2026), çeviri betiği (23.10.2026) ve burası.
  Çözüm aynı: `range` ile bin'er bin'er okumak.
*/
const SAYFA = 1000;
const data = [];
for (let sayfa = 0; data.length < ADET; sayfa += 1) {
  const bas = sayfa * SAYFA;
  let sorgu = supabase
    .from("arc_products")
    .select("slug, organization_id, name, name_en, description, description_en")
    .eq("status", "active")
    .eq("international_blocked", false)
    /* Adı çevrilmiş ürünler; açıklama koşulu aşağıda. */
    .not("name_en", "is", null)
    .order("slug")
    .range(bas, Math.min(bas + SAYFA, ADET) - 1);
  /* Varsayılan: yalnızca çevirisi olmayanlar. */
  if (!YENIDEN) sorgu = sorgu.is("description_en", null);
  const { data: dilim, error } = await sorgu;

  if (error) {
    console.error("ürünler okunamadı:", error.message);
    process.exit(1);
  }
  if (!dilim || dilim.length === 0) break;
  data.push(...dilim);
  /* Sayfa dolmadıysa katalogun sonundayız. */
  if (dilim.length < SAYFA) break;
}

console.log(
  `${data.length} ürün · eşik %${KAPSAM_ESIGI * 100} · ` +
    `${YENIDEN ? "YENİDEN (çevrilmişler dahil)" : "yalnızca çevrilmemişler"} · ` +
    `${YAZ ? "YAZILACAK" : "KURU TUR"}\n`,
);

let yazilan = 0;
let elenen = 0;
let bosAciklama = 0;
let degismeyen = 0;
let kusurlu = 0;
const ornekler = [];

for (const urun of data) {
  const kaynak = (urun.description ?? "").trim();
  if (!kaynak) {
    bosAciklama += 1;
    continue;
  }

  const { html, kapsam } = aciklamaCevir(kaynak);

  if (kapsam < KAPSAM_ESIGI) {
    elenen += 1;
    if (ornekler.length < 5) {
      ornekler.push(`  ${urun.slug}: kapsam %${(kapsam * 100).toFixed(0)}`);
    }
    /*
      ESKİ KUSURLU ÇEVİRİ TEMİZLENİYOR (25.10.2026, yalnızca --yeniden).

      Kurallar düzelmeden yazılmış bazı satırlar YARIM TÜRKÇE:
      "Fabric Osy Modal soft dokulu … Detail Hemşire neckline".
      Bu, Türkçe bir tablodan KÖTÜ — müşteri hangi satıra
      güveneceğini bilemiyor — ve satır eşiği geçemediği için
      düzeltilemiyor da.

      ÖLÇEREK ayrılıyor, toptan silinmiyor: yazılmış metnin KENDİSİ
      kapsamdan geçiriliyor; içinde çevrilmemiş Türkçe sözcük
      kalmışsa kusurludur. Tamamı İngilizce olan satır (ör. elle
      yazılmış hediye kartı metni) olduğu gibi KALIYOR — 39 satırın
      biri tam da böyleydi ve toptan silme onu kaybederdi.

      Temizlenen satır Türkçeye düşüyor ve modele gidiyor
      (scripts/aciklama-modelle.mjs).
    */
    if (YENIDEN && urun.description_en) {
      const { kapsam: yaziliKapsam } = aciklamaCevir(urun.description_en);
      if (yaziliKapsam >= 1) continue;
      kusurlu += 1;
      if (!YAZ) continue;
      const { error: silmeHatasi } = await supabase
        .from("arc_products")
        .update({ description_en: null })
        .eq("organization_id", urun.organization_id)
        .eq("slug", urun.slug);
      if (silmeHatasi) console.error(`  ✗ ${urun.slug}: ${silmeHatasi.message}`);
    }
    continue;
  }

  /*
    SON DENETİM — SAYI KORUNMASI. Eşleme tablosu sayılara hiç
    dokunmuyor ama bu bir VARSAYIM; varsayımı her kayıtta sınamak
    ucuz ve bozulduğu gün sessiz kalmasını engelliyor.
  */
  const oncesi = (kaynak.match(/\d+/g) ?? []).join(",");
  const sonrasi = (html.match(/\d+/g) ?? []).join(",");
  if (oncesi !== sonrasi) {
    console.error(`  ✗ ${urun.slug}: SAYI DEĞİŞTİ, yazılmadı`);
    elenen += 1;
    continue;
  }

  /* Sonuç eskisiyle birebir aynıysa yazmaya gerek yok. */
  if (html === urun.description_en) {
    degismeyen += 1;
    continue;
  }

  if (!YAZ) {
    yazilan += 1;
    continue;
  }

  const { error: yazmaHatasi } = await supabase
    .from("arc_products")
    .update({ description_en: html })
    .eq("organization_id", urun.organization_id)
    .eq("slug", urun.slug);

  if (yazmaHatasi) {
    console.error(`  ✗ ${urun.slug}: ${yazmaHatasi.message}`);
    continue;
  }
  yazilan += 1;
  if (yazilan % 100 === 0) process.stdout.write(".");
}

console.log(`\n✓ ${yazilan} açıklama ${YAZ ? "yazıldı" : "yazılabilir"}`);
if (degismeyen) console.log(`  ${degismeyen} açıklama zaten güncel`);
if (kusurlu) {
  console.log(
    `  ${kusurlu} yarım Türkçe çeviri ${YAZ ? "temizlendi" : "temizlenecek"} ` +
      "(Türkçeye düşüyor; modele gidecek)",
  );
}
console.log(`! ${elenen} açıklama eşiği geçemedi (Türkçe kalıyor)`);
if (bosAciklama) console.log(`  ${bosAciklama} üründe açıklama yok`);
if (ornekler.length) {
  console.log("\nelenen örnekler:");
  for (const o of ornekler) console.log(o);
}
if (!YAZ) console.log("\n(kuru tur — hiçbir şey yazılmadı; --yaz ile uygulanır)");
