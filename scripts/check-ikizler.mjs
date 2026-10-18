#!/usr/bin/env node
/*
  KİRACI İKİZLERİ AYRIŞMASIN.

  Vitrin fonksiyonlarının iki ailesi var: çok kiracılı
  `arc_storefront_*` (adresten mağazayı çözer) ve ArvoCulture'a özel
  `get_arvoculture_storefront_*`. Gövdeleri aynı olmak zorunda;
  farklı olan yalnızca kiracının nasıl bulunduğu.

  NEDEN VAR: 17.10.2026'da ikisi ayrışmış hâlde bulundu.
  `arc_storefront_search_index` ve `arc_storefront_product_slugs`,
  ikizleri 29–30.09'da düzeltilirken dışarıda kalmıştı: `limit 20000`
  diyorlar ama PostgREST tek istekte 1000 satır döndürüyor ve
  `p_offset` olmadığı için ikinci sayfa istenemiyor. ArvoCulture'da bu
  hata müşterinin satın alabildiği ürünü arayıp bulamamasına yol
  açmıştı; ikinci kiracı açılırken aynısı yeniden yaşanacaktı.

  Aynı gün altı fonksiyonda "stokta var mı" sorusu iki ayrı biçimde
  yanıtlanıyordu ve düzeltme iki aileye ayrı ayrı uygulanmak
  zorunda kaldı. Bu denetim o zorunluluğu hatırlatıyor: ikizi
  güncellemeyi unutursan CI söylüyor.

  Kiracı çözümü satırları karşılaştırmadan çıkarılıyor:
  `arc_storefront_org(p_host)` ve `slug = 'arvoculture'`.
*/
import { readFileSync } from "node:fs";

const semaYolu = process.argv[2] ?? "supabase/schema/canli-sema.sql";
const sema = readFileSync(semaYolu, "utf8");

const FONKSIYON = /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(([\s\S]*?)\)\n([\s\S]*?)\n\$function\$\n;/g;
const fonksiyonlar = new Map();
for (const eslesme of sema.matchAll(FONKSIYON)) {
  fonksiyonlar.set(eslesme[1], eslesme[0]);
}

/*
  Adı aynı kökten gelmeyen ikizler. İkisi de ince sarmalayıcı:
  ağır mantık ortak fonksiyonda (arc_check_coupon,
  arc_create_storefront_order), bu yüzden gövdeleri de aynı kalmalı.
*/
const ELLE_CIFTLER = [
  ["arc_storefront_coupon", "check_arvoculture_coupon"],
  ["arc_storefront_return_request", "create_arvoculture_return_request"],
];

/*
  İkizi BİLEREK olmayanlar. `arc_storefront_create_order` ortak
  fonksiyonu sarıyor ve ArvoCulture o ortak fonksiyonu kendi
  kurumuyla çağırıyor; `arc_storefront_payment_methods` karşılığını
  mağaza ayarlarından okuyor; `arc_storefront_org` kiracı çözümünün
  kendisi.

  `arc_storefront_order_status` kiracıyı ALAN ADINDAN ÇÖZMÜYOR:
  müşterinin bağlantısındaki anahtar tek bir siparişi buluyor, sipariş
  de kendi mağazasını taşıyor. Alan adı sormak hiçbir şeyi
  korumazdı — anahtar zaten tek mağazaya ait. İkizi olmaması bu
  yüzden eksiklik değil, tasarım.
*/
const IKIZSIZ_SERBEST = new Set([
  "arc_storefront_create_order",
  "arc_storefront_order_status",
  "arc_storefront_org",
  "arc_storefront_payment_methods",
  /*
    Hesap alanı: tek mağazalı karşılıkları get_arvoculture_MY_orders /
    _returns, yani "storefront" eki olmayan BAŞKA bir adlandırmada.
    Denetimin aradığı get_arvoculture_storefront_* kalıbına uymuyorlar
    ve uydurmak için eski fonksiyonları yeniden adlandırmak gerekirdi —
    onlar ArvoCulture vitrini eski adı bırakana kadar yaşıyor.
  */
  "arc_storefront_my_orders",
  "arc_storefront_my_returns",
  /*
    Hediye çekleri de hesap alanı ve ArvoCulture'a özel bir
    karşılığı HİÇ OLMADI: tablo (arc_gift_cards) çok kiracılı
    doğdu, ilk okuyucusu bu fonksiyon. İkiz yazmak yalnızca
    denetimi memnun etmek için ikinci bir fonksiyon açmak olurdu.
  */
  "arc_storefront_my_gift_cards",
  /*
    Birincil adres sorusu kiracıya özel olamaz: yanıtı zaten
    kiracının kendi ayarından geliyor ve ArvoCulture'a özel bir
    ikizi "hangi adres ArvoCulture'ın" demek olurdu — bilinen şeyi
    soran bir fonksiyon.
  */
  "arc_storefront_primary_host",
  /*
    Tanıtım sayfalarının metni: ArvoCulture'a özel bir ikizi hiç
    olmadı — tablo (arc_store_pages) çok kiracılı tasarlandı ve ilk
    okuyucusu bu fonksiyon. İkiz yazmak, yalnızca bu denetimi
    memnun etmek için ikinci bir fonksiyon açmak olurdu.
  */
  "arc_storefront_pages",
  /*
    Satıcı bilgisi: eski aile burada BAŞKA bir adlandırmada —
    `get_storefront_seller(p_tenant)`, yani "arvoculture" eki yok.
    Denetimin aradığı get_arvoculture_storefront_* kalıbına uymuyor
    ve uydurmak için eski fonksiyonu yeniden adlandırmak gerekirdi;
    o ad ArvoCulture vitrini güncellenip dağıtılana kadar yaşıyor
    (silinirse hukuki sayfalar yedek sabitlere düşer).
  */
  "arc_storefront_seller",
]);

