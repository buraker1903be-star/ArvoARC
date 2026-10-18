/*
  "İNDİRİMDEKİ ÜRÜNLERDE GEÇERLİ DEĞİLDİR".

  Kural panelde VARDI: indirim kaydının `combinable` alanı ve
  "Diğer indirimlerle birleştirilebilir" kutusu 29.09.2026'dan beri
  duruyor, kutu işaretsizken detay ekranı "Tek başına uygulanır"
  yazıyordu. Ama alan hiçbir yerde okunmuyordu — sipariş fonksiyonu
  kuponu her zaman ara toplamın TAMAMINA uyguluyordu. Panel bir şey
  vaat edip başka şey yapıyordu ve bu sessizdi.

  Burada ölçülen: kupon tabanı. İndirimli satır (compare_at_price >
  price) kupona girmiyor; kutu işaretliyse sepetin tamamı giriyor.
  Ücretsiz kargo kuponu ayrı sınanıyor: kargo bir ÜRÜN indirimi
  değil ve kural ona uygulanırsa müşteri hak ettiği ücretsiz kargoyu
  kaybeder.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const A = "00000000-0000-4000-8000-000000020001";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${A}', 'Salon K', 'salon-k', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_store_settings (organization_id, store_name, order_prefix, custom_domain, domain_verified_at, shipping_fee, free_shipping_threshold) values
      ('${A}', 'Salon K', 'SK', 'salonk.com', now(), 12000, 500000);

    insert into public.arc_products (organization_id, name, slug, status, source, metadata) values
      ('${A}', 'Tam Fiyat', 'tam-fiyat', 'active', 'native', '{}'::jsonb),
      ('${A}', 'İndirimli', 'indirimli', 'active', 'native', '{}'::jsonb);

    -- İkisi de 500 TL; farkı yalnızca üstü çizili fiyatın olması.
    insert into public.arc_product_variants (organization_id, product_id, sku, title, price, compare_at_price, currency, stock, allow_backorder, attributes)
      select p.organization_id, p.id, upper(p.slug), 'Tek', 50000,
             case when p.slug = 'indirimli' then 80000 else null end,
             'TRY', 10, false, '{}'::jsonb
      from public.arc_products p where p.organization_id = '${A}';

    insert into public.arc_discounts (organization_id, name, code, discount_type, value, minimum_subtotal, status, combinable, metadata) values
      ('${A}', 'Tek Başına', 'TEKBAS', 'percentage', 10, 0, 'active', false, '{}'::jsonb),
      ('${A}', 'Birleşir',  'BIRLES', 'percentage', 10, 0, 'active', true,  '{}'::jsonb),
      ('${A}', 'Kargo',     'KARGO',  'free_shipping', 0, 0, 'active', false, '{}'::jsonb);
  `);
}

/* İki ürün de birer adet: ara toplam 1.000 TL, yarısı indirimli. */
async function siparis(kod) {
  const { rows } = await db.query(
    `select order_id from public.arc_storefront_create_order(
       'salonk.com', 'musteri@example.com', 'Ayşe Yılmaz', '05000000000',
       '{"city":"İstanbul"}'::jsonb,
       jsonb_build_array(
         jsonb_build_object('sku', 'TAM-FIYAT', 'quantity', 1),
         jsonb_build_object('sku', 'INDIRIMLI', 'quantity', 1)
       ),
       $1::text)`,
    [kod],
  );
  const { rows: o } = await db.query(
    `select subtotal, shipping, total, (metadata ->> 'discount')::bigint as discount
       from public.arc_orders where id = $1`,
    [rows[0].order_id],
  );
  return o[0];
}

describe("kupon indirimdeki üründe geçmez", () => {
  test("birleşmeyen kupon yalnızca indirimsiz satıra uygulanıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const o = await siparis("TEKBAS");
      assert.equal(Number(o.subtotal), 100000, "ara toplam sepetin tamamı");
      /* 500 TL indirimsiz satırın %10'u = 50 TL. Önceden 1.000 TL'nin
         %10'u (100 TL) düşülüyordu. */
      assert.equal(Number(o.discount), 5000);
    });
  });

  test("birleşebilir kupon sepetin tamamına uygulanıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      assert.equal(Number((await siparis("BIRLES")).discount), 10000);
    });
  });

  test("ücretsiz kargo kuponu indirimli sepette de kargoyu sıfırlıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const o = await siparis("KARGO");
      assert.equal(Number(o.shipping), 0);
      assert.equal(Number(o.discount), 0, "kargo kuponu mal bedelinden düşmez");
    });
  });

  test("kuponsuz siparişte indirim yok", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const o = await siparis(null);
      assert.equal(Number(o.discount), 0);
      assert.equal(Number(o.total), 100000 + 12000);
    });
  });
});
