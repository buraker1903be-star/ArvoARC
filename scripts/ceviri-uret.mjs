// İNGİLİZCE ÇEVİRİ ÜRETİCİ — SENİN MAKİNENDE koşar.
//
//   node scripts/ceviri-uret.mjs --kuru            (hiçbir şey yazmaz, gösterir)
//   node scripts/ceviri-uret.mjs --adet 200        (200 ürün çevirip yazar)
//   node scripts/ceviri-uret.mjs --koleksiyon      (koleksiyon başlıkları)
//
// NEDEN ZAMANLANMIŞ İŞ DEĞİL: model KENDİ SUNUCUNDA (kurum sahibinin
// kararı — ücret yok, ürün verisi dışarı çıkmıyor) ve Vercel'in
// zamanlayıcısı o sunucuya erişemiyor. Betik senin makinende koşuyor,
// modele localhost'tan, Supabase'e servis anahtarıyla gidiyor. Model
// sunucusunu internete açmak gerekmiyor.
//
// Gerekli ortam değişkenleri (.env.local ya da kabuktan):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   AI_TABAN_URL    örn. http://localhost:11434/v1   (Ollama)
//   AI_MODEL        örn. qwen2.5:14b-instruct
//   AI_ANAHTAR      (kendi sunucunda genellikle gerekmez)
//
// ArvoLab'deki sağlayıcı kalıbının aynısı: Ollama, vLLM, LM Studio ve
// TGI aynı "chat/completions" arayüzünü konuşuyor, yani adres dışında
// hiçbir fark yok.
//
// İŞ KALDIĞI YERDEN DEVAM EDER: yalnızca `name_en is null` olan
// ürünler okunuyor. Yarıda kesilen bir koşu veri bozmuyor, ikinci
// koşu kalanı alıyor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  AD_SINIRI,
  ACIKLAMA_SINIRI,
  ceviriKarari,
  jsonCikar,
  koleksiyonIstemi,
  urunIstemi,
} from "../src/lib/ceviri/dogrula.ts";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* .env.local okunuyor: betik elle koşuyor ve değişkenleri her seferinde
   kabuğa yazmak gereksiz sürtünme. */
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
const KURU = process.argv.includes("--kuru");
const KOLEKSIYON = process.argv.includes("--koleksiyon");
const ADET = Number(arg("adet", 50));
/* PARTİ BOYU KÜÇÜK: küçük modeller uzun listelerde slug'ları
   karıştırıyor ve bütün parti çöpe gidiyor. On ürün, bir hatada en
   fazla on ürün kaybı demek. */
const PARTI = Number(arg("parti", 10));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anahtar = process.env.SUPABASE_SERVICE_ROLE_KEY;
const taban = process.env.AI_TABAN_URL;
const model = process.env.AI_MODEL;

const eksik = [
  !url && "NEXT_PUBLIC_SUPABASE_URL",
  !anahtar && "SUPABASE_SERVICE_ROLE_KEY",
  !taban && "AI_TABAN_URL",
  !model && "AI_MODEL",
].filter(Boolean);
if (eksik.length) {
  console.error(`✗ Eksik ortam değişkeni: ${eksik.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(url, anahtar, { auth: { persistSession: false } });

/**
 * Modele sor. Zaman aşımı ŞART: fetch varsayılanda süresiz bekliyor
 * ve soğuk başlayan bir yerel model dakikalarca susabiliyor.
 */
async function sor(istem) {
  const kontrol = AbortSignal.timeout(Number(process.env.AI_ZAMAN_ASIMI_MS ?? 120_000));
  const yanit = await fetch(`${taban.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: kontrol,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_ANAHTAR ? { Authorization: `Bearer ${process.env.AI_ANAHTAR}` } : {}),
    },
    body: JSON.stringify({
      model,
      /* Sıcaklık 0: çeviri yaratıcılık değil, kararlılık istiyor. */
      temperature: 0,
      /*
        ÇIKTI SINIRI AÇIKÇA VERİLİYOR — canlıda ölçüldü.

        Sınır verilmeyince Ollama kendi varsayılanında kesiyor ve
        model on kalemlik partinin ilk üç-dördünü yazıp duruyordu:
        JSON geçerli ama EKSİK. Betik kalanları "yanıtta yok" diye
        atlıyordu — yani çeviri sessizce yarım kalıyor, hata da
        vermiyordu. İlk koşuda 22 kaydın 20'si bu yüzden atlandı.

        Dört bin jeton on kalemlik bir partiye bol: ürün adı ~40,
        açıklama ~300 jeton.
      */
      max_tokens: 4000,
      messages: [{ role: "user", content: istem }],
    }),
  });
  if (!yanit.ok) throw new Error(`model ${yanit.status}: ${(await yanit.text()).slice(0, 200)}`);
  const veri = await yanit.json();
  return veri?.choices?.[0]?.message?.content ?? "";
}