/*
  Karşılaştırma için sadeleştirme.

  Kiracı çözümü iki aile arasında zorunlu olarak farklı, o yüzden tek
  bir simgeye indiriliyor. YORUMLAR da çıkarılıyor: ArvoCulture ikizi
  genellikle olayın tarihçesini taşıyor ("60 yetmiyordu: …") ve bunu
  çok kiracılı ikizine kopyalamak zorunlu değil — denetimin ölçtüğü
  şey DAVRANIŞ. Boşluk da düzleniyor; satır kaydırmak bir fark
  değil.
*/
const sadelestir = (metin) =>
  metin
    .replace(/^CREATE OR REPLACE FUNCTION[^\n]*\n/, "")
    /* Blok ve satır yorumları. */
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    /* Kiracı çözümünün üç biçimi. */
    .replace(/\(\s*select id from public\.organizations where slug\s*=\s*'arvoculture' limit 1\s*\)/g, "KURUM")
    .replace(/public\.arc_storefront_org\(p_host\)/g, "KURUM")
    /* Takma ad değişiyor (o, org, …), o yüzden adı kalıba bırakılıyor. */
    .replace(/\w+\.id\s*=\s*KURUM/g, "KURUM_KOSULU")
    .replace(/\w+\.slug\s*=\s*'arvoculture'/g, "KURUM_KOSULU")
    /* İmzadaki kiracı parametresi. */
    .replace(/p_host text\s*,\s*/g, "")
    .replace(/p_host text/g, "")
    .replace(/\s+/g, " ")
    /* Paranteze yapışık boşluk fark değil: biri kiracı çözümünü tek
       satıra yazıyor, öteki alt satıra indiriyor ve boşluk düzlenince
       "x(KURUM" ile "x( KURUM" ayrışmış görünüyordu. */
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*,\s*/g, ",")
    .trim();

/*
  Elle eşlenen çiftler yalnızca İKİSİ DE şemada varsa sınanıyor:
  fikstür dosyaları tek bir çift içeriyor ve "biri yok" demek
  denetimi fikstürlerde kullanılamaz hâle getirirdi. Gerçek şemada
  ikisi de duruyor; biri silinirse `check:schema` onu kodun
  kullandığı yerden yakalar.
*/
const ciftler = ELLE_CIFTLER.filter(
  ([a, b]) => fonksiyonlar.has(a) && fonksiyonlar.has(b),
);
const ikizsiz = [];
for (const ad of fonksiyonlar.keys()) {
  if (!ad.startsWith("arc_storefront_")) continue;
  if (ELLE_CIFTLER.some(([kiraci]) => kiraci === ad)) continue;
  const ikiz = `get_arvoculture_storefront_${ad.slice("arc_storefront_".length)}`;
  if (fonksiyonlar.has(ikiz)) ciftler.push([ad, ikiz]);
  else if (!IKIZSIZ_SERBEST.has(ad)) ikizsiz.push(ad);
}

const sorunlar = [];
for (const [kiraci, arvoculture] of ciftler.sort()) {
  if (!fonksiyonlar.has(kiraci) || !fonksiyonlar.has(arvoculture)) {
    sorunlar.push(`${kiraci} ↔ ${arvoculture}: biri şemada yok`);
    continue;
  }
  const a = sadelestir(fonksiyonlar.get(kiraci));
  const b = sadelestir(fonksiyonlar.get(arvoculture));
  if (a !== b) {
    /* İlk ayrışan yeri göster: tam gövdeyi basmak okunmaz olurdu. */
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    const pencere = 90;
    sorunlar.push(
      `${kiraci} ↔ ${arvoculture}: gövdeler ayrışmış (${i}. karakterden sonra)\n` +
        `      kiracı     : …${a.slice(i, i + pencere)}\n` +
        `      arvoculture: …${b.slice(i, i + pencere)}`,
    );
  }
}

for (const ad of ikizsiz) {
  sorunlar.push(
    `${ad}: ArvoCulture ikizi yok. İkizini yazın ya da bilinçli bir istisnaysa ` +
      `scripts/check-ikizler.mjs içindeki IKIZSIZ_SERBEST listesine gerekçesiyle ekleyin.`,
  );
}

if (sorunlar.length > 0) {
  console.error(`✗ Kiracı ikizi denetimi: ${sorunlar.length} sorun`);
  for (const sorun of sorunlar) console.error(`  ${sorun}`);
  process.exit(1);
}

console.log(
  `✓ Kiracı ikizi denetimi: ${ciftler.length} çift gövdece aynı (kiracı çözümü dışında)`,
);
