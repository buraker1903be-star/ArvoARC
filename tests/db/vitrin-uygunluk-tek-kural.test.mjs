// Vitrinde "stokta var mı" sorusunun TEK yanıtı (20261017120705).
//
// Vitrinin okuduğu altı fonksiyon bu soruyu ham ifadeyle yanıtlıyordu:
// (v.stock > 0 or v.allow_backorder). Bu ifade TEDARİKÇİ ÜRÜNÜNÜ
// bilmiyor; arc_variant_available tedarikçi ürününde "stok >
// tedarikçi tamponu" diyor. Sonuç: tampon 5 ve stok 3 olan varyant
//
//   - katalog listesinde "Tükendi" görünüyor,
//   - koleksiyon kartında ve ÜRÜN SAYFASINDA satılabilir görünüyor,
//   - sipariş arc_variant_available ile denetlendiği için ödeme
//     adımında reddediliyordu (arc_create_order).
//
// Yani müşteri adresini yazdıktan sonra reddediliyordu. Test üç
// yüzeyin AYNI yanıtı vermesini kilitliyor; pozitif hâli de
// (stok tamponun üzerinde) sınıyor ki düzeltme her şeyi "tükendi"
// yapmasın.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "aaaaaaaa-0000-0000-0000-000000000001";
const TAMPONLU = "aaaaaaaa-0000-0000-0000-000000000002"; // stok 3, tampon 5
const BOL = "aaaaaaaa-0000-0000-0000-000000000003"; // stok 9, tampon 5
const KOLEKSIYON = "aaaaaaaa-0000-0000-0000-000000000004";

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
      (gen_random_uuid(), '${KURUM}', 'LR', 'LR Health & Beauty', true, 0, 0, 1, true, now(), now(), 0, 0, 0, 5);

    insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
      ('${TAMPONLU}', '${KURUM}', 'Tamponun altında', 'tamponun-altinda', '', 'active', 'native', now(), now(), '{}'::jsonb),
      ('${BOL}',      '${KURUM}', 'Tamponun üstünde', 'tamponun-ustunde', '', 'active', 'native', now(), now(), '{}'::jsonb);

    /* İndirimli: fırsatlar listesine girebilsin. */
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, title, price, compare_at_price, currency, stock, attributes,
       created_at, updated_at, allow_backorder, supplier) values
      (gen_random_uuid(), '${KURUM}', '${TAMPONLU}', 'LR-1', 'Kırmızı / M', 10000, 20000, 'TRY', 3, '{}'::jsonb, now(), now(), false, 'LR'),
      (gen_random_uuid(), '${KURUM}', '${BOL}',      'LR-2', 'Kırmızı / M', 10000, 20000, 'TRY', 9, '{}'::jsonb, now(), now(), false, 'LR');

    insert into public.arc_collections
      (id, organization_id, title, slug, description, status, source, seo_title, seo_description, metadata, created_at, updated_at) values
      ('${KOLEKSIYON}', '${KURUM}', 'Tümü', 'tumu', '', 'active', 'native', '', '', '{}'::jsonb, now(), now());

    insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at) values
      ('${KURUM}', '${KOLEKSIYON}', '${TAMPONLU}', 1, now()),
      ('${KURUM}', '${KOLEKSIYON}', '${BOL}', 2, now());
  `);
});

/** Slug → available eşlemesi. */
const uygunluk = async (sql) => {
  const satirlar = (await db.query(sql)).rows;
  return Object.fromEntries(satirlar.map((satir) => [satir.slug, satir.available]));
};

describe("vitrinde uygunluk tek kuraldan", () => {
  test("tampon altındaki tedarikçi varyantı hiçbir yüzeyde satılabilir görünmüyor", async () => {
    const yuzeyler = {
      "katalog listesi": await uygunluk(
        `select slug, available from public.get_arvoculture_storefront_products(50, 0)`,
      ),
      "ürün sayfası": await uygunluk(
        `select slug, available from public.get_arvoculture_storefront_product('tamponun-altinda')`,
      ),
      "koleksiyon listesi": await uygunluk(
        `select slug, available from public.get_arvoculture_storefront_collection_products('tumu', null, 50)`,
      ),
    };

    for (const [ad, harita] of Object.entries(yuzeyler)) {
      assert.equal(harita["tamponun-altinda"], false, `${ad}: tampon altındaki varyant satılabilir görünüyor`);
    }
  });

  test("tamponun üstündeki varyant satılabilir kalıyor", async () => {
    const katalog = await uygunluk(
      `select slug, available from public.get_arvoculture_storefront_products(50, 0)`,
    );
    const sayfa = await uygunluk(
      `select slug, available from public.get_arvoculture_storefront_product('tamponun-ustunde')`,
    );
    assert.equal(katalog["tamponun-ustunde"], true);
    assert.equal(sayfa["tamponun-ustunde"], true);
  });

  test("fırsatlar listesi tampon altındaki ürünü hiç göstermiyor", async () => {
    const satirlar = (await db.query(
      `select slug from public.get_arvoculture_storefront_deals(50)`,
    )).rows.map((satir) => satir.slug);
    assert.deepEqual(satirlar, ["tamponun-ustunde"]);
  });

  test("yüzeylerin yanıtı siparişin denetimiyle aynı", async () => {
    /* Ölçüt bu: sipariş fonksiyonu neyi reddediyorsa vitrin de onu
       "tükendi" göstermeli. Eskiden ikisi ayrışıyordu. */
    const satirlar = (await db.query(`
      select p.slug,
             public.arc_variant_available(v.stock, v.allow_backorder, v.supplier) as siparis
        from public.arc_product_variants v
        join public.arc_products p on p.id = v.product_id
       where v.organization_id = '${KURUM}'
    `)).rows;
    const vitrin = await uygunluk(
      `select slug, available from public.get_arvoculture_storefront_products(50, 0)`,
    );
    for (const satir of satirlar) {
      assert.equal(vitrin[satir.slug], satir.siparis, `${satir.slug}: vitrin ile sipariş ayrışıyor`);
    }
  });
});
