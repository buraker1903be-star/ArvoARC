// Serox ürünlerinin panel işareti (20260928101635).
//
// 20260928100521 ürünleri sku like 'ARC-LR-%' ile buluyordu; Serox'ların
// SKU'ları o migration'dan ÖNCE elle düzeltilmişti, yani koşul onları
// bulamadı. İşaretsiz ürün, aynı CSV tekrar aktarıldığında ikinci bir
// varyant kazanırdı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928101635_serox_urunleri_de_panelden_yonetilir.sql",
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
      (gen_random_uuid(), '${KURUM}', 'LR ZEITGARD Serox Instant Result Serum', 'lr-serox-instant-serum', '', 'active', 'shopify', 'lr-serox-instant-serum', now(), now(), '{"shopify_handle":"lr-serox-instant-serum"}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'LR ZEITGARD Serox Intensive Result Cream', 'lr-serox-krem', '', 'active', 'shopify', 'lr-serox-krem', now(), now(), '{}'::jsonb),
      (gen_random_uuid(), '${KURUM}', 'Stag Minimal', 'stag-minimal', '', 'active', 'shopify', 'stag-minimal', now(), now(), '{}'::jsonb);
  `);
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const say = async (sql) => Number((await db.query(sql)).rows[0].n);

describe("serox panel işareti", () => {
  test("iki Serox ürünü işaretleniyor", async () => {
    assert.equal(
      await say(`select count(*)::int as n from public.arc_products
                  where slug in ('lr-serox-instant-serum','lr-serox-krem')
                    and metadata ->> 'panelden_yonetiliyor' = 'true'`),
      2,
    );
  });

  test("başka ürünlere dokunulmuyor", async () => {
    assert.equal(
      await say(`select count(*)::int as n from public.arc_products
                  where slug = 'stag-minimal' and metadata ? 'panelden_yonetiliyor'`),
      0,
    );
  });

  test("mevcut metadata korunuyor", async () => {
    // shopify_handle görsel taşımada kullanılıyor; silinmesi sessiz bir kayıp olurdu.
    assert.equal(
      await say(`select count(*)::int as n from public.arc_products
                  where slug = 'lr-serox-instant-serum'
                    and metadata ->> 'shopify_handle' = 'lr-serox-instant-serum'`),
      1,
    );
  });

  test("ikinci kez koşabiliyor", async () => {
    await db.exec(fs.readFileSync(MIGRATION, "utf8"));
    assert.equal(
      await say(`select count(*)::int as n from public.arc_products
                  where metadata ->> 'panelden_yonetiliyor' = 'true'`),
      2,
    );
  });
});
