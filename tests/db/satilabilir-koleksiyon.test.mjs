// Koleksiyon sayısı satılabilir ürünü sayar (20261018211303).
//
// Menüdeki sayı stoka hiç bakmadan `status='active'` ürünleri
// sayıyordu: Kürk menüsündeki ürünlerin hepsi tükenmişken menü
// duruyor, müşteri tıklayınca baştan sona "Tükendi" listesi
// çıkıyordu. Sınanan: tükenmiş ürün sayılmıyor, koleksiyon
// tamamen tükenmişse menüden düşüyor ve STOKSUZ SATIŞA AÇIK
// (LR) ürün yine sayılıyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
    values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000')
    on conflict (id) do nothing;

    insert into public.arc_collections (id, organization_id, title, slug, description, status, created_at, updated_at, metadata) values
      ('c1111111-1111-1111-1111-111111111111', '${KURUM}', 'Kürk',    'kurk',    '', 'active', now(), now(), '{"menu_group":"Dış Giyim","parent":"Kadın"}'::jsonb),
      ('c2222222-2222-2222-2222-222222222222', '${KURUM}', 'Tişört',  'tisort',  '', 'active', now(), now(), '{"menu_group":"Üst Giyim","parent":"Erkek"}'::jsonb),
      ('c3333333-3333-3333-3333-333333333333', '${KURUM}', 'LR Bakım','lr-bakim','', 'active', now(), now(), '{"menu_group":"Kişisel Bakım","parent":"Kadın"}'::jsonb);

    insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
      ('a1111111-1111-1111-1111-111111111111', '${KURUM}', 'Kürk Manto',  'kurk-manto',  '', 'active', 'native', now(), now(), '{}'::jsonb),
      ('a2222222-2222-2222-2222-222222222222', '${KURUM}', 'Basic Tişört','basic-tisort','', 'active', 'native', now(), now(), '{}'::jsonb),
      ('a3333333-3333-3333-3333-333333333333', '${KURUM}', 'LR Krem',     'lr-krem',     '', 'active', 'native', now(), now(), '{}'::jsonb);

    insert into public.arc_collection_products (organization_id, collection_id, product_id) values
      ('${KURUM}', 'c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
      ('${KURUM}', 'c2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222'),
      ('${KURUM}', 'c3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333');

    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, supplier, created_at, updated_at, allow_backorder) values
      -- Kürk: iki beden, ikisi de tükenmiş ve stoksuz satış kapalı
      ('${KURUM}', 'a1111111-1111-1111-1111-111111111111', 'KURK-S', 'S', 100, 'TRY', 0, null, now(), now(), false),
      ('${KURUM}', 'a1111111-1111-1111-1111-111111111111', 'KURK-M', 'M', 100, 'TRY', 0, null, now(), now(), false),
      -- Tişört: biri tükenmiş, biri var
      ('${KURUM}', 'a2222222-2222-2222-2222-222222222222', 'TS-S', 'S', 100, 'TRY', 0, null, now(), now(), false),
      ('${KURUM}', 'a2222222-2222-2222-2222-222222222222', 'TS-M', 'M', 100, 'TRY', 7, null, now(), now(), false),
      -- LR: stok sıfır AMA stoksuz satış açık (deposuz satış)
      ('${KURUM}', 'a3333333-3333-3333-3333-333333333333', 'LR-1', 'Tek', 100, 'TRY', 0, null, now(), now(), true);
  `);
});

const koleksiyonlar = async () =>
  Object.fromEntries(
    (
      await db.query(
        `select slug, product_count from public.arc_vitrin_koleksiyonlar($1::uuid)`,
        [KURUM],
      )
    ).rows.map((r) => [r.slug, Number(r.product_count)]),
  );

describe("koleksiyon sayısı satılabilir ürünü sayıyor", () => {
  test("hepsi tükenmiş koleksiyon listeden düşüyor", async () => {
    const liste = await koleksiyonlar();
    assert.equal(liste.kurk, undefined);
  });

  test("tek bedeni kalan ürün sayılıyor", async () => {
    const liste = await koleksiyonlar();
    assert.equal(liste.tisort, 1);
  });

  test("stoksuz satışa açık ürün sayılmaya devam ediyor", async () => {
    /*
      LR ürünlerinde stok hep sıfır ve stoksuz satış açık. Ham
      `stock > 0` ölçütü bütün LR kataloğunu menüden silerdi.
    */
    const liste = await koleksiyonlar();
    assert.equal(liste["lr-bakim"], 1);
  });
});
