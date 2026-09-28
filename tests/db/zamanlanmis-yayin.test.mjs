/*
  ZAMANLANMIŞ YAYIN — sütunlar, kısıt ve görevin sorguları.

  Görev iki güncelleme yapıyor (api/cron/yayin-zamani) ve ikisinin de
  DURUM koşulu var. Koşul düşerse en kötü sonuç sessiz: arşivlenmiş
  bir ürün ertesi sabah mağazada belirir. Burada sınanan tam olarak o
  koşulların tuttuğu satırlar.

  MEŞRU AKIŞ da sınanıyor (AGENTS.md): zamanı gelen taslak gerçekten
  yayına girmeli, yoksa koruma kampanyayı hiç başlatmaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928145713_zamanlanmis_yayin.sql",
);

const KURUM = "00000000-0000-4000-8000-00000000b001";
const SAHIP = "00000000-0000-4000-8000-00000000b002";

let db;
before(async () => {
  db = await veritabani();
});

/* Görevin yaptığı iki güncelleme; koşullar route.ts ile birebir. */
const YAYINA_AL = `
  update public.arc_products set status = 'active', publish_at = null, updated_at = now()
  where status = 'draft' and publish_at <= now() returning slug`;
const YAYINDAN_CIKAR = `
  update public.arc_products set status = 'draft', unpublish_at = null, updated_at = now()
  where status = 'active' and unpublish_at <= now() returning slug`;

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Tarzyeri', 'tarzyeri', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management)
      values ('${KURUM}', '${SAHIP}', 'owner', '{}'::jsonb, true, now(), false);

    insert into public.arc_products (organization_id, name, slug, status, source, publish_at, unpublish_at) values
      -- Zamanı gelmiş taslak: yayına girmeli.
      ('${KURUM}', 'Zamanı gelen', 'zamani-gelen', 'draft', 'native', now() - interval '1 minute', null),
      -- Zamanı gelmemiş taslak: dokunulmamalı.
      ('${KURUM}', 'Zamanı gelmeyen', 'zamani-gelmeyen', 'draft', 'native', now() + interval '1 day', null),
      -- ARŞİV: planı olsa bile mağazaya dönmemeli.
      ('${KURUM}', 'Arşivli', 'arsivli', 'archived', 'native', now() - interval '1 minute', null),
      -- Süresi dolmuş yayın: taslağa inmeli.
      ('${KURUM}', 'Süresi dolan', 'suresi-dolan', 'active', 'native', null, now() - interval '1 minute'),
      -- Süresi dolmamış yayın: dokunulmamalı.
      ('${KURUM}', 'Süresi dolmayan', 'suresi-dolmayan', 'active', 'native', null, now() + interval '1 day'),
      -- Planı olmayan taslak: dokunulmamalı.
      ('${KURUM}', 'Plansız', 'plansiz', 'draft', 'native', null, null);
  `);
}

const durum = async (slug) => {
  const { rows } = await db.query(`select status, publish_at, unpublish_at from public.arc_products where slug = $1`, [slug]);
  return rows[0];
};

describe("zamanlanmış yayın", () => {
  test("zamanı gelen taslak yayına giriyor, plan temizleniyor", async () => {
    await islem(db, async () => {
      await tohum();
      const { rows } = await db.query(YAYINA_AL);
      assert.deepEqual(rows.map((r) => r.slug), ["zamani-gelen"]);
      const urun = await durum("zamani-gelen");
      assert.equal(urun.status, "active");
      /* Plan kalsaydı, kullanıcı ürünü elle taslağa çektiğinde görev
         onu bir sonraki turda yeniden yayına alırdı. */
      assert.equal(urun.publish_at, null);
    });
  });

  test("arşivlenmiş ürün planı olsa da yayına girmiyor", async () => {
    await islem(db, async () => {
      await tohum();
      await db.query(YAYINA_AL);
      assert.equal((await durum("arsivli")).status, "archived");
    });
  });

  test("zamanı gelmemiş ve plansız kayıtlara dokunulmuyor", async () => {
    await islem(db, async () => {
      await tohum();
      await db.query(YAYINA_AL);
      await db.query(YAYINDAN_CIKAR);
      assert.equal((await durum("zamani-gelmeyen")).status, "draft");
      assert.equal((await durum("suresi-dolmayan")).status, "active");
      assert.equal((await durum("plansiz")).status, "draft");
    });
  });

  test("süresi dolan yayın taslağa iniyor", async () => {
    await islem(db, async () => {
      await tohum();
      const { rows } = await db.query(YAYINDAN_CIKAR);
      assert.deepEqual(rows.map((r) => r.slug), ["suresi-dolan"]);
      const urun = await durum("suresi-dolan");
      assert.equal(urun.status, "draft");
      assert.equal(urun.unpublish_at, null);
    });
  });

  test("aynı turda başlayıp biten kampanya taslakta kalıyor", async () => {
    /*
      Görev önce yayına alıyor, SONRA çıkarıyor. Sıra ters olsaydı
      geçmişte kalmış kısa bir kampanya yayında kalırdı.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        insert into public.arc_products (organization_id, name, slug, status, source, publish_at, unpublish_at)
        values ('${KURUM}', 'Kısa kampanya', 'kisa-kampanya', 'draft', 'native',
                now() - interval '2 hours', now() - interval '1 hour');
      `);
      await db.query(YAYINA_AL);
      await db.query(YAYINDAN_CIKAR);
      const urun = await durum("kisa-kampanya");
      assert.equal(urun.status, "draft");
      assert.equal(urun.publish_at, null);
      assert.equal(urun.unpublish_at, null);
    });
  });

  test("ters aralık kısıtta düşüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `insert into public.arc_products (organization_id, name, slug, status, source, publish_at, unpublish_at)
         values ($1, 'Ters', 'ters', 'draft', 'native', now() + interval '2 days', now() + interval '1 day')`,
        [KURUM],
        /arc_products_yayin_araligi|check constraint/i,
      );
      /* Sıfır saniyelik yayın da bir kusur. */
      await reddedilir(
        db,
        `insert into public.arc_products (organization_id, name, slug, status, source, publish_at, unpublish_at)
         values ($1, 'Eşit', 'esit', 'draft', 'native', now() + interval '1 day', now() + interval '1 day')`,
        [KURUM],
        /arc_products_yayin_araligi|check constraint/i,
      );
    });
  });

  test("tek taraflı plan serbest", async () => {
    /* Kısıt yalnızca İKİSİ de doluyken konuşuyor; meşru yol açık kalmalı. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(
        `insert into public.arc_products (organization_id, name, slug, status, source, publish_at, unpublish_at)
         values ($1, 'Tek', 'tek', 'draft', 'native', now() + interval '1 day', null)`,
        [KURUM],
      );
      assert.equal((await durum("tek")).status, "draft");
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    /* Dosya SQL Editor'den elle uygulanıyor; yeniden çalıştırılması olağan. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const { rows } = await db.query(
        `select count(*)::int as n from public.arc_products where organization_id = $1`,
        [KURUM],
      );
      assert.equal(rows[0].n, 6, "yeniden uygulama ürünlere dokunmamalı");
    });
  });
});
