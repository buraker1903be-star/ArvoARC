/*
  SİPARİŞ ARŞİVİ (20261016124844). Kural veritabanında: yalnızca kapanmış
  sipariş arşivlenir; yeniden açılan ya da iade talebi gelen sipariş
  arşivden kendiliğinden çıkar. Meşru akış (yöneticinin tamamlanmış
  siparişi arşivlemesi) da sınanıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000a1";
const YONETICI = "00000000-0000-4000-8000-0000000000a2";
const SIPARIS = "00000000-0000-4000-8000-0000000000a3";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum(durum) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${YONETICI}', 'arsiv@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Arşiv Testi', 'arsiv-testi', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${YONETICI}', 'manager', '{}'::jsonb, true, now(), false);
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'AR-1', 'native', '${durum}', 'paid', 'TRY', 1000, 0, 0, 1000, '{}'::jsonb, now(), now());
  `);
}
const arsiv = async () => (await db.query(`select archived_at from public.arc_orders where id = $1`, [SIPARIS])).rows[0].archived_at;

describe("sipariş arşivi", () => {
  test("MEŞRU: yönetici tamamlanmış siparişi arşivliyor ve geri alıyor", () =>
    islem(db, async () => {
      await tohum("fulfilled");
      await rol(db, "authenticated", YONETICI);
      await db.query(`update public.arc_orders set archived_at = now(), archived_by = $2 where id = $1`, [SIPARIS, YONETICI]);
      await rol(db, "postgres");
      assert.ok(await arsiv(), "arşivlendi");
      await rol(db, "authenticated", YONETICI);
      await db.query(`update public.arc_orders set archived_at = null, archived_by = null where id = $1`, [SIPARIS]);
      await rol(db, "postgres");
      assert.equal(await arsiv(), null, "arşivden çıktı");
    }));

  test("açık sipariş arşivlenemiyor", () =>
    islem(db, async () => {
      await tohum("confirmed");
      await rol(db, "authenticated", YONETICI);
      await reddedilir(db, `update public.arc_orders set archived_at = now() where id = $1`, [SIPARIS], /Yalnızca tamamlanan/);
    }));

  test("arşivdeki sipariş yeniden açılınca arşivden çıkıyor", () =>
    islem(db, async () => {
      await tohum("fulfilled");
      await rol(db, "postgres");
      await db.query(`update public.arc_orders set archived_at = now() where id = $1`, [SIPARIS]);
      await db.query(`update public.arc_orders set status = 'processing' where id = $1`, [SIPARIS]);
      assert.equal(await arsiv(), null);
    }));

  test("arşivdeki siparişe iade talebi gelince arşivden çıkıyor", () =>
    islem(db, async () => {
      await tohum("fulfilled");
      await rol(db, "postgres");
      await db.query(`update public.arc_orders set archived_at = now() where id = $1`, [SIPARIS]);
      await db.query(
        `insert into public.arc_return_requests (id, organization_id, order_id, items, reason, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, '[]'::jsonb, 'Beden olmadı', 'beklemede', now(), now())`,
        [KURUM, SIPARIS],
      );
      assert.equal(await arsiv(), null);
    }));
});
