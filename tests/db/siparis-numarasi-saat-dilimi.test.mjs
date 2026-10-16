// Sipariş numarasının günü Türkiye saatiyle (20261016080951).
//
// 16.10.2026 02:23'te verilen sipariş "AC261015-D0A35A" numarasını aldı:
// to_char(now(), 'YYMMDD') veritabanının UTC saatiyle basıyordu. Düzeltme
// dilimi fonksiyonun içine AÇIKÇA yazıyor; test bunu bağlantının saat
// dilimini Türkiye'den uzak bir yere (UTC+14) çekerek sınıyor — gövde
// dilimi yazmasaydı numara o bölgenin gününü alırdı. Uzak dilim saate
// göre seçiliyor: tek bir dilim günün bir kısmında Türkiye ile AYNI günde
// kalıyor ve test o saatlerde hiçbir şey ölçmüyordu (ilk sürümde oldu).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol, islem } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
let db;

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'Salon', 'salon', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_store_settings (organization_id, store_name, order_prefix, shipping_fee, free_shipping_threshold) values
      ('${KURUM}', 'Salon', 'AC', 12000, 200000);
    insert into public.arc_products (organization_id, name, slug, status, source, metadata) values
      ('${KURUM}', 'Ürün', 'urun', 'active', 'native', '{}'::jsonb);
    insert into public.arc_product_variants (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes)
      select p.organization_id, p.id, 'URUN-1', 'Tek', 50000, 'TRY', 10, false, '{}'::jsonb
      from public.arc_products p where p.slug = 'urun';
  `);
});

test("vitrin siparişinin numarası Türkiye gününü taşıyor, bağlantının diliminden bağımsız", async () => {
  await islem(db, async () => {
    const { rows: saat } = await db.query(`select extract(hour from now() at time zone 'Europe/Istanbul')::int as h`);
    // Türkiye 13:00 öncesi: UTC-11 bir önceki günde; sonrası: UTC+14 bir sonraki günde.
    const uzak = saat[0].h < 13 ? "Pacific/Pago_Pago" : "Pacific/Kiritimati";
    await db.exec(`set local timezone = '${uzak}'`);
    const { rows: fark } = await db.query(
      `select to_char(now(), 'YYMMDD') <> to_char(now() at time zone 'Europe/Istanbul', 'YYMMDD') as farkli`);
    assert.equal(fark[0].farkli, true, "seçilen dilim Türkiye ile aynı günde; test bir şey ölçmez");
    await rol(db, "service_role");
    const { rows } = await db.query(
      `select order_number,
              to_char(now() at time zone 'Europe/Istanbul', 'YYMMDD') as tr_gun
         from public.arc_create_storefront_order($1, 'musteri@ornek.com', 'Ad Soyad', '05000000000',
              '{"line1":"Adres","city":"İstanbul"}'::jsonb, '[{"sku":"URUN-1","quantity":1}]'::jsonb, null)`,
      [KURUM],
    );
    assert.match(rows[0].order_number, new RegExp(`^AC${rows[0].tr_gun}-[0-9A-F]{6}$`));
  });
});
