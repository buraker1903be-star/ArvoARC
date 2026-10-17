// Sitemap yalnızca indekslenebilir ürünü listeliyor (20261017124725).
//
// Ürün sayfası stok yokken `noindex` veriyor (vitrin:
// robots.index = product.available !== false) ama sitemap aynı adresi
// listelemeye devam ediyordu: 17.10.2026'da 3.407 aktif üründen 508'i
// bu durumdaydı. Sitemap ile sayfanın arama motoruna söylediği şey
// aynı olmalı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "cccccccc-0000-0000-0000-000000000001";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_suppliers
      (id, organization_id, code, name, active, margin_percent, shipping_markup, round_to_kurus,
       publish_directly, created_at, updated_at, sync_cursor, sync_total, service_fee, stock_buffer) values
      (gen_random_uuid(), '${KURUM}', 'LR', 'LR', true, 0, 0, 1, true, now(), now(), 0, 0, 0, 5);

    insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
      (gen_random_uuid(), '${KURUM}', 'Satılabilir',  'satilabilir',  '', 'active', 'native', now(), now(), '{}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'Tükenmiş',     'tukenmis',     '', 'active', 'native', now(), now(), '{}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'Kısmen',       'kismen',       '', 'active', 'native', now(), now(), '{}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'Varyantsız',   'varyantsiz',   '', 'active', 'native', now(), now(), '{}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'Taslak',       'taslak-urun',  '', 'draft',  'native', now(), now(), '{}'::jsonb);

    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, currency, stock, attributes, created_at, updated_at, allow_backorder, supplier) values
      (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='satilabilir' and organization_id='${KURUM}'), 'S-1', 'Tek', 10000, 'TRY', 9, '{}'::jsonb, now(), now(), false, 'LR'),
      /* Tükenmiş: stok 0, tedarikçi ürünü — stoksuz satış ayarı kuralı değiştirmiyor. */
      (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='tukenmis' and organization_id='${KURUM}'), 'T-1', 'Tek', 10000, 'TRY', 0, '{}'::jsonb, now(), now(), true,  'LR'),
      /* Kısmen: bir bedeni tükenmiş, biri satılabilir → sayfa indekslenebilir. */
      (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='kismen' and organization_id='${KURUM}'), 'K-1', 'S',  10000, 'TRY', 0, '{}'::jsonb, now(), now(), true,  'LR'),
      (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='kismen' and organization_id='${KURUM}'), 'K-2', 'M',  10000, 'TRY', 7, '{}'::jsonb, now(), now(), false, 'LR'),
      (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug='taslak-urun' and organization_id='${KURUM}'), 'D-1', 'Tek', 10000, 'TRY', 9, '{}'::jsonb, now(), now(), false, 'LR');
  `);
});

const slugListesi = async () =>
  (await db.query(`select slug from public.get_arvoculture_storefront_product_slugs(1000, 0)`))
    .rows.map((satir) => satir.slug).sort();

describe("sitemap ürün listesi", () => {
  test("yalnızca satılabilir varyantı olan aktif ürünler listeleniyor", async () => {
    assert.deepEqual(await slugListesi(), ["kismen", "satilabilir"]);
  });

  test("sitemap ile ürün sayfasının uygunluk yanıtı aynı", async () => {
    /*
      Ölçüt bu: sayfa `available = false` dediği için noindex veriyorsa
      sitemap o adresi listelememeli.
    */
    const sayfa = Object.fromEntries(
      (await db.query(`
        select p.slug, coalesce(u.available, false) as available
          from public.arc_products p
          left join lateral public.get_arvoculture_storefront_product(p.slug) u on true
         where p.organization_id = '${KURUM}'
           and p.status = 'active'
      `)).rows.map((satir) => [satir.slug, satir.available]),
    );
    const sitemap = new Set(await slugListesi());
    for (const [slug, uygun] of Object.entries(sayfa)) {
      assert.equal(sitemap.has(slug), uygun, `${slug}: sitemap ile sayfa ayrışıyor`);
    }
  });

  test("stok gelince ürün sitemap'e geri giriyor", async () => {
    await db.exec(`update public.arc_product_variants set stock = 9 where sku = 'T-1'`);
    assert.ok((await slugListesi()).includes("tukenmis"));
    await db.exec(`update public.arc_product_variants set stock = 0 where sku = 'T-1'`);
    assert.ok(!(await slugListesi()).includes("tukenmis"));
  });
});
