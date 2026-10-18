// Yurtdışına gönderilemeyen ürün siparişte engelleniyor (20261018220926).
//
// Kural DİLDE değil TESLİMAT ÜLKESİNDE: müşteri siteyi Türkçe de
// gezse, adresi yurtdışıysa LR ürünü gönderilemiyor. Sınanan:
// yurtdışı adresinde engelleniyor, Türkiye'de geçiyor, "Türkiye"
// yazımı da Türkiye sayılıyor ve işaretsiz ürün her yere gidiyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const LR = "a1111111-1111-1111-1111-111111111111";
const NORMAL = "a2222222-2222-2222-2222-222222222222";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
    values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000')
    on conflict (id) do nothing;

    insert into public.arc_store_settings (organization_id, store_name, order_prefix, shipping_fee, free_shipping_threshold)
    values ('${KURUM}', 'ArvoCulture', 'AC', 12000, 200000)
    on conflict (organization_id) do nothing;

    insert into public.arc_products
      (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata, international_blocked) values
      ('${LR}',     '${KURUM}', 'LR Krem',  'lr-krem',  '', 'active', 'native', now(), now(), '{}'::jsonb, true),
      ('${NORMAL}', '${KURUM}', 'Tişört',   'tisort',   '', 'active', 'native', now(), now(), '{}'::jsonb, false);

    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, created_at, updated_at, allow_backorder) values
      ('${KURUM}', '${LR}',     'LR-1', 'Tek', 10000, 'TRY', 50, now(), now(), false),
      ('${KURUM}', '${NORMAL}', 'TS-1', 'M',   10000, 'TRY', 50, now(), now(), false);
  `);
});

const siparis = (sku, ulke) =>
  db.query(
    `select order_id from public.arc_create_storefront_order(
       $1::uuid, 'musteri@ornek.com', 'Ad Soyad', '05001112233',
       jsonb_build_object('line','Sokak 1','city','X','district','Y','postal','1','country',$2::text),
       jsonb_build_array(jsonb_build_object('sku',$3::text,'quantity',1)),
       null)`,
    [KURUM, ulke, sku],
  );

describe("yurtdışına gönderilemeyen ürün", () => {
  test("yurtdışı adresinde sipariş geçmiyor", async () => {
    await assert.rejects(
      () => siparis("LR-1", "DE"),
      /yurtdışına gönderilemiyor/i,
    );
  });

  test("Türkiye adresinde aynı ürün geçiyor", async () => {
    const { rows } = await siparis("LR-1", "TR");
    assert.ok(rows[0].order_id);
  });

  test('"Türkiye" yazımı da Türkiye sayılıyor', async () => {
    /* Adres alanı serbest metin: "TR", "Türkiye", "Turkey" hepsi
       gelebiliyor. Hepsini Türkiye saymazsak "Türkiye" yazan
       müşteri yurtdışı sayılıp LR ürünü alamazdı. */
    for (const yazim of ["Türkiye", "turkey", " TR "]) {
      const { rows } = await siparis("LR-1", yazim);
      assert.ok(rows[0].order_id, yazim);
    }
  });

  test("işaretsiz ürün yurtdışına gidebiliyor", async () => {
    const { rows } = await siparis("TS-1", "US");
    assert.ok(rows[0].order_id);
  });
});
