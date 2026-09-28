// LR renk varyantları (20260928103018).
//
// 20260928100521 yalnızca rengi bilinen birer varyantı adlandırmıştı.
// Kalan altı satır ARC-LR-… kimliğiyle duruyor ve LR'da karşılığı
// olmadığı için fiyat akışına girmiyordu. Satırlar birbirinden ayırt
// edilemez (aynı fiyat, stok 0, boş attributes, siparişsiz), o yüzden
// renk okunmuyor, tanımlanıyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const RUJ = "22222222-2222-2222-2222-222222222222";
const KALEM = "33333333-3333-3333-3333-333333333333";
const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928103018_lr_renk_varyantlari_tamamlanir.sql",
);

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  const varyant = (urun, sku, baslik, fiyat, slug) =>
    `(gen_random_uuid(), '${KURUM}', '${urun}', '${sku}', '${baslik}', ${fiyat}, 'TRY', 0, '{}'::jsonb, '${slug}:${sku}', now(), now(), false)`;
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, description, status, source, external_id, created_at, updated_at, metadata) values
      ('${RUJ}',   '${KURUM}', 'LR ZEITGARD Signature İpeksi Mat Ruj',      'lr-zeitgard-mat-ruj',    '', 'active', 'shopify', 'lr-zeitgard-mat-ruj',    now(), now(), '{}'::jsonb),
      ('${KALEM}', '${KURUM}', 'LR ZEITGARD Signature Yumuşak Dudak Kalemi','lr-zeitgard-dudak-kalemi','', 'active', 'shopify', 'lr-zeitgard-dudak-kalemi', now(), now(), '{}'::jsonb);
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, currency, stock, attributes, external_id, created_at, updated_at, allow_backorder) values
      ${varyant(RUJ, "29032-1", "Pure Red", 189990, "lr-zeitgard-mat-ruj")},
      ${varyant(RUJ, "ARC-LR-ZEITGARD-MAT-RUJ-002", "ARC-LR-ZEITGARD-MAT-RUJ-002", 189990, "lr-zeitgard-mat-ruj")},
      ${varyant(RUJ, "ARC-LR-ZEITGARD-MAT-RUJ-003", "ARC-LR-ZEITGARD-MAT-RUJ-003", 189990, "lr-zeitgard-mat-ruj")},
      ${varyant(RUJ, "ARC-LR-ZEITGARD-MAT-RUJ-004", "ARC-LR-ZEITGARD-MAT-RUJ-004", 189990, "lr-zeitgard-mat-ruj")},
      ${varyant(KALEM, "29031-2", "Rosy Nude", 119190, "lr-zeitgard-dudak-kalemi")},
      ${varyant(KALEM, "ARC-LR-ZEITGARD-DUDAK-KALEMI-002", "ARC-LR-ZEITGARD-DUDAK-KALEMI-002", 119190, "lr-zeitgard-dudak-kalemi")},
      ${varyant(KALEM, "ARC-LR-ZEITGARD-DUDAK-KALEMI-003", "ARC-LR-ZEITGARD-DUDAK-KALEMI-003", 119190, "lr-zeitgard-dudak-kalemi")},
      ${varyant(KALEM, "ARC-LR-ZEITGARD-DUDAK-KALEMI-004", "ARC-LR-ZEITGARD-DUDAK-KALEMI-004", 119190, "lr-zeitgard-dudak-kalemi")};
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const satirlar = async (urun) =>
  (await db.query(`select sku, title, external_id from public.arc_product_variants
                    where product_id = '${urun}' order by sku`)).rows;

describe("lr renk varyantları", () => {
  test("rujun dört rengi de LR kimliğini alıyor", async () => {
    assert.deepEqual(
      (await satirlar(RUJ)).map((v) => [v.sku, v.title]),
      [["29032-1", "Pure Red"], ["29032-2", "Rosy Nude"], ["29032-3", "Berry Rose"], ["29032-4", "Ruby Red"]],
    );
  });

  test("dudak kaleminin dört rengi de LR kimliğini alıyor", async () => {
    // -001 LR'ın NR 2'siydi: sıra bir bilgi taşımıyor, eşleme elle kuruldu.
    assert.deepEqual(
      (await satirlar(KALEM)).map((v) => [v.sku, v.title]),
      [["29031-1", "Pure Red"], ["29031-2", "Rosy Nude"], ["29031-3", "Berry Rose"], ["29031-4", "Deep Brown"]],
    );
  });

  test("external_id yeni SKU ile birlikte güncelleniyor", async () => {
    const hepsi = [...(await satirlar(RUJ)), ...(await satirlar(KALEM))];
    for (const v of hepsi) assert.ok(v.external_id.endsWith(`:${v.sku}`), v.external_id);
  });

  test("ARC-LR kimliği KALMIYOR", async () => {
    const kalan = await db.query(`select sku from public.arc_product_variants where sku like 'ARC-LR-%'`);
    assert.equal(kalan.rows.length, 0);
  });

  test("ikinci kez koşabiliyor", async () => {
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    const sayi = await db.query(`select count(*)::int as n from public.arc_product_variants`);
    assert.equal(sayi.rows[0].n, 8);
  });
});
