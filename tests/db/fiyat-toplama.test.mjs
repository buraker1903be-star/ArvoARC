/*
  FİYAT TOPLAMA TABLOSU — veritabanı tarafı.

  arc_price_collections'a tarayıcı toplayıcısı yazıyor ama isteği
  KULLANICI OTURUMU TAŞIMIYOR: betik LR'ın sayfasında çalışıyor, bizim
  çerezlerimiz oraya gitmiyor. Yazma bu yüzden servis anahtarıyla, jeton
  doğrulandıktan sonra uçta yapılıyor (api/fiyat-toplayici) ve tablonun
  INSERT politikası YOK.

  Sınanan şey: oturumlu bir kullanıcının kendi başına satır bırakamaması
  ve başka mağazanın toplamasını görememesi. Liste panelde fiyat
  önizlemesine dönüşüyor; yabancı bir satır oraya girerse canlı mağazada
  yanlış fiyat önerilir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-000000000201";
const BASKA_KURUM = "00000000-0000-4000-8000-000000000202";
const UYE = "00000000-0000-4000-8000-000000000203";
const YABANCI = "00000000-0000-4000-8000-000000000204";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${UYE}', 'uye@example.com'), ('${YABANCI}', 'yabanci@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${BASKA_KURUM}', 'Başka', 'baska', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${UYE}', 'owner', '{}'::jsonb, true, now(), false),
      ('${BASKA_KURUM}', '${YABANCI}', 'owner', '{}'::jsonb, true, now(), false);
    insert into public.arc_price_collections (organization_id, kaynak, satirlar, sayfa) values
      ('${KURUM}', 'lr', '[{"sku":"20604-201","ad":"Aloe","fiyatlar":[34990]}]'::jsonb, 'https://shop.lrworld.com/x'),
      ('${BASKA_KURUM}', 'lr', '[{"sku":"11111","ad":"X","fiyatlar":[1000]}]'::jsonb, null);
  `);
}

const okunan = async () => (await db.query(`select organization_id from public.arc_price_collections`)).rows;

describe("fiyat toplama · erişim", () => {
  test("ÜYE yalnızca kendi mağazasının toplamasını görüyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const satirlar = await okunan();
      assert.equal(satirlar.length, 1);
      assert.equal(satirlar[0].organization_id, KURUM);
    }));

  test("ANON hiçbir toplamayı görmüyor", () =>
    islem(db, async () => {
      /*
        Liste ürün numaralarını ve alış fiyatlarını taşıyor: tedarikçi
        iskontosu dışarıya sızmamalı.
      */
      await tohum();
      await rol(db, "anon");
      assert.equal((await okunan()).length, 0);
    }));

  test("OTURUMLU KULLANICI satır bırakamıyor (INSERT politikası yok)", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      await reddedilir(
        db,
        `insert into public.arc_price_collections (organization_id, satirlar) values ($1, '[]'::jsonb)`,
        [KURUM],
        /row-level security/i,
      );
    }));

  test("üye kendi toplamasını UYGULANDI diye işaretleyebiliyor", () =>
    islem(db, async () => {
      /* Panel uyguladıktan sonra bu damgayı atıyor; ikinci kez uygulamayı fark ettiren tek şey. */
      await tohum();
      await rol(db, "authenticated", UYE);
      await db.query(`update public.arc_price_collections set uygulandi_at = now() where organization_id = $1`, [KURUM]);
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select organization_id, uygulandi_at from public.arc_price_collections where uygulandi_at is not null`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].organization_id, KURUM);
    }));

  test("BAŞKA MAĞAZANIN toplaması güncellenemiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YABANCI);
      const { rows } = await db.query(
        `update public.arc_price_collections set uygulandi_at = now() where organization_id = $1 returning id`,
        [KURUM],
      );
      assert.equal(rows.length, 0, "politika satırı hiç görmüyor");
    }));

  test("mağaza silinince toplamaları da siliniyor", () =>
    islem(db, async () => {
      /* Liste mağazaya ait; mağaza gidince artık kimsenin önizlemesine girmemeli. */
      await tohum();
      await db.query(`delete from public.organizations where id = $1`, [BASKA_KURUM]);
      const { rows } = await db.query(`select organization_id from public.arc_price_collections`);
      assert.deepEqual(rows.map((r) => r.organization_id), [KURUM]);
    }));
});
