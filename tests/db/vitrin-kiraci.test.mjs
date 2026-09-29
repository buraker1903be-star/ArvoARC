/*
  ÇOK KİRACILI VİTRİN — kiracı alan adından çözülüyor.

  Panel çok kiracılıydı, vitrin değildi: 19 fonksiyon tek kiracıyı
  sabit yazıyordu (o.slug = 'arvoculture'). Panelden ikinci bir salon
  açılabiliyor ama mağazası olmuyordu.

  BU DOSYANIN ASIL İŞİ SIZINTIYI ÖNLEMEK. Çok kiracılı bir sistemde en
  pahalı kusur, bir salonun adresinden ötekinin ürününün, kuponunun ya
  da ayarının görünmesi. Bu yüzden her senaryo İKİ kiracıyla kuruluyor
  ve "A'nın adresi yalnızca A'yı getiriyor" diye ölçülüyor — "sorgu
  çalışıyor mu" diye değil.

  storefront_url ile çözüm BİLEREK yok: o sütunda tekillik yok ve bir
  salon oraya başkasının alan adını yazıp isteği kendine çekebilirdi.
  Aşağıda bu da sınanıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260929062348_vitrin_kiraciya_gore.sql",
);

const A = "00000000-0000-4000-8000-00000000f001"; // özel alan adı, doğrulanmış
const B = "00000000-0000-4000-8000-00000000f002"; // platform alt alan adı
const C = "00000000-0000-4000-8000-00000000f003"; // alan adı doğrulanmamış

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${A}', 'Salon A', 'salon-a', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${B}', 'Salon B', 'salon-b', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${C}', 'Salon C', 'salon-c', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    -- order_prefix KİRACILAR ARASI TEKİL (arc_store_settings_order_prefix_unique_idx)
    -- ve varsayılanı var: ikinci salon önek seçmeden ayar satırı bile alamıyor.
    insert into public.arc_store_settings (organization_id, store_name, order_prefix, custom_domain, domain_verified_at, platform_subdomain, storefront_url, shipping_fee) values
      ('${A}', 'Salon A', 'SA', 'salona.com', now(), null, 'https://salona.com', 12000),
      ('${B}', 'Salon B', 'SB', null, null, 'salonb', 'https://salonb.shop.arvo-os.com', 9000),
      -- C özel alan adını YAZMIŞ ama doğrulamamış: mağazası açılmamalı.
      ('${C}', 'Salon C', 'SC', 'salonc.com', null, null, 'https://salonc.com', 5000);

    insert into public.arc_products (organization_id, name, slug, status, source, metadata) values
      ('${A}', 'A Ürünü', 'a-urunu', 'active', 'native', '{}'::jsonb),
      ('${B}', 'B Ürünü', 'b-urunu', 'active', 'native', '{}'::jsonb),
      ('${C}', 'C Ürünü', 'c-urunu', 'active', 'native', '{}'::jsonb);

    insert into public.arc_product_variants (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes)
      select p.organization_id, p.id, upper(p.slug), 'Tek', 10000, 'TRY', 5, false, '{}'::jsonb
      from public.arc_products p where p.slug in ('a-urunu','b-urunu','c-urunu');

    insert into public.arc_discounts (organization_id, name, code, discount_type, value, status, combinable, metadata) values
      ('${A}', 'A Kuponu', 'AKUPON', 'percentage', 10, 'active', false, '{}'::jsonb),
      ('${B}', 'B Kuponu', 'BKUPON', 'percentage', 20, 'active', false, '{}'::jsonb);
  `);
}

const org = async (host) => {
  const { rows } = await db.query(`select public.arc_storefront_org($1::text) as id`, [host]);
  return rows[0].id;
};
const urunler = async (host) => {
  const { rows } = await db.query(`select slug from public.arc_storefront_products($1::text)`, [host]);
  return rows.map((r) => r.slug);
};

describe("çok kiracılı vitrin", () => {
  test("doğrulanmış özel alan adı kendi salonunu çözüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      assert.equal(await org("salona.com"), A);
      /* www'lu biçim aynı mağaza; şema, port ve yol da düşmeli. */
      assert.equal(await org("www.salona.com"), A);
      assert.equal(await org("https://salona.com/urun/x"), A);
      assert.equal(await org("salona.com:443"), A);
      assert.equal(await org("SALONA.COM"), A);
    });
  });

  test("platform alt alan adı çözülüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      assert.equal(await org("salonb.shop.arvo-os.com"), B);
    });
  });

  test("DOĞRULANMAMIŞ alan adı çözülmüyor", async () => {
    /* Doğrulama olmadan sahiplik kanıtlanmış olmaz; adresi yazan
       herkesin mağazası açılsaydı kaçak yolu bu olurdu. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      assert.equal(await org("salonc.com"), null);
    });
  });

  test("storefront_url ile çözüm YOK", async () => {
    /*
      O sütunda tekillik yok. Bir salon oraya başkasının alan adını
      yazıp isteği kendine çekebilirdi; çözücü oraya hiç bakmıyor.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.arc_store_settings set storefront_url = 'https://salona.com' where organization_id = $1`, [C]);
      await rol(db, "anon");
      assert.equal(await org("salona.com"), A, "A'nın adresi hâlâ A olmalı");
    });
  });

  test("tanınmayan ve boş host null dönüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      for (const host of ["yok.com", "", "   ", "https://", null]) {
        assert.equal(await org(host), null, String(host));
      }
    });
  });

  test("her salonun adresi YALNIZCA kendi ürünlerini getiriyor", async () => {
    /* Çok kiracılı sistemde en pahalı kusur budur. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      assert.deepEqual(await urunler("salona.com"), ["a-urunu"]);
      assert.deepEqual(await urunler("salonb.shop.arvo-os.com"), ["b-urunu"]);
      /* Doğrulanmamış salonun mağazası hiç açılmıyor. */
      assert.deepEqual(await urunler("salonc.com"), []);
      assert.deepEqual(await urunler("yok.com"), []);
    });
  });

  test("ürün detayı komşunun slug'ını açmıyor", async () => {
    /* A'nın adresinden B'nin ürün adresini istemek boş dönmeli. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const { rows: kendi } = await db.query(`select name from public.arc_storefront_product($1::text, $2::text)`, ["salona.com", "a-urunu"]);
      assert.equal(kendi.length, 1);
      assert.equal(kendi[0].name, "A Ürünü");
      const { rows: komsu } = await db.query(`select name from public.arc_storefront_product($1::text, $2::text)`, ["salona.com", "b-urunu"]);
      assert.equal(komsu.length, 0);
    });
  });

  test("kuponlar ve ayarlar da kiracıya göre", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const kod = async (host) => (await db.query(`select code from public.arc_storefront_discounts($1::text)`, [host])).rows.map((r) => r.code);
      assert.deepEqual(await kod("salona.com"), ["AKUPON"]);
      assert.deepEqual(await kod("salonb.shop.arvo-os.com"), ["BKUPON"]);

      const kargo = async (host) => (await db.query(`select shipping_fee from public.arc_storefront_settings($1::text)`, [host])).rows[0]?.shipping_fee;
      assert.equal(Number(await kargo("salona.com")), 12000);
      assert.equal(Number(await kargo("salonb.shop.arvo-os.com")), 9000);
    });
  });

  test("eski fonksiyonlar yerinde duruyor", async () => {
    /*
      Bu dosya EKLEYEREK yazıldı: canlı mağaza eski adları çağırmaya
      devam ediyor ve bu migration ondan hiç etkilenmemeli.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const { rows } = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'get_arvoculture_storefront_%'`,
      );
      assert.ok(rows[0].n >= 14, `eski fonksiyonlar duruyor olmalı, bulunan: ${rows[0].n}`);
    });
  });

  test("anon çağırabiliyor, tablolar doğrudan okunamıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      assert.equal((await urunler("salona.com")).length, 1);
      /* arc_store_settingsin birincil anahtarı organization_id; id sütunu yok. */
      const { rows } = await db.query(`select organization_id from public.arc_store_settings`);
      assert.equal(rows.length, 0, "anon ayar tablosunu doğrudan okumamalı");
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      await rol(db, "anon");
      assert.deepEqual(await urunler("salona.com"), ["a-urunu"]);
    });
  });
});
