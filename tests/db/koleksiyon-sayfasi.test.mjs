// Koleksiyon rafı sayfalanıyor (20261017125314).
//
// Vitrin koleksiyon ürünlerini 200 satırla çekip bellekte süzüyor,
// sıralıyor ve sayfalıyordu; fonksiyonda p_offset de yoktu, yani
// 200'den sonrasına ulaşmanın yolu yoktu. Canlıda /koleksiyon/erkek,
// /kadin ve /cocuk üçü de tam "200 ürün" diyordu.
//
// Yeni fonksiyon katalog sayfasının koleksiyon kısıtlı ikizi: süzme,
// sıralama, sayfalama ve sayım veritabanında.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "dddddddd-0000-0000-0000-000000000001";
const ADET = 30;

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_collections
      (id, organization_id, title, slug, description, status, source, seo_title, seo_description, metadata, created_at, updated_at) values
      (gen_random_uuid(), '${KURUM}', 'Erkek',  'erkek',  '', 'active', 'native', '', '', '{"menu_group":"Erkek"}'::jsonb, now(), now()),
      (gen_random_uuid(), '${KURUM}', 'Kazak',  'kazak',  '', 'active', 'native', '', '', '{"menu_group":"Erkek"}'::jsonb, now(), now()),
      (gen_random_uuid(), '${KURUM}', 'Pasif',  'pasif',  '', 'draft',  'native', '', '', '{"menu_group":"Erkek"}'::jsonb, now(), now());
  `);

  for (let i = 0; i < ADET; i += 1) {
    const indirimli = i % 3 === 0;
    const tukenmis = i % 10 === 0;
    await db.exec(`
      insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
        (gen_random_uuid(), '${KURUM}', 'Ürün ${i}', 'urun-${i}', '', 'active', 'native', now(), now() - interval '${i} minute',
         '{"vendor": "${i % 2 === 0 ? "ARVO" : "LR"}"}'::jsonb);
      insert into public.arc_product_variants
        (id, organization_id, product_id, sku, title, price, compare_at_price, currency, stock, attributes, created_at, updated_at, allow_backorder) values
        (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='urun-${i}' and organization_id='${KURUM}'),
         'S-${i}', 'Siyah / ${i % 2 === 0 ? "M" : "L"}', ${1000 + i * 100}, ${indirimli ? 5000 + i * 100 : "null"}, 'TRY',
         ${tukenmis ? 0 : 20}, '{}'::jsonb, now(), now(), false);
      insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at) values
        ('${KURUM}', (select id from public.arc_collections where slug='erkek' and organization_id='${KURUM}'),
         (select id from public.arc_products where slug='urun-${i}' and organization_id='${KURUM}'), ${i}, now());
    `);
  }

  /* Bir ürün İKİ koleksiyonda: raf onu iki kez göstermemeli. */
  await db.exec(`
    insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at) values
      ('${KURUM}', (select id from public.arc_collections where slug='kazak' and organization_id='${KURUM}'),
       (select id from public.arc_products where slug='urun-0' and organization_id='${KURUM}'), 1, now());
  `);
});

const sayfa = async (parametreler) => {
  const varsayilan = {
    p_collection_slugs: null, p_menu_groups: null, p_limit: 24, p_offset: 0,
    p_brand: null, p_size: null, p_max_price: null,
    p_only_discounted: false, p_only_available: false, p_sort: "onerilen",
    ...parametreler,
  };
  const dizi = (deger) => (deger === null ? "null" : `array[${deger.map((d) => `'${d}'`).join(",")}]::text[]`);
  const metin = (deger) => (deger === null ? "null" : `'${deger}'`);
  const sql = `
    select * from public.get_arvoculture_storefront_collection_products_page(
      ${dizi(varsayilan.p_collection_slugs)}, ${dizi(varsayilan.p_menu_groups)},
      ${varsayilan.p_limit}, ${varsayilan.p_offset},
      ${metin(varsayilan.p_brand)}, ${metin(varsayilan.p_size)},
      ${varsayilan.p_max_price === null ? "null" : varsayilan.p_max_price},
      ${varsayilan.p_only_discounted}, ${varsayilan.p_only_available}, ${metin(varsayilan.p_sort)})`;
  return (await db.query(sql)).rows;
};

describe("koleksiyon rafı sayfalanıyor", () => {
  test("sayfalar ilerliyor ve toplam gerçek toplam", async () => {
    const ilk = await sayfa({ p_collection_slugs: ["erkek"], p_limit: 12, p_offset: 0 });
    const ikinci = await sayfa({ p_collection_slugs: ["erkek"], p_limit: 12, p_offset: 12 });
    const ucuncu = await sayfa({ p_collection_slugs: ["erkek"], p_limit: 12, p_offset: 24 });
    assert.equal(ilk.length, 12);
    assert.equal(ikinci.length, 12);
    assert.equal(ucuncu.length, ADET - 24);
    assert.equal(Number(ilk[0].total_count), ADET);
    /* Sayfalar kesişmiyor: eski yolda 200'den sonrası hiç gelmiyordu. */
    const hepsi = [...ilk, ...ikinci, ...ucuncu].map((satir) => satir.slug);
    assert.equal(new Set(hepsi).size, ADET);
  });

  test("iki koleksiyonda duran ürün rafta bir kez görünüyor", async () => {
    const satirlar = await sayfa({ p_collection_slugs: ["erkek", "kazak"], p_limit: 200 });
    const sayim = satirlar.filter((satir) => satir.slug === "urun-0").length;
    assert.equal(sayim, 1);
    assert.equal(Number(satirlar[0].total_count), ADET);
  });

  test("pasif koleksiyon rafa girmiyor", async () => {
    const satirlar = await sayfa({ p_collection_slugs: ["pasif"], p_limit: 200 });
    assert.equal(satirlar.length, 0);
  });

  test("menü grubu ile de çekilebiliyor", async () => {
    const satirlar = await sayfa({ p_menu_groups: ["Erkek"], p_limit: 200 });
    assert.equal(Number(satirlar[0].total_count), ADET);
  });

  test("süzgeçler veritabanında uygulanıyor", async () => {
    const marka = await sayfa({ p_collection_slugs: ["erkek"], p_brand: "LR", p_limit: 200 });
    assert.ok(marka.length > 0);
    assert.ok(marka.every((satir) => satir.vendor === "LR"));

    const beden = await sayfa({ p_collection_slugs: ["erkek"], p_size: "m", p_limit: 200 });
    assert.ok(beden.length > 0);
    assert.ok(beden.every((satir) => satir.sizes.includes("M")));

    const stokta = await sayfa({ p_collection_slugs: ["erkek"], p_only_available: true, p_limit: 200 });
    assert.ok(stokta.every((satir) => satir.available === true));
    assert.equal(stokta.length, ADET - 3, "stoğu biten üç ürün dışarıda kalmalı");

    const indirimli = await sayfa({ p_collection_slugs: ["erkek"], p_only_discounted: true, p_limit: 200 });
    assert.ok(indirimli.every((satir) => satir.compare_at_price !== null));
  });

  test("süzgeç seçenekleri AYRI fonksiyondan ve süzgeçten ÖNCEKİ kümeden", async () => {
    /*
      Seçenekler sayfa sorgusunun içindeyken her görüntülemede
      koleksiyonun bütün varyantları üzerinde yeniden hesaplanıyor
      ve ağır kümede süre sınırını aşıyordu (20261017133904).
      Ayrıca süzgeçten ÖNCEKİ kümeden gelmeleri gerekiyor: "Beden: M"
      seçildiğinde marka listesi M'i olan markalara inerse müşteri
      seçimini genişletemez.
    */
    const satir = (await db.query(
      `select * from public.get_arvoculture_storefront_collection_facets(array['erkek']::text[], null)`,
    )).rows[0];
    assert.deepEqual([...satir.brands].sort(), ["ARVO", "LR"]);
    assert.deepEqual([...satir.sizes].sort(), ["L", "M"]);
    assert.equal(Number(satir.total_count), ADET);
    assert.ok(Number(satir.max_price) > 0);
  });

  test("süzgeçsiz toplam rafın saydığı kümeyle aynı", async () => {
    /*
      Raf varyant tablosuna INNER JOIN ile bağlı; sayaç varyant
      aramayınca süzgeç yokken bile "N / M ürün" başlığı çıkıyordu
      ve müşteriye olmayan bir süzgeci haber veriyordu
      (20261017134855). Varyantsız ürün buraya o yüzden eklendi:
      'baglanti-denemesi' koleksiyona hiç bağlanmadı ama
      'varyantsiz-urun' bağlandı.
    */
    await db.exec(`
      insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
        (gen_random_uuid(), '${KURUM}', 'Varyantsız', 'varyantsiz-urun', '', 'active', 'native', now(), now(), '{}'::jsonb);
      insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at) values
        ('${KURUM}', (select id from public.arc_collections where slug='erkek' and organization_id='${KURUM}'),
         (select id from public.arc_products where slug='varyantsiz-urun' and organization_id='${KURUM}'), 500, now());
    `);

    const raf = await sayfa({ p_collection_slugs: ["erkek"], p_limit: 200 });
    const secenek = (await db.query(
      `select total_count from public.get_arvoculture_storefront_collection_facets(array['erkek']::text[], null)`,
    )).rows[0];
    assert.equal(Number(secenek.total_count), Number(raf[0].total_count));
  });

  test("sayfa sorgusu beden listesini yalnızca kendi satırları için veriyor", async () => {
    const satirlar = await sayfa({ p_collection_slugs: ["erkek"], p_limit: 3 });
    assert.equal(satirlar.length, 3);
    for (const satir of satirlar) {
      assert.ok(Array.isArray(satir.sizes), "beden listesi dizi olmalı");
      assert.ok(satir.sizes.length > 0, "bedeni olan üründe liste boş kalmamalı");
    }
  });

  test("sıralama ölçütleri çalışıyor", async () => {
    const ucuz = await sayfa({ p_collection_slugs: ["erkek"], p_sort: "ucuz", p_limit: 5 });
    const fiyatlar = ucuz.map((satir) => Number(satir.price));
    assert.deepEqual(fiyatlar, [...fiyatlar].sort((a, b) => a - b));

    const pahali = await sayfa({ p_collection_slugs: ["erkek"], p_sort: "pahali", p_limit: 5 });
    const tersi = pahali.map((satir) => Number(satir.price));
    assert.deepEqual(tersi, [...tersi].sort((a, b) => b - a));

    /* Önerilen: stokta olanlar önce. */
    const onerilen = await sayfa({ p_collection_slugs: ["erkek"], p_sort: "onerilen", p_limit: 200 });
    const ilkTukenmis = onerilen.findIndex((satir) => satir.available === false);
    assert.ok(ilkTukenmis >= ADET - 3, "tükenmişler sona gitmeli");
  });

  test("koleksiyon verilmezse boş dönüyor: bütün katalog sızmıyor", async () => {
    const satirlar = await sayfa({ p_limit: 200 });
    assert.equal(satirlar.length, 0);
  });
});

/*
  KURUM KOŞULU KAPSAMI DARALTAMAZ — VERİTABANI GARANTİSİ.

  Fonksiyon koleksiyon join'lerinde `organization_id =
  p.organization_id` koşulunu taşıyor; çalışan ikizi taşımıyor.
  "Fazladan koşul satır düşürüyor olabilir" diye bir test yazıldı:
  kurum alanı ürününkinden BAŞKA bir bağlantı satırı kurulmaya
  çalışıldı ve veritabanı kabul etmedi —
  arc_collection_products'ın BİLEŞİK yabancı anahtarları
  (product_id, organization_id) ve (collection_id, organization_id)
  böyle bir satırı imkânsız kılıyor.

  Yani koşul gereksiz ama zararsız; kapsamı daraltması mümkün
  değil. Bu test o garantiyi kayda geçiriyor, çünkü yokluğunda
  aynı yanlış teşhis yeniden yapılır.
*/
describe("koleksiyon bağlantısı kurum alanında tutarsız olamıyor", () => {
  const BASKA = "dddddddd-0000-0000-0000-00000000dead";

  test("kurum alanı ürününkinden farklı bağlantı satırı yazılamıyor", async () => {
    /* Taze ürün: birincil anahtar (koleksiyon, ürün) çakışmasın da
       düşen kısıt gerçekten yabancı anahtar olsun. */
    await db.exec(`
      insert into public.organizations
        (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
        ('${BASKA}', 'Eski kayıt', 'eski-kayit', 'retail', 'active', 'starter', now(), now(), 'active', '#000000')
      on conflict (id) do nothing;

      insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
        (gen_random_uuid(), '${KURUM}', 'Bağlantı denemesi', 'baglanti-denemesi', '', 'active', 'native', now(), now(), '{}'::jsonb);
    `);
    await assert.rejects(
      () =>
        db.exec(`
          insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at) values
            ('${BASKA}', (select id from public.arc_collections where slug='erkek' and organization_id='${KURUM}'),
             (select id from public.arc_products where slug='baglanti-denemesi' and organization_id='${KURUM}'), 999, now());
        `),
      /foreign key constraint/,
      "bileşik yabancı anahtar böyle bir satırı engellemeli",
    );
  });
});
