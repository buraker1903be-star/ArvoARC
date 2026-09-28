/*
  KAYDEDİLMİŞ GÖRÜNÜMLER — tablonun kuralları.

  Görünüm SALONA ait ve ekibin tamamı okuyor; yazmayı yalnızca
  owner/admin/manager yapıyor. Sınanan şeyler, kuralın yanlış tarafa
  kaymasının sessiz olacağı yerler:

    - başka salonun üyesi görünümleri göremiyor (RLS),
    - pasife alınan üye ne okuyor ne yazıyor (AGENTS.md'nin evi kuralı),
    - sıradan üye (member) kaydedemiyor ama okuyabiliyor,
    - aynı ad iki kez kaydedilemiyor, büyük/küçük harf de sayılmıyor.

  MEŞRU AKIŞ da sınanıyor: koruma eklerken yalnızca saldırı
  senaryosuna bakmak, 19.09.2026'da müşterinin onayını canlıda
  kırmıştı. Müdürün kaydetme ve kaldırma yolu yeşil kalmalı.

  Migration DOSYADAN okunup ikinci kez uygulanıyor: SQL Editor'den elle
  çalıştırılan bir dosyanın yeniden çalıştırılması olağan.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928141843_kaydedilmis_gorunumler.sql",
);

const KURUM = "00000000-0000-4000-8000-00000000a001";
const BASKA_KURUM = "00000000-0000-4000-8000-00000000a002";
const MUDUR = "00000000-0000-4000-8000-00000000a003";
const UYE = "00000000-0000-4000-8000-00000000a004";
const AYRILAN = "00000000-0000-4000-8000-00000000a005";
const YABANCI = "00000000-0000-4000-8000-00000000a006";
const GORUNUM = "00000000-0000-4000-8000-00000000a007";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MUDUR}', 'mudur@example.com'),
      ('${UYE}', 'uye@example.com'),
      ('${AYRILAN}', 'ayrilan@example.com'),
      ('${YABANCI}', 'yabanci@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values
      ('${KURUM}', 'Tarzyeri', 'tarzyeri', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${BASKA_KURUM}', 'Komşu', 'komsu', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${MUDUR}', 'manager', '{}'::jsonb, true, now(), false),
      ('${KURUM}', '${UYE}', 'member', '{}'::jsonb, true, now(), false),
      ('${KURUM}', '${AYRILAN}', 'manager', '{}'::jsonb, false, now(), false),
      ('${BASKA_KURUM}', '${YABANCI}', 'owner', '{}'::jsonb, true, now(), false);
    insert into public.arc_saved_views (id, organization_id, liste, ad, sorgu, created_by)
      values ('${GORUNUM}', '${KURUM}', 'siparisler', 'Bugün kargolanacaklar', 'filter=confirmed&period=today', '${MUDUR}');
  `);
}

describe("kaydedilmiş görünümler", () => {
  test("müdür kaydediyor, kaldırıyor; meşru yol yeşil", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUDUR);

      await db.query(
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu, created_by)
         values ($1, 'urunler', 'Taslak Tarzyeri', 'filter=draft&source=tarzyeri', $2)`,
        [KURUM, MUDUR],
      );
      const { rows } = await db.query(
        `select ad from public.arc_saved_views where organization_id = $1 order by liste, ad`,
        [KURUM],
      );
      assert.deepEqual(rows.map((r) => r.ad), ["Bugün kargolanacaklar", "Taslak Tarzyeri"]);

      await db.query(`delete from public.arc_saved_views where id = $1`, [GORUNUM]);
      const { rows: kalan } = await db.query(
        `select count(*)::int as n from public.arc_saved_views where organization_id = $1`,
        [KURUM],
      );
      assert.equal(kalan[0].n, 1);
    });
  });

  test("sıradan üye okuyor ama kaydedemiyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);

      /* Okuma açık: depocunun da "bugün kargolanacaklar"a ihtiyacı var. */
      const { rows } = await db.query(`select id from public.arc_saved_views`);
      assert.equal(rows.length, 1);

      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', 'Benimki', 'filter=pending')`,
        [KURUM],
        /row-level security/i,
      );
      /*
        Silme HATA VERMİYOR, hiçbir satıra dokunmuyor: delete
        politikası olmayan rol için satır görünmez, Postgres "0 satır
        silindi" der. Bu yüzden hata değil SONUÇ ölçülüyor.
      */
      await db.query(`delete from public.arc_saved_views where id = $1`, [GORUNUM]);
      const { rows: kalan } = await db.query(`select count(*)::int as n from public.arc_saved_views`);
      assert.equal(kalan[0].n, 1, "üyenin silme denemesi satırı kaldırmamalı");
    });
  });

  test("pasife alınan üye ne okuyor ne yazıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", AYRILAN);

      const { rows } = await db.query(`select id from public.arc_saved_views`);
      assert.equal(rows.length, 0, "ayrılan kişi salonun görünümlerini görmemeli");
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', 'X', 'filter=pending')`,
        [KURUM],
        /row-level security/i,
      );
    });
  });

  test("başka salonun üyesi göremiyor ve yazamıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YABANCI);

      const { rows } = await db.query(`select id from public.arc_saved_views`);
      assert.equal(rows.length, 0);
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', 'Sızma', 'filter=pending')`,
        [KURUM],
        /row-level security/i,
      );
    });
  });

  test("aynı ad iki kez kaydedilemiyor; büyük/küçük harf de sayılmıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUDUR);
      /* "Bekleyenler" ile "bekleyenler" şeritte ayırt edilemezdi. */
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', 'bugün kargolanacaklar', 'filter=pending')`,
        [KURUM],
        /duplicate key|arc_saved_views_ad_uniq/i,
      );
      /* Aynı ad BAŞKA listede serbest: iki ayrı şerit. */
      await db.query(
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'urunler', 'Bugün kargolanacaklar', 'filter=draft')`,
        [KURUM],
      );
    });
  });

  test("tanınmayan liste ve boş ad kısıtta düşüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUDUR);
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'musteriler', 'X', 'filter=pending')`,
        [KURUM],
        /check constraint/i,
      );
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', '   ', 'filter=pending')`,
        [KURUM],
        /check constraint/i,
      );
      /* Süzgeçsiz görünüm anlamsız; uygulama da engelliyor, kısıt son söz. */
      await reddedilir(
        db,
        `insert into public.arc_saved_views (organization_id, liste, ad, sorgu) values ($1, 'siparisler', 'Boş', '')`,
        [KURUM],
        /check constraint/i,
      );
    });
  });

  test("salon silinince görünümler de gidiyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`delete from public.organizations where id = $1`, [KURUM]);
      const { rows } = await db.query(`select count(*)::int as n from public.arc_saved_views`);
      assert.equal(rows[0].n, 0);
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    /*
      Dosya SQL Editor'den elle uygulanıyor ve yeniden çalıştırılması
      olağan. Politikalar kendi "drop policy if exists" satırlarını
      taşıyor; taşımasalardı ikinci uygulama 42710 ile düşer ve
      gerisi hiç işlemezdi.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const { rows } = await db.query(
        `select count(*)::int as n from public.arc_saved_views where organization_id = $1`,
        [KURUM],
      );
      assert.equal(rows[0].n, 1, "yeniden uygulama var olan görünümü silmemeli");
    });
  });
});
