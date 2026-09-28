// Hayalet varyant onarımı (20260928083351).
//
// 20.08.2026'da Shopify içe aktarımı on beş ürüne 4-5'er sahte varyant
// yazdı: aynı SKU, boş nitelik, "Default" başlık, external_id
// <handle>:1…6. Migration onları temizlerken bağlantıyı KAYBETMEMELİ —
// arc_order_items ON DELETE SET NULL, arc_inventory_movements ON DELETE
// CASCADE, yani önce taşımadan silmek geçmişi yok ederdi.
//
// Migration harness tarafından zaten uygulanmış oluyor; test kısıtı
// kaldırıp bozuk veriyi kuruyor ve migration'ı DOSYADAN okuyup yeniden
// koşuyor. Yeniden koşabilmesi de bir güvence: adımlar etkisiz-tekrarlı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const URUN = "22222222-2222-2222-2222-222222222222";
const GERCEK = "33333333-3333-3333-3333-333333333333";
const HAYALET = "44444444-4444-4444-4444-444444444444";
const HAYALET2 = "66666666-6666-6666-6666-666666666666";
const SIPARIS = "55555555-5555-5555-5555-555555555555";
const HANDLE = "stag-minimal-erkek-tisort-beyaz";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928083351_hayalet_varyantlar_temizlenir_ve_kimlik_skuya_baglanir.sql",
);

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`drop index if exists public.arc_variants_product_sku_uniq;`);
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, description, status, source, external_id, created_at, updated_at, metadata) values
      ('${URUN}', '${KURUM}', 'Stag Minimal', '${HANDLE}', '', 'active', 'shopify', '${HANDLE}', now(), now(), '{}'::jsonb);
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, currency, stock, attributes, external_id, created_at, updated_at, allow_backorder) values
      ('${GERCEK}',   '${KURUM}', '${URUN}', 'TR-10673', 'Beyaz / XS', 64990, 'TRY', 7, '{"Renk":"Beyaz","Beden":"XS"}'::jsonb, '${HANDLE}:1', now(),                     now(), false),
      ('${HAYALET}',  '${KURUM}', '${URUN}', 'TR-10673', 'Default',    64990, 'TRY', 0, '{}'::jsonb,                            '${HANDLE}:2', now() + interval '1 ms',  now(), false),
      ('${HAYALET2}', '${KURUM}', '${URUN}', 'TR-10673', 'Default',    64990, 'TRY', 0, '{}'::jsonb,                            '${HANDLE}:3', now() + interval '2 ms',  now(), false);
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency, subtotal, tax, shipping, total, metadata, created_at, updated_at) values
      ('${SIPARIS}', '${KURUM}', 'ARC-1', 'native', 'confirmed', 'paid', 'TRY', 64990, 0, 0, 64990, '{}'::jsonb, now(), now());
    insert into public.arc_order_items (id, organization_id, order_id, variant_id, product_name, sku, quantity, unit_price, total) values
      (gen_random_uuid(), '${KURUM}', '${SIPARIS}', '${HAYALET}', 'Stag Minimal', 'TR-10673', 1, 64990, 64990);
    insert into public.arc_inventory_movements (id, organization_id, variant_id, kind, quantity, created_at) values
      (gen_random_uuid(), '${KURUM}', '${HAYALET}', 'sale', 1, now());
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql) => (await db.query(sql)).rows[0];

describe("hayalet varyant onarımı", () => {
  test("hayaletler siliniyor, nitelik taşıyan kayıt KALIYOR", async () => {
    const satirlar = (await db.query(
      `select id, title, external_id, stock from public.arc_product_variants where product_id = '${URUN}'`,
    )).rows;
    assert.equal(satirlar.length, 1);
    assert.equal(satirlar[0].id, GERCEK);
    /* Stok gerçek kayıtta duruyordu; hayalet seçilseydi 0'a düşerdi. */
    assert.equal(satirlar[0].stock, 7);
  });

  test("SİPARİŞ KALEMİ kalan varyanta taşınıyor, boşa düşmüyor", async () => {
    // ON DELETE SET NULL: taşımasaydık siparişin hangi varyant olduğu kaybolurdu.
    const kalem = await tek(`select variant_id from public.arc_order_items where organization_id = '${KURUM}'`);
    assert.equal(kalem.variant_id, GERCEK);
  });

  test("STOK HAREKETİ kalan varyanta taşınıyor, silinmiyor", async () => {
    // ON DELETE CASCADE: taşımasaydık stok geçmişi tamamen yok olurdu.
    const hareket = await tek(`select variant_id, count(*) over () as adet from public.arc_inventory_movements where organization_id = '${KURUM}'`);
    assert.equal(hareket.variant_id, GERCEK);
    assert.equal(Number(hareket.adet), 1);
  });

  test("KİMLİK sku'ya bağlanıyor: <slug>:<sku>", async () => {
    const satir = await tek(`select external_id from public.arc_product_variants where id = '${GERCEK}'`);
    assert.equal(satir.external_id, `${HANDLE}:TR-10673`);
  });

  test("aynı SKU tek ürüne iki kez YAZILAMIYOR", async () => {
    await assert.rejects(
      db.query(
        `insert into public.arc_product_variants
           (id, organization_id, product_id, sku, title, price, currency, stock, attributes, created_at, updated_at, allow_backorder)
         values (gen_random_uuid(), '${KURUM}', '${URUN}', 'TR-10673', 'Default', 64990, 'TRY', 0, '{}'::jsonb, now(), now(), false)`,
      ),
      /arc_variants_product_sku_uniq/,
    );
  });

  test("migration İKİNCİ KEZ koşabiliyor", async () => {
    // Elle uygulanıyor; yarıda kalıp baştan çalıştırılması olağan.
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    const sayi = await tek(`select count(*)::int as n from public.arc_product_variants where product_id = '${URUN}'`);
    assert.equal(sayi.n, 1);
  });
});
