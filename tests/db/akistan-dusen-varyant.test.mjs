// Akıştan düşen tedarikçi varyantı satışa kapanır (20261016075022).
//
// 16.10.2026: Tarzyeri satışa kapattığı ürünü XML'den çıkarıyor, stok
// turu ise yalnızca akışta gelen SKU'ları yazıyordu — kapanmış ürünler
// bizde 92 ve 1000 adetle açık kaldı, iki sipariş onlara düştü.
// Sınanan: akışta olmayan kapanır; akıştaki, başka tedarikçinin, başka
// mağazanın ve mağazanın kendi varyantı DOKUNULMAZ; boş liste reddedilir.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol, islem, reddedilir } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const BASKA = "99999999-9999-9999-9999-999999999999";
const URUN = "22222222-2222-2222-2222-222222222222";
const URUN2 = "77777777-7777-7777-7777-777777777777";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${BASKA}', 'Başka', 'baska', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
      ('${URUN}', '${KURUM}', 'Eşofman', 'esofman', '', 'active', 'native', now(), now(), '{}'::jsonb),
      ('${URUN2}', '${BASKA}', 'Eşofman', 'esofman', '', 'active', 'native', now(), now(), '{}'::jsonb);
    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, supplier, supplier_sku, created_at, updated_at, allow_backorder) values
      ('${KURUM}', '${URUN}', 'AKISTA',   'a', 100, 'TRY', 348,  'tarzyeri', 'AKISTA',   now(), now(), false),
      ('${KURUM}', '${URUN}', 'DUSTU',    'b', 100, 'TRY', 1000, 'tarzyeri', 'DUSTU',    now(), now(), false),
      ('${KURUM}', '${URUN}', 'BASKATED', 'c', 100, 'TRY', 40,   'baskasi',  'BASKATED', now(), now(), false),
      ('${KURUM}', '${URUN}', 'KENDI',    'd', 100, 'TRY', 7,    null,       null,       now(), now(), false),
      ('${BASKA}', '${URUN2}', 'DUSTU',   'e', 100, 'TRY', 55,   'tarzyeri', 'DUSTU',    now(), now(), false);
  `);
});

const stok = async (org, sku) =>
  (await db.query(`select stock from public.arc_product_variants where organization_id = $1 and sku = $2`, [org, sku])).rows[0].stock;

describe("akıştan düşen tedarikçi varyantı", () => {
  test("akışta olmayan kapanır, gerisine dokunulmaz", async () => {
    await islem(db, async () => {
      await rol(db, "service_role");
      const { rows } = await db.query(
        `select public.arc_close_missing_supplier_variants($1, 'tarzyeri', array['AKISTA']) as n`, [KURUM]);
      assert.equal(rows[0].n, 1);
      await rol(db, "postgres");
      assert.equal(await stok(KURUM, "DUSTU"), 0);
      assert.equal(await stok(KURUM, "AKISTA"), 348);
      assert.equal(await stok(KURUM, "BASKATED"), 40, "başka tedarikçi");
      assert.equal(await stok(KURUM, "KENDI"), 7, "mağazanın kendi ürünü");
      assert.equal(await stok(BASKA, "DUSTU"), 55, "başka mağaza");
    });
  });

  test("boş liste hiçbir şeyi kapatmaz, reddedilir", async () => {
    await islem(db, async () => {
      await rol(db, "service_role");
      await reddedilir(db, `select public.arc_close_missing_supplier_variants($1, 'tarzyeri', array[]::text[])`, [KURUM], /boş/);
      await reddedilir(db, `select public.arc_close_missing_supplier_variants(null, 'tarzyeri', array['X'])`, [], /Mağaza/);
      await rol(db, "postgres");
      assert.equal(await stok(KURUM, "DUSTU"), 1000);
    });
  });

  test("vitrin ve panel çağıramaz", async () => {
    for (const r of ["anon", "authenticated"]) {
      await islem(db, async () => {
        await rol(db, r);
        await reddedilir(db, `select public.arc_close_missing_supplier_variants($1, 'tarzyeri', array['AKISTA'])`, [KURUM], /permission denied/);
      });
    }
  });
});

// Canlı stok (20261016080231): ödemede öğrenilen sayı ve ürün sayfası adresi.
describe("canlı stok yazımı", () => {
  test("yalnızca stok yazılır, maliyet ve fiyat korunur; başka mağazaya dokunulmaz", async () => {
    await islem(db, async () => {
      await rol(db, "service_role");
      const { rows } = await db.query(
        `select public.arc_set_supplier_variant_stock($1, 'tarzyeri', '[{"sku":"AKISTA","stock":0},{"sku":"DUSTU","stock":-3}]'::jsonb) as n`, [KURUM]);
      assert.equal(rows[0].n, 2);
      await rol(db, "postgres");
      assert.equal(await stok(KURUM, "AKISTA"), 0);
      assert.equal(await stok(KURUM, "DUSTU"), 0, "eksi sayı sıfıra çekilir");
      assert.equal(await stok(BASKA, "DUSTU"), 55);
      const { rows: f } = await db.query(`select price from public.arc_product_variants where organization_id = $1 and sku = 'AKISTA'`, [KURUM]);
      assert.equal(Number(f[0].price), 100);
    });
  });

  test("ürün sayfası adresi metadata'ya yazılır, diğer alanlar korunur", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(`update public.arc_products set supplier = 'tarzyeri', supplier_product_code = 'TR-1', metadata = '{"vendor":"X"}' where id = '${URUN}'`);
      await rol(db, "service_role");
      const satir = `[{"code":"TR-1","link":"https://www.tarzyeri.com/urun"},{"code":"TR-1","link":"https://www.tarzyeri.com/urun"},{"code":"TR-2","link":"javascript:x"}]`;
      const { rows } = await db.query(`select public.arc_set_supplier_links($1, 'tarzyeri', $2::jsonb) as n`, [KURUM, satir]);
      assert.equal(rows[0].n, 1);
      const { rows: ikinci } = await db.query(`select public.arc_set_supplier_links($1, 'tarzyeri', $2::jsonb) as n`, [KURUM, satir]);
      assert.equal(ikinci[0].n, 0, "değişmeyen adres yeniden yazılmaz");
      await rol(db, "postgres");
      const { rows: m } = await db.query(`select metadata from public.arc_products where id = '${URUN}'`);
      assert.deepEqual(m[0].metadata, { vendor: "X", supplier_link: "https://www.tarzyeri.com/urun" });
    });
  });

  test("vitrin ve panel çağıramaz", async () => {
    for (const r of ["anon", "authenticated"]) {
      for (const fn of ["arc_set_supplier_variant_stock", "arc_set_supplier_links"]) {
        await islem(db, async () => {
          await rol(db, r);
          await reddedilir(db, `select public.${fn}($1, 'tarzyeri', '[]'::jsonb)`, [KURUM], /permission denied/);
        });
      }
    }
  });
});
