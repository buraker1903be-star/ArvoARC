/*
  MANUEL SİPARİŞ ve ELLE STOK HAREKETİ — PANELİN KENDİ ROLÜYLE (17.10.2026).

  Canlıda ikisi de çalışmıyordu: pencere "Satış modülü kapalı" diyor,
  stok sayfası "Stok hareketi kaydedilemedi" diyordu. Sebep kuralın
  kendisi değil GÖRÜNÜRLÜKTÜ — organization_modules'te RLS açık,
  politika yok; arc_create_order ve arc_adjust_inventory ise çağıranın
  (authenticated) yetkisiyle çalışıyor ve modül satırını göremiyordu.

  Testlerin bunu kaçırma sebebi: bu fonksiyonlar hep veritabanı
  sahibiyle çağrılıyordu. Burada AÇIKÇA authenticated rolüyle
  çağrılıyor; politika olmadan test kırılır.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000e1";
const SAHIP = "00000000-0000-4000-8000-0000000000e2";
const YABANCI = "00000000-0000-4000-8000-0000000000e3";
const URUN = "00000000-0000-4000-8000-0000000000e4";
const VARYANT = "00000000-0000-4000-8000-0000000000e5";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip-manuel@example.com'),
      ('${YABANCI}', 'yabanci-manuel@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Manuel Test', 'manuel-test', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management)
      values ('${KURUM}', '${SAHIP}', 'owner', '{}'::jsonb, true, now(), false);
    insert into public.organization_modules (organization_id, module_code, is_enabled)
      values ('${KURUM}', 'commerce', true);
    insert into public.arc_products (id, organization_id, name, slug, status, created_at, updated_at)
      values ('${URUN}', '${KURUM}', 'Deneme Krem', 'deneme-krem', 'active', now(), now());
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, price, stock, allow_backorder, created_at, updated_at)
      values ('${VARYANT}', '${KURUM}', '${URUN}', 'DK-1', 56690, 3, false, now(), now());
  `);
}

const stok = async () => (await db.query(`select stock from public.arc_product_variants where id = $1`, [VARYANT])).rows[0].stock;

describe("panelin rolüyle manuel sipariş ve stok", () => {
  test("mağaza yöneticisi manuel sipariş oluşturabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      const { rows } = await db.query(
        `select * from public.arc_create_order($1, $2, $3::jsonb, 'native')`,
        ["Telefondaki Müşteri", "", JSON.stringify([{ variant_id: VARYANT, quantity: 2 }])],
      );
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].total), 113380, "toplam fiyat × adet");
      await rol(db, "postgres");
      assert.equal(await stok(), 1, "satış stoktan düşer");
      const hareket = await db.query(
        `select kind, quantity from public.arc_inventory_movements where variant_id = $1`, [VARYANT],
      );
      assert.deepEqual(hareket.rows.map((h) => [h.kind, h.quantity]), [["sale", -2]]);
    });
  });

  test("elle stok girişi kaydediliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await db.query(`select * from public.arc_adjust_inventory($1, 5, 'in', 'manual', null, 'Sayım')`, [VARYANT]);
      await rol(db, "postgres");
      assert.equal(await stok(), 8);
    });
  });

  /* Yabancı kullanıcı varyantı RLS yüzünden hiç GÖREMİYOR, bu yüzden
     üyelik kuralından önce "Variant not found" ile duruyor: kapalı
     başarısızlık, satır da sızmıyor. */
  test("başka mağazanın kullanıcısı sipariş oluşturamaz", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YABANCI);
      await reddedilir(
        db,
        `select * from public.arc_create_order($1, $2, $3::jsonb, 'native')`,
        ["Yabancı", "", JSON.stringify([{ variant_id: VARYANT, quantity: 1 }])],
        /Variant not found/,
      );
    });
  });

  test("modül gerçekten kapalıysa sipariş oluşmaz", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(`update public.organization_modules set is_enabled = false where organization_id = '${KURUM}'`);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `select * from public.arc_create_order($1, $2, $3::jsonb, 'native')`,
        ["Telefondaki Müşteri", "", JSON.stringify([{ variant_id: VARYANT, quantity: 1 }])],
        /Commerce module is disabled/,
      );
    });
  });
});