async function urunler() {
  const { data, error } = await supabase
    .from("arc_products")
    .select("slug, name, description")
    .is("name_en", null)
    .eq("status", "active")
    /* Yurtdışına gönderilemeyen ürün İngilizce vitrinde HİÇ
       görünmüyor; çevirisi boşa iş olurdu. */
    .eq("international_blocked", false)
    .order("slug")
    .limit(ADET);
  if (error) throw new Error(`ürünler okunamadı: ${error.message}`);
  return data ?? [];
}

async function koleksiyonlar() {
  const { data, error } = await supabase
    .from("arc_collections")
    .select("slug, title, description")
    .is("title_en", null)
    .eq("status", "active")
    .order("slug")
    .limit(ADET);
  if (error) throw new Error(`koleksiyonlar okunamadı: ${error.message}`);
  return data ?? [];
}

function partilere(liste, boy) {
  const cikti = [];
  for (let i = 0; i < liste.length; i += boy) cikti.push(liste.slice(i, i + boy));
  return cikti;
}

async function calistir() {
  const kayitlar = KOLEKSIYON ? await koleksiyonlar() : await urunler();
  if (kayitlar.length === 0) {
    console.log(`✓ Çevirisi eksik ${KOLEKSIYON ? "koleksiyon" : "ürün"} yok.`);
    return;
  }
  console.log(
    `${kayitlar.length} ${KOLEKSIYON ? "koleksiyon" : "ürün"} · parti ${PARTI} · model ${model}` +
      (KURU ? " · KURU ÇALIŞTIRMA (yazılmayacak)" : ""),
  );

  let kabul = 0;
  const atlanan = [];
  /* İkinci turda tek tek denenecek kayıtlar. */
  const yeniden = [];

  /*
    İKİ TUR: önce partiler, sonra atlananlar TEK TEK.

    Sıcaklık 0 olduğu için betiği yeniden koşturmak AYNI sonucu
    veriyor — atlanan kayıt sonsuza kadar atlanırdı. Ama bağlam
    değişince sonuç da değişiyor: on kalemlik bir partide atlanan
    ürün, tek başına sorulduğunda genellikle doğru çevriliyor
    (model bütün dikkatini ona veriyor).

    İkinci tur yalnızca BAŞARISIZ olanları alıyor, yani maliyeti
    hatanın büyüklüğüyle sınırlı.
  */
  for (let tur = 1; tur <= 2; tur += 1) {
    const kaynak = tur === 1 ? kayitlar : yeniden.slice();
    if (tur === 2) {
      if (kaynak.length === 0) break;
      console.log(`\n! ${kaynak.length} kayıt tek tek yeniden deneniyor…`);
      yeniden.length = 0;
    }

    for (const parti of partilere(kaynak, tur === 1 ? PARTI : 1)) {
    const istem = KOLEKSIYON ? koleksiyonIstemi(parti) : urunIstemi(parti);
    let ham;
    try {
      ham = await sor(istem);
    } catch (sorun) {
      /* Model düştüyse YAZILMIYOR ve iş durmuyor: kalan partiler
         denenmeye devam ediyor, bu parti bir sonraki koşuda gelir. */
      console.error(`  ✗ parti atlandı (${sorun.message})`);
      atlanan.push(...parti.map((k) => `${k.slug}:model`));
      if (tur === 1) yeniden.push(...parti);
      continue;
    }

    const dizi = jsonCikar(ham);
    if (!dizi) {
      console.error(`  ✗ parti atlandı (JSON çıkmadı): ${ham.slice(0, 120)}`);
      atlanan.push(...parti.map((k) => `${k.slug}:json`));
      if (tur === 1) yeniden.push(...parti);
      continue;
    }

    /*
      EŞLEŞME SAYISAL KİMLİKLE. Önce slug ile eşleşiliyordu ve model
      slug'ı ÇEVİRİYORDU ("erkek-atlet" → "men-atlet"): otuz kaydın
      yirmisi "yanıtta yok" diye atlandı, yani çeviri sessizce yarım
      kalıyordu. Kimlik, isteme gönderilen SIRA numarası
      (lib/ceviri/dogrula).
    */
    const gelen = new Map(
      dizi
        .filter((s) => s && Number.isFinite(Number(s.id)))
        .map((s) => [Number(s.id), s]),
    );

    for (const [sira, kayit] of parti.entries()) {
      const satir = gelen.get(sira + 1);
      if (!satir) {
        atlanan.push(`${kayit.slug}:yanıtta yok`);
        if (tur === 1) yeniden.push(kayit);
        continue;
      }

      const kaynakAd = KOLEKSIYON ? kayit.title : kayit.name;
      /*
        HEDEF GRUP DENETİMİ AÇIK (son parametre): kaynak adı
        "Çocuk"/"Kadın"/"Erkek" ile başlıyorsa çeviri karşılığını
        taşımak zorunda. Canlıda ölçüldü — model "Çocuk Unisex
        Baskılı T-Shirt"i "Unisex ... T-Shirt" diye çevirdi ve
        çocuk bedeni bir ürün yetişkin ürünü gibi listelenecekti.

        Açıklamada denetim YOK: açıklama metninde "Kadın" sözcüğü
        geçmek zorunda değil ve zorlamak doğru çevirileri atardı.
      */
      const adKarari = ceviriKarari(
        KOLEKSIYON ? satir.title : satir.name,
        kaynakAd,
        AD_SINIRI,
        !KOLEKSIYON,
      );
      if (!adKarari.kabul) {
        /* AD KABUL EDİLMEZSE SATIR HİÇ YAZILMIYOR: açıklaması
           çevrilmiş ama adı Türkçe kalmış bir ürün, çevirisiz
           üründen kötü görünüyor. */
        atlanan.push(`${kayit.slug}:${adKarari.sebep}`);
        if (tur === 1) yeniden.push(kayit);
        continue;
      }

      /* Açıklama seçmeli: kaynak boşsa çeviri de boş kalıyor ve bu
         kusur değil. Reddedilen açıklama null yazılıyor, yani
         vitrin Türkçe açıklamaya düşüyor. */
      const kaynakAciklama = (kayit.description ?? "").trim();
      let aciklama = null;
      if (kaynakAciklama) {
        const karar = ceviriKarari(satir.description, kaynakAciklama, ACIKLAMA_SINIRI);
        if (karar.kabul) aciklama = karar.metin;
        else atlanan.push(`${kayit.slug}:açıklama ${karar.sebep}`);
      }

      if (KURU) {
        console.log(`  ${kayit.slug}\n    ${kaynakAd}\n    → ${adKarari.metin}`);
        kabul += 1;
        continue;
      }

      const yazilacak = KOLEKSIYON
        ? { title_en: adKarari.metin, description_en: aciklama, translated_at: new Date().toISOString() }
        : { name_en: adKarari.metin, description_en: aciklama, translated_at: new Date().toISOString() };

      const { error } = await supabase
        .from(KOLEKSIYON ? "arc_collections" : "arc_products")
        .update(yazilacak)
        .eq("slug", kayit.slug);

      if (error) {
        console.error(`  ✗ ${kayit.slug} yazılamadı: ${error.message}`);
        atlanan.push(`${kayit.slug}:yazılamadı`);
        continue;
      }
      kabul += 1;
      process.stdout.write(".");
    }
    }
  }

  console.log(`\n✓ ${kabul} kayıt ${KURU ? "çevrilebilir görünüyor" : "yazıldı"}`);
  /*
    LİSTE DENEMELERİ sayıyor, kayıtları değil: ikinci turda düzelen
    bir kayıt birinci turun satırını da taşıyor. Ayıklamak için
    kaydın son durumunu tutmak gerekirdi ve bu liste bir TANI
    aracı — hangi kaydın neden atlandığını görmek için. Başlık bunu
    söylüyor ki sayı yanlış okunmasın.
  */
  if (atlanan.length) {
    console.log(`! ${atlanan.length} deneme atlandı (ikinci turda düzelenler de listede):`);
    for (const satir of atlanan.slice(0, 30)) console.log(`   ${satir}`);
    if (atlanan.length > 30) console.log(`   … ve ${atlanan.length - 30} tane daha`);
    console.log(
      "  İki turda da başarısız olan kayıt çevirisiz kaldı ve vitrinde TÜRKÇE görünüyor.\n" +
        "  Sıcaklık 0 olduğu için betiği yeniden koşturmak AYNI sonucu verir; kalanları\n" +
        "  panelden elle yazın (Ürünler → ürün → İngilizce ad) ya da modeli büyütün.",
    );
  }
}

calistir().catch((sorun) => {
  console.error(`✗ ${sorun.message}`);
  process.exit(1);
});
