/*
  SİPARİŞ KALEMİ MALİYETİ — veritabanı tarafı.

  Kâr sütunu maliyeti varyantın BUGÜNKÜ değerinden okuyordu; tedarikçi
  fiyatı değişince geçmiş siparişlerin kârı da değişmiş görünüyordu.
  Artık satış anında donuyor.

  YAZMA İŞİ TETİKLEYİCİDE, uygulama kodunda değil: sipariş kalemi üç
  ayrı yoldan oluşuyor (vitrin siparişi, manuel sipariş, Shopify
  aktarımı) ve tek tek yazmak er geç birini atlar. Sınanan şey tam
  olarak bu: kalem NEREDEN gelirse gelsin maliyet doluyor mu.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-000000000201";
const YABANCI = "00000000-0000-4000-8000-000000000202";
const URUN = "00000000-0000-4000-8000-000000000203";
const VARYANT = "00000000-0000-4000-8000-000000000204";
const YABANCI_VARYANT = "00000000-0000-4000-8000-000000000205";
const SIPARIS = "00000000-0000-4000-8000-000000000206";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'Maliyet Testi', 'maliyet-testi', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${YABANCI}', 'Yabancı', 'yabanci-magaza', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, status, created_at, updated_at) values
      ('${URUN}', '${KURUM}', 'Kupa', 'kupa', 'active', now(), now());
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, price, cost_price, stock, allow_backorder, created_at, updated_at) values
      ('${VARYANT}', '${KURUM}', '${URUN}', 'KUPA-1', 5000, 3000, 10, false, now(), now()),
      ('${YABANCI_VARYANT}', '${YABANCI}', '${URUN}', 'YBC-1', 9000, 8000, 10, false, now(), now());
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'ML-1', 'native', 'confirmed', 'paid', 'TRY',
              5000, 0, 0, 5000, '{}'::jsonb, now(), now());
  `);
}

const kalemEkle = (alanlar) =>
  db.query(
    `insert into public.arc_order_items
       (organization_id, order_id, product_name, sku, variant_id, quantity, unit_price, total, cost_price)
     values ($1, $2, 'Kupa', 'KUPA-1', $3, 1, 5000, 5000, $4)
     returning cost_price`,
    [KURUM, SIPARIS, alanlar.variant ?? null, alanlar.maliyet ?? null],
  );

describe("sipariş kalemi · maliyet tetikleyicisi", () => {
  test("MEŞRU AKIŞ: maliyet varyanttan doluyor", () =>
    islem(db, async () => {
      await tohum();
      const { rows } = await kalemEkle({ variant: VARYANT });
      assert.equal(rows[0].cost_price, 3000, "varyantın alış fiyatı yazıldı");
    }));

  test("SONRADAN DEĞİŞEN varyant fiyatı kalemi etkilemiyor", () =>
    islem(db, async () => {
      /*
        Donmanın bütün amacı bu: tedarikçi zammı geçmiş siparişlerin
        kârını değiştirmemeli.
      */
      await tohum();
      await kalemEkle({ variant: VARYANT });
      await db.query(`update public.arc_product_variants set cost_price = 4500 where id = $1`, [VARYANT]);
      const { rows } = await db.query(
        `select cost_price from public.arc_order_items where order_id = $1`,
        [SIPARIS],
      );
      assert.equal(rows[0].cost_price, 3000, "kalem eski maliyeti koruyor");
    }));

  test("AÇIKÇA VERİLEN maliyete dokunulmuyor", () =>
    islem(db, async () => {
      // Aktarım ya da düzeltme kendi maliyetini yazabilmeli.
      await tohum();
      const { rows } = await kalemEkle({ variant: VARYANT, maliyet: 1234 });
      assert.equal(rows[0].cost_price, 1234);
    }));

  test("VARYANTSIZ kalemde null kalıyor", () =>
    islem(db, async () => {
      /*
        Eski Shopify aktarımı ve elle yazılmış satırlar. Uydurma bir
        maliyet kârı olduğundan yüksek gösterirdi; panel null'da "—"
        yazıyor.
      */
      await tohum();
      const { rows } = await kalemEkle({});
      assert.equal(rows[0].cost_price, null);
    }));

  test("BAŞKA MAĞAZANIN varyantı kaleme hiç bağlanamıyor", () =>
    islem(db, async () => {
      /*
        Tetikleyicinin maliyet sorgusu organization_id ile daraltılmış,
        ama asıl koruma daha güçlü bir yerde: arc_order_items'ın
        variant_id + organization_id BİRLEŞİK yabancı anahtarı yabancı
        varyantı hiç kabul etmiyor. Yani sızıntı senaryosu kurulamıyor
        bile; test bunu sabitliyor ki anahtar ileride tek sütuna
        indirilirse fark edilsin.
      */
      await tohum();
      await reddedilir(
        db,
        `insert into public.arc_order_items
           (organization_id, order_id, product_name, sku, variant_id, quantity, unit_price, total)
         values ($1, $2, 'Kupa', 'YBC-1', $3, 1, 5000, 5000)`,
        [KURUM, SIPARIS, YABANCI_VARYANT],
        /foreign key|violates/i,
      );
    }));
});
