/*
  İADE KARARI — veritabanı tarafı.

  Panel 16.10.2026'da iade ekranını yeniden yazdı: karar artık üç
  yerden veriliyor (detay formu, listedeki satır düğmesi, seçilenlerin
  toplu onayı) ve üçü de tek bir çekirdekten geçiyor
  (iadeler/actions.ts → onayiYaz). O çekirdeğin güvendiği iki şey
  VERİTABANINDA: güncellemenin `status = 'beklemede'` koşulu ve RLS.

  Burada sınanan şey o iki dayanak. Koşul düşerse iki sekmeden verilen
  iki karar üst üste yazılır (ve müşteriye iki ayrı e-posta gider);
  toplu onayda arada el değmiş bir talep sessizce ikinci kez
  "onaylandı" sayılır.

  Para iadesinin kendisi (PayTR) burada yok: o ağ tarafında.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000c1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000000c2";
const SAHIP = "00000000-0000-4000-8000-0000000000c3";
const MUSTERI = "00000000-0000-4000-8000-0000000000c4";
const YABANCI = "00000000-0000-4000-8000-0000000000c5";
const SIPARIS = "00000000-0000-4000-8000-0000000000c6";
const TALEP = "00000000-0000-4000-8000-0000000000c7";

let db;
before(async () => {
  db = await veritabani();
  await tohum();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@example.com'),
      ('${MUSTERI}', 'musteri@example.com'),
      ('${YABANCI}', 'yabanci@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${BASKA_KURUM}', 'Başka Mağaza', 'baska', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${KURUM}', '${SAHIP}', 'owner', true),
      ('${BASKA_KURUM}', '${YABANCI}', 'owner', true);
    insert into public.arc_orders
      (id, organization_id, user_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', '${MUSTERI}', 'AC-KARAR', 'native', 'fulfilled', 'paid', 'TRY',
              6000, 0, 0, 6000, '{}'::jsonb, now(), now());
    insert into public.arc_return_requests
      (id, organization_id, order_id, user_id, items, reason, status, created_at, updated_at)
      values ('${TALEP}', '${KURUM}', '${SIPARIS}', '${MUSTERI}',
              '[{"sku":"KUPA-1","quantity":1,"total":2000}]'::jsonb, 'Bedeni olmadı', 'beklemede', now(), now());
  `);
}

/** Panelin yazdığı onay: koşul `status = 'beklemede'`. */
const onayla = (kullanici) =>
  db.query(
    `update public.arc_return_requests
        set status = 'onaylandi', status_note = $2, updated_at = now()
      where id = $1 and status = 'beklemede'
      returning id`,
    [TALEP, kullanici],
  );

describe("iade kararı", () => {
  test("bekleyen talebi yönetici onaylıyor", async () => {
    await islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const { rows } = await onayla("ilk karar");
      assert.equal(rows.length, 1, "bekleyen talep onaylanmalı");
    });
  });

  test("İKİNCİ onay hiçbir satıra dokunmuyor", async () => {
    /*
      İki sekmeden verilen iki karar. Koşul olmasaydı ikincisi de
      "başarılı" dönerdi ve panel müşteriye ikinci bir onay e-postası
      gönderirdi: aynı talep için iki kez "ürünü gönderebilirsiniz".
    */
    await islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await onayla("ilk karar");
      const { rows } = await onayla("ikinci karar");
      assert.equal(rows.length, 0, "sonuçlanmış talep yeniden onaylanamaz");
    });
  });

  test("reddedilmiş talep onaya dönmüyor", async () => {
    await islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await db.query(
        `update public.arc_return_requests set status = 'reddedildi', resolved_at = now() where id = $1`,
        [TALEP],
      );
      const { rows } = await onayla("geç kalan onay");
      assert.equal(rows.length, 0);
    });
  });

  test("para iadesi yalnızca ONAYLANMIŞ talepte yazılıyor", async () => {
    /*
      Panel aynı koşulu kuruyor (decision === "iade-et" ise status
      'onaylandi' olmalı): ürün elimize ulaşmadan para gönderilmesin.
    */
    await islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const erken = await db.query(
        `update public.arc_return_requests
            set status = 'tamamlandi', refund_amount = 2000, resolved_at = now()
          where id = $1 and status = 'onaylandi' returning id`,
        [TALEP],
      );
      assert.equal(erken.rows.length, 0, "bekleyen talepten doğrudan para iadesi yazılamaz");

      await onayla("onay");
      const { rows } = await db.query(
        `update public.arc_return_requests
            set status = 'tamamlandi', refund_amount = 2000, resolved_at = now()
          where id = $1 and status = 'onaylandi' returning refund_amount`,
        [TALEP],
      );
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].refund_amount), 2000);
    });
  });

  test("başka mağazanın yöneticisi karar veremiyor (RLS)", async () => {
    /*
      Kimlik adreste taşınıyor: yabancı bir kullanıcı talebin kimliğini
      bilse de güncelleyememeli. RLS satırı sessizce eliyor — update
      hata vermez, SIFIR satıra dokunur.
    */
    await islem(db, async () => {
      await rol(db, "authenticated", YABANCI);
      const { rows } = await onayla("yabancı");
      assert.equal(rows.length, 0, "başka kurumun talebi güncellenemez");
    });
    await islem(db, async () => {
      await rol(db, "postgres");
      const { rows } = await db.query(`select status from public.arc_return_requests where id = $1`, [TALEP]);
      assert.equal(rows[0].status, "beklemede", "kayıt değişmemiş olmalı");
    });
  });

  test("müşteri kendi talebini okuyor ama karar veremiyor", async () => {
    await islem(db, async () => {
      await rol(db, "authenticated", MUSTERI);
      const okuma = await db.query(`select id from public.arc_return_requests where id = $1`, [TALEP]);
      assert.equal(okuma.rows.length, 1, "müşteri kendi talebini görmeli");
      const { rows } = await onayla("müşterinin kendisi");
      assert.equal(rows.length, 0, "müşteri kendi talebini onaylayamaz");
    });
  });

  test("pasif üyelik karar veremiyor", async () => {
    /*
      İşten ayrılan personelin üyeliği pasife alınıyor; oturumu açık
      kalmış olabilir.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.query(`update public.organization_memberships set is_active = false where organization_id = $1 and user_id = $2`, [KURUM, SAHIP]);
      await rol(db, "authenticated", SAHIP);
      const { rows } = await onayla("pasif üye");
      assert.equal(rows.length, 0);
    });
  });
});
