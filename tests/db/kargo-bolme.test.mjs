/*
  BÖLÜNMÜŞ KARGO — veritabanı tarafı.

  Sınanan şey adet bütünlüğünün TETİKLEYİCİDE korunması. RLS "kim
  yazabilir"i söyler, "ne kadar"ı söylemez: panelin oturum jetonu tarayıcıda
  ve bu tabloya yazma yetkisi olan biri API'den doğrudan istediği adedi
  gönderebilir. Sipariş kaleminden fazlasını kargoya vermek stoğu ve iade
  hesabını bozar, üstelik müşteriye olmayan ürün için takip numarası gider.

  MEŞRU AKIŞ da sınanıyor (AGENTS.md): koruma eklerken yalnızca saldırı
  senaryosuna bakmak, 19.09.2026'da teklif dondurma kuralında müşterinin
  onayını canlıda kırmıştı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000a1";
const YABANCI_KURUM = "00000000-0000-4000-8000-0000000000a2";
const UYE = "00000000-0000-4000-8000-0000000000b1";
const YABANCI_UYE = "00000000-0000-4000-8000-0000000000b2";
const SIPARIS = "00000000-0000-4000-8000-0000000000c1";
const KALEM_KUPA = "00000000-0000-4000-8000-0000000000d1";
const KALEM_TABAK = "00000000-0000-4000-8000-0000000000d2";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${UYE}', 'uye@example.com'), ('${YABANCI_UYE}', 'yabanci@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Tarzyeri', 'tarzyeri', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
             ('${YABANCI_KURUM}', 'Başka Mağaza', 'baska-magaza', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${UYE}', 'owner', '{}'::jsonb, true, now(), false),
      ('${YABANCI_KURUM}', '${YABANCI_UYE}', 'owner', '{}'::jsonb, true, now(), false);
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'TY-1', 'native', 'confirmed', 'paid', 'TRY',
              10000, 0, 0, 10000, '{}'::jsonb, now(), now());
    insert into public.arc_order_items
      (id, organization_id, order_id, product_name, sku, quantity, unit_price, total) values
      ('${KALEM_KUPA}', '${KURUM}', '${SIPARIS}', 'Kupa', 'KUPA-1', 3, 2000, 6000),
      ('${KALEM_TABAK}', '${KURUM}', '${SIPARIS}', 'Tabak', 'TBK-1', 1, 4000, 4000);
  `);
}

/** Gönderi açar ve kimliğini döndürür. */
async function gonderiAc(status = "draft", sequence = 1) {
  const { rows } = await db.query(
    `insert into public.arc_shipments (organization_id, order_id, status, sequence)
     values ($1, $2, $3, $4) returning id`,
    [KURUM, SIPARIS, status, sequence],
  );
  return rows[0].id;
}

const kalemEkle = (gonderiId, kalemId, adet) =>
  db.query(
    `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
     values ($1, $2, $3, $4) returning id`,
    [KURUM, gonderiId, kalemId, adet],
  );

describe("bölünmüş kargo · adet bütünlüğü", () => {
  test("MEŞRU AKIŞ: sipariş iki firmaya bölünebiliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const birinci = await gonderiAc("created", 1);
      const ikinci = await gonderiAc("created", 2);
      await kalemEkle(birinci, KALEM_KUPA, 2);
      await kalemEkle(ikinci, KALEM_KUPA, 1);
      await kalemEkle(ikinci, KALEM_TABAK, 1);

      await rol(db, "postgres");
      const { rows } = await db.query(
        `select sum(quantity)::int as toplam from public.arc_shipment_items where order_item_id = $1`,
        [KALEM_KUPA],
      );
      assert.equal(rows[0].toplam, 3, "üç adet iki gönderiye dağıtılabilmeli");
    }));

  test("sipariş adedini AŞAN kalem reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const gonderi = await gonderiAc("created");
      await kalemEkle(gonderi, KALEM_KUPA, 2);
      const ikinci = await gonderiAc("created", 2);
      await reddedilir(
        db,
        `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
         values ($1, $2, $3, $4)`,
        [KURUM, ikinci, KALEM_KUPA, 2],
        /sipariş adedini aşamaz/i,
      );
    }));

  test("tek seferde aşan adet de reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const gonderi = await gonderiAc("created");
      await reddedilir(
        db,
        `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
         values ($1, $2, $3, $4)`,
        [KURUM, gonderi, KALEM_TABAK, 2],
        /sipariş adedini aşamaz/i,
      );
    }));

  test("İPTAL edilen gönderinin adedi yeniden bölünebiliyor", () =>
    islem(db, async () => {
      /*
        Yanlış firmaya verilip iptal edilen gönderi siparişi sonsuza kadar
        kilitlerdi; iptal sayıma girmiyor.
      */
      await tohum();
      await rol(db, "authenticated", UYE);
      const iptal = await gonderiAc("created", 1);
      await kalemEkle(iptal, KALEM_TABAK, 1);
      await db.query(`update public.arc_shipments set status = 'cancelled' where id = $1`, [iptal]);

      const yeni = await gonderiAc("created", 2);
      const sonuc = await kalemEkle(yeni, KALEM_TABAK, 1);
      assert.equal(sonuc.rows.length, 1, "iptalden sonra yeniden kargoya verilebilmeli");
    }));

  test("BAŞKA siparişin kalemi bu gönderiye eklenemiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const baskaSiparis = "00000000-0000-4000-8000-0000000000c9";
      const baskaKalem = "00000000-0000-4000-8000-0000000000d9";
      await db.exec(`
        insert into public.arc_orders
          (id, organization_id, order_number, source, status, payment_status, currency,
           subtotal, tax, shipping, total, metadata, created_at, updated_at)
          values ('${baskaSiparis}', '${KURUM}', 'TY-2', 'native', 'confirmed', 'paid', 'TRY',
                  1000, 0, 0, 1000, '{}'::jsonb, now(), now());
        insert into public.arc_order_items
          (id, organization_id, order_id, product_name, sku, quantity, unit_price, total)
          values ('${baskaKalem}', '${KURUM}', '${baskaSiparis}', 'Kaşık', 'KSK-1', 1, 1000, 1000);
      `);
      await rol(db, "authenticated", UYE);
      const gonderi = await gonderiAc("created");
      await reddedilir(
        db,
        `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
         values ($1, $2, $3, $4)`,
        [KURUM, gonderi, baskaKalem, 1],
        /siparişine ait değil/i,
      );
    }));

  test("adet GÜNCELLENİRKEN de aşım engelleniyor", () =>
    islem(db, async () => {
      // Ekleme sırasında geçen bir satır, sonradan büyütülerek aşırılabilirdi.
      await tohum();
      await rol(db, "authenticated", UYE);
      const gonderi = await gonderiAc("created");
      const { rows } = await kalemEkle(gonderi, KALEM_KUPA, 2);
      await reddedilir(
        db,
        `update public.arc_shipment_items set quantity = 5 where id = $1`,
        [rows[0].id],
        /sipariş adedini aşamaz/i,
      );
    }));
});

