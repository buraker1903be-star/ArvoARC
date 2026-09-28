// LR makyaj ton adları (20260928103913).
//
// Kapatıcı, fondöten ve kaş jeli 20.08.2026 içe aktarımında ton adlarını
// kaybetti; SKU'ları doğru LR kimlikleri olduğu için fiyat akışındalar
// ama vitrinde ton seçicisi "29022-2" gösteriyordu. Adlar LR'ın kendi
// listelerinden okundu, uydurulmadı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const URUN = "22222222-2222-2222-2222-222222222222";
const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928103913_lr_makyaj_ton_adlari_yazilir.sql",
);

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  const v = (sku, baslik) =>
    `(gen_random_uuid(), '${KURUM}', '${URUN}', '${sku}', '${baslik}', 100000, 'TRY', 0, '{}'::jsonb, 'u:${sku}', now(), now(), false)`;
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, description, status, source, external_id, created_at, updated_at, metadata) values
      ('${URUN}', '${KURUM}', 'LR ZEITGARD Signature Kapatıcı', 'u', '', 'active', 'shopify', 'u', now(), now(), '{}'::jsonb);
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, currency, stock, attributes, external_id, created_at, updated_at, allow_backorder) values
      ${v("29021-1", "Flair")}, ${v("29021-2", "29021-2")}, ${v("29021-3", "29021-3")},
      ${v("29030-1", "Light")}, ${v("29030-2", "29030-2")},
      ${v("TR-1", "Beyaz / S")};
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const baslik = async (sku) =>
  (await db.query(`select title from public.arc_product_variants where sku = '${sku}'`)).rows[0].title;

describe("lr ton adları", () => {
  test("yanlış yazılmış 'Flair' düzeliyor", async () => {
    assert.equal(await baslik("29021-1"), "Fair");
  });

  test("SKU'ya düşmüş başlıklar ton adını alıyor", async () => {
    assert.equal(await baslik("29021-2"), "Light");
    assert.equal(await baslik("29021-3"), "Neutral");
    assert.equal(await baslik("29030-2"), "Medium");
  });

  test("zaten doğru olan başlığa dokunulmuyor", async () => {
    assert.equal(await baslik("29030-1"), "Light");
  });

  test("listede olmayan varyanta dokunulmuyor", async () => {
    assert.equal(await baslik("TR-1"), "Beyaz / S");
  });

  test("ikinci kez koşabiliyor", async () => {
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    assert.equal(await baslik("29021-1"), "Fair");
  });
});
