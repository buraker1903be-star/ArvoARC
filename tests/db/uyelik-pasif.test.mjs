/*
  ÜYELİĞİ PASİFE ALINAN KİŞİ ERİŞİMİNİ KAYBEDER.

  ArvoARC'ın politikalarının neredeyse hepsi "m.is_active" denetliyor:
  işten ayrılan kişinin üyeliği kapatılınca erişimi de kapanıyor.
  26–27.09.2026'da eklenen dört politika bunu atlamıştı; ayrılmış bir
  çalışan gönderileri (takip numarası, müşteri adresi) ve fiyat toplama
  kayıtlarını (tedarikçi alış fiyatları) okuyup yazmaya devam ediyordu.

  MEŞRU AKIŞ da sınanıyor (AGENTS.md): koruma eklerken yalnızca saldırı
  senaryosuna bakmak, 19.09.2026'da müşterinin onayını canlıda kırmıştı.
  Aktif üyenin yolu yeşil kalmalı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000f1";
const AKTIF = "00000000-0000-4000-8000-0000000000f2";
const AYRILAN = "00000000-0000-4000-8000-0000000000f3";
const SIPARIS = "00000000-0000-4000-8000-0000000000f4";
const GONDERI = "00000000-0000-4000-8000-0000000000f5";
const FIYAT = "00000000-0000-4000-8000-0000000000f6";
const KALEM = "00000000-0000-4000-8000-0000000000f7";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${AKTIF}', 'aktif@example.com'), ('${AYRILAN}', 'ayrilan@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Tarzyeri', 'tarzyeri', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${AKTIF}', 'owner', '{}'::jsonb, true, now(), false),
      -- Ayrılan kişi: üyelik satırı DURUYOR ama pasif. Silinmiyor çünkü
      -- geçmiş kayıtlarda "kim yaptı" bilgisi ona bağlı.
      ('${KURUM}', '${AYRILAN}', 'member', '{}'::jsonb, false, now(), false);
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'TY-1', 'native', 'confirmed', 'paid', 'TRY',
              10000, 0, 0, 10000, '{}'::jsonb, now(), now());
    insert into public.arc_order_items
      (id, organization_id, order_id, product_name, sku, quantity, unit_price, total)
      values ('${KALEM}', '${KURUM}', '${SIPARIS}', 'Kupa', 'KUPA-1', 2, 5000, 10000);
    insert into public.arc_shipments
      (id, organization_id, order_id, sequence, status, source, carrier_name, tracking_number,
       created_at, updated_at)
      values ('${GONDERI}', '${KURUM}', '${SIPARIS}', 1, 'in_transit', 'manual',
              'Yurtiçi', 'TRK-123456', now(), now());
    insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
      values ('${KURUM}', '${GONDERI}', '${KALEM}', 2);
    insert into public.arc_price_collections (id, organization_id, kaynak, satirlar, sayfa)
      values ('${FIYAT}', '${KURUM}', 'lr', '[{"sku":"KUPA-1","fiyatlar":[1234]}]'::jsonb, 'portal');
  `);
}

const sayi = async (sql) => Number((await db.query(sql)).rows[0].n);

describe("gönderiler", () => {
  test("aktif üye görüyor ve yazabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AKTIF);
      assert.equal(await sayi(`select count(*) n from public.arc_shipments`), 1);
      const { rows } = await db.query(
        `update public.arc_shipments set tracking_number = 'TRK-YENI' where id = '${GONDERI}' returning id`);
      assert.equal(rows.length, 1, "Aktif üyenin yolu yeşil kalmalı");
    }));

  test("ayrılan üye takip numarasını GÖREMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AYRILAN);
      // Eskiden 1 dönüyordu: gönderi tablosu müşteri adresi ve takip
      // numarası taşıyor, üyelik kapalı olsa bile okunabiliyordu.
      assert.equal(await sayi(`select count(*) n from public.arc_shipments`), 0);
    }));

  test("ayrılan üye gönderiyi DEĞİŞTİREMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AYRILAN);
      // RLS reddi hata değil, SIFIR SATIR: sessizce hiçbir şey olmuyor.
      const { rows } = await db.query(
        `update public.arc_shipments set tracking_number = 'ELE-GECTI' where id = '${GONDERI}' returning id`);
      assert.equal(rows.length, 0);
      await rol(db, "postgres");
      const kalan = await db.query(`select tracking_number from public.arc_shipments where id = '${GONDERI}'`);
      assert.equal(kalan.rows[0].tracking_number, "TRK-123456");
    }));

  test("ayrılan üye gönderi KALEMLERİNİ de göremiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AKTIF);
      assert.equal(await sayi(`select count(*) n from public.arc_shipment_items`), 1, "Aktif üye görmeli");
      await rol(db, "authenticated", AYRILAN);
      // Kalem satırı hangi üründen kaç adet gittiğini söylüyor.
      assert.equal(await sayi(`select count(*) n from public.arc_shipment_items`), 0);
    }));

  test("ayrılan üye gönderi kalemi EKLEYEMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AYRILAN);
      /*
        GERÇEK bir sipariş kalemi kullanılıyor: uydurma bir kimlik yabancı
        anahtara takılırdı ve test politikayı sınadığını sanarak yanlış
        sebeple yeşil kalırdı.
      */
      await db.exec("savepoint p");
      let hata = null;
      try {
        await db.query(
          `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
           values ('${KURUM}', '${GONDERI}', '${KALEM}', 1)`);
      } catch (sorun) {
        hata = sorun.message;
      }
      await db.exec("rollback to savepoint p");
      /*
        Redde sebebi POLİTİKA OLMAYABİLİR: adet bütünlüğü tetikleyicisi
        (arvo_arc_shipment_item_guard) security invoker ve sipariş kalemini
        çağıranın yetkisiyle okuyor; pasif üye onu da göremediği için guard
        önce düşüyor. İki katman da kapalı olduğu için hangisinin
        yakaladığını şart koşmuyoruz — şart koşmak, katmanlardan biri
        kaldırıldığında testi yanlış sebeple yeşil bırakırdı.
      */
      assert.ok(hata, "Pasif üyenin INSERT'i reddedilmeli");
    }));
});

describe("fiyat toplama", () => {
  test("aktif üye okuyor ve uygulayabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AKTIF);
      assert.equal(await sayi(`select count(*) n from public.arc_price_collections`), 1);
      const { rows } = await db.query(
        `update public.arc_price_collections set uygulandi_at = now() where id = '${FIYAT}' returning id`);
      assert.equal(rows.length, 1);
    }));

  test("ayrılan üye tedarikçi fiyatlarını GÖREMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AYRILAN);
      // Toplanan satırlar tedarikçinin alış fiyatları; rakip bilgisi.
      assert.equal(await sayi(`select count(*) n from public.arc_price_collections`), 0);
    }));
});

describe("kural bütün politikalarda aynı", () => {
  test("organization_memberships'e bakan hiçbir politika is_active'i atlamıyor", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      /*
        Tek tek test yazmak yerine kuralın KENDİSİ sınanıyor: yarın
        eklenen bir politika is_active yazmayı unutursa bu test kırmızıya
        döner. Dördünü ayrı ayrı sınamak, beşincisini kaçırırdı.
      */
      const { rows } = await db.query(`
        select p.tablename, p.policyname
        from pg_policies p
        where p.schemaname = 'public'
          and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%organization_memberships%'
          and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%is_active%'
        order by p.tablename, p.policyname`);
      assert.deepEqual(rows, [], `is_active denetlemeyen politika: ${rows.map((r) => `${r.tablename}.${r.policyname}`).join(", ")}`);
    }));
});
