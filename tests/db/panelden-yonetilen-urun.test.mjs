// Panelden yönetilen ürün + bilinen LR kimlikleri (20260928100521).
//
// Dört LR ürününün SKU'su Shopify CSV'sinde yoktu; içe aktarım üretmişti
// ve LR'da karşılığı olmadığı için fiyat akışına hiç girmediler. Gerçek
// kimlikler yazılınca aynı CSV'nin tekrar aktarılması düzeltilmiş kaydın
// yanına ikinci bir varyant ekleyecekti — işaret bunu engelliyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const RUJ = "22222222-2222-2222-2222-222222222222";
const BASKA = "33333333-3333-3333-3333-333333333333";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928100521_lr_urunleri_panelden_yonetilir_ve_bilinen_skular_yazilir.sql",
);

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, description, status, source, external_id, created_at, updated_at, metadata) values
      ('${RUJ}',   '${KURUM}', 'LR ZEITGARD Signature İpeksi Mat Ruj', 'lr-zeitgard-mat-ruj', '', 'active', 'shopify', 'lr-zeitgard-mat-ruj', now(), now(), '{"shopify_handle":"lr-zeitgard-mat-ruj"}'::jsonb),
      ('${BASKA}', '${KURUM}', 'Stag Minimal',                         'stag-minimal',        '', 'active', 'shopify', 'stag-minimal',        now(), now(), '{}'::jsonb);
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, currency, stock, attributes, external_id, created_at, updated_at, allow_backorder) values
      (gen_random_uuid(), '${KURUM}', '${RUJ}',   'ARC-LR-ZEITGARD-MAT-RUJ-001', 'pure-red',                    189990, 'TRY', 0, '{}'::jsonb, 'lr-zeitgard-mat-ruj:ARC-LR-ZEITGARD-MAT-RUJ-001', now(), now(), false),
      (gen_random_uuid(), '${KURUM}', '${RUJ}',   'ARC-LR-ZEITGARD-MAT-RUJ-002', 'ARC-LR-ZEITGARD-MAT-RUJ-002', 189990, 'TRY', 0, '{}'::jsonb, 'lr-zeitgard-mat-ruj:ARC-LR-ZEITGARD-MAT-RUJ-002', now(), now(), false),
      (gen_random_uuid(), '${KURUM}', '${BASKA}', 'TR-10673',                    'Beyaz / XS',                   64990, 'TRY', 3, '{"Renk":"Beyaz"}'::jsonb, 'stag-minimal:TR-10673', now(), now(), false);
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql) => (await db.query(sql)).rows[0];

describe("panelden yönetilen ürün", () => {
  test("ARC-LR varyantı olan ürün İŞARETLENİYOR", async () => {
    const urun = await tek(`select metadata ->> 'panelden_yonetiliyor' as isaret from public.arc_products where id = '${RUJ}'`);
    assert.equal(urun.isaret, "true");
  });

  test("mevcut metadata KORUNUYOR, üstüne yazılmıyor", async () => {
    // shopify_handle görsel taşımada kullanılıyor; silinmesi sessiz bir kayıp olurdu.
    const urun = await tek(`select metadata ->> 'shopify_handle' as handle from public.arc_products where id = '${RUJ}'`);
    assert.equal(urun.handle, "lr-zeitgard-mat-ruj");
  });

  test("ARC-LR varyantı OLMAYAN ürün işaretlenmiyor", async () => {
    const urun = await tek(`select metadata ->> 'panelden_yonetiliyor' as isaret from public.arc_products where id = '${BASKA}'`);
    assert.equal(urun.isaret, null);
  });

  test("rengi BİLİNEN varyanta gerçek LR kimliği ve renk adı yazılıyor", async () => {
    const v = await tek(`select sku, title, external_id from public.arc_product_variants where title = 'Pure Red'`);
    assert.equal(v.sku, "29032-1");
    assert.equal(v.external_id, "lr-zeitgard-mat-ruj:29032-1");
  });

  test("rengi BİLİNMEYEN varyanta DOKUNULMUYOR", async () => {
    /*
      Sıraya göre eşlemek yanlış olurdu: ruj'da -001 'pure-red' (LR NR 1),
      dudak kaleminde -001 'rosy-nude' (LR NR 2). Yanlış renge yanlış
      fiyat yazmak canlı mağazada geri alınamaz.
    */
    const v = await tek(`select sku from public.arc_product_variants where sku like 'ARC-LR-%'`);
    assert.equal(v.sku, "ARC-LR-ZEITGARD-MAT-RUJ-002");
  });

  test("migration İKİNCİ KEZ koşabiliyor", async () => {
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    const sayi = await tek(`select count(*)::int as n from public.arc_product_variants where sku = '29032-1'`);
    assert.equal(sayi.n, 1);
  });
});