describe("bölünmüş kargo · mağaza kapsamı", () => {
  test("başka mağazanın üyesi gönderiyi GÖREMİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const gonderi = await gonderiAc("created");
      await kalemEkle(gonderi, KALEM_KUPA, 1);

      // RLS hata vermiyor, SIFIR satır gösteriyor.
      await rol(db, "authenticated", YABANCI_UYE);
      const gonderiler = await db.query(`select id from public.arc_shipments`);
      assert.equal(gonderiler.rows.length, 0, "yabancı mağaza gönderiyi görmemeli");
      const kalemler = await db.query(`select id from public.arc_shipment_items`);
      assert.equal(kalemler.rows.length, 0, "yabancı mağaza gönderi kalemini görmemeli");
    }));

  test("başka mağazanın üyesi gönderi YAZAMIYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YABANCI_UYE);
      await reddedilir(
        db,
        `insert into public.arc_shipments (organization_id, order_id, status) values ($1, $2, 'created')`,
        [KURUM, SIPARIS],
        /row-level security|policy/i,
      );
    }));
});

describe("gönderi kaynağı", () => {
  test("TEDARİKÇİNİN KENDİ gönderdiği kayıt takip numarasız olamıyor", () =>
    islem(db, async () => {
      /*
        Kaynağı "manual" olan gönderinin tek işe yarar bilgisi takip
        numarası: etiketi yok, OTO kaydı yok, sorgulanamaz. Numarasız
        kaydedilirse müşteriye söylenecek hiçbir şey olmadan sipariş
        "kargolandı" görünürdü.
      */
      await tohum();
      await rol(db, "authenticated", UYE);
      await reddedilir(
        db,
        `insert into public.arc_shipments (organization_id, order_id, source, status)
         values ($1, $2, 'manual', 'created')`,
        [KURUM, SIPARIS],
        /takip numarası zorunludur/i,
      );
    }));

  test("numara verilince elle gönderi kaydediliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const { rows } = await db.query(
        `insert into public.arc_shipments
           (organization_id, order_id, source, status, carrier_code, tracking_number, supplier)
         values ($1, $2, 'manual', 'created', 'yurtici', '1234567890', 'LR') returning id, source, supplier`,
        [KURUM, SIPARIS],
      );
      assert.equal(rows[0].source, "manual");
      assert.equal(rows[0].supplier, "LR");
    }));

  test("OTO gönderisi numarasız açılabiliyor (numara sonra düşüyor)", () =>
    islem(db, async () => {
      // Önce taslak açılıyor, firma seçilince numara geliyor.
      await tohum();
      await rol(db, "authenticated", UYE);
      const { rows } = await db.query(
        `insert into public.arc_shipments (organization_id, order_id, source, status)
         values ($1, $2, 'oto', 'draft') returning id`,
        [KURUM, SIPARIS],
      );
      assert.equal(rows.length, 1);
    }));

  test("tanınmayan kaynak reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      await reddedilir(
        db,
        `insert into public.arc_shipments (organization_id, order_id, source, status)
         values ($1, $2, 'baska', 'created')`,
        [KURUM, SIPARIS],
        /source_check/i,
      );
    }));
});
