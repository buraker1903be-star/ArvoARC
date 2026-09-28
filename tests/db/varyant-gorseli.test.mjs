/*
  VARYANT BAŞINA GÖRSEL — vitrin ne döndürüyor.

  Varyantın görseli ürünün galerisine İŞARET ediyor; kendi deposu yok.
  Bu yüzden iki şey sessizce bozulabilir ve ikisi de burada sınanıyor:

    - galeride olmayan bir yol (elle yazılmış ya da görseli silinmiş
      varyant) vitrinde kırık resim demek — fonksiyon onu elemeli,
    - fonksiyonun dönüş şekli değiştiği için DÜŞÜRÜLÜP yeniden
      kuruluyor; düşürme yetkileri de siliyor ve Postgres yenisini
      PUBLIC'e açık oluşturuyor (19.09.2026'daki açığın kökü).
      Yetkiler tests/db/yetki.test.mjs'de ayrıca sabit.

  MEŞRU AKIŞ da sınanıyor: atanmış ve galeride duran bir görsel
  gerçekten dönmeli, yoksa koruma özelliği tamamen kapatmış olur.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928172019_varyant_gorseli.sql",
);

const KURUM = "00000000-0000-4000-8000-00000000c001";
const URUN = "00000000-0000-4000-8000-00000000c002";
const KAPAK = "org/urun/kapak.jpg";
const SIYAH = "org/urun/siyah.jpg";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  /* Vitrin fonksiyonu yalnızca 'arvoculture' salonunu okuyor. */
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, status, source, metadata)
      values ('${URUN}', '${KURUM}', 'Tişört', 'tisort', 'active', 'native',
              jsonb_build_object('image_paths', jsonb_build_array('${KAPAK}', '${SIYAH}')));
    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes, image_path) values
      -- Galeride DURAN bir görsel: dönmeli.
      ('${KURUM}', '${URUN}', 'TS-SIYAH-M', 'Siyah / M', 64990, 'TRY', 5, false, '{}'::jsonb, '${SIYAH}'),
      -- Galeride OLMAYAN bir yol: elenmeli.
      ('${KURUM}', '${URUN}', 'TS-BEYAZ-M', 'Beyaz / M', 64990, 'TRY', 5, false, '{}'::jsonb, 'org/urun/silinmis.jpg'),
      -- Görseli yok: kapak kullanılacak, NULL dönmeli.
      ('${KURUM}', '${URUN}', 'TS-GRI-M', 'Gri / M', 64990, 'TRY', 5, false, '{}'::jsonb, null);
  `);
}

const vitrin = async () => {
  const { rows } = await db.query(`select sku, color, size, image_path from public.get_arvoculture_storefront_variants('tisort') order by sku`);
  return Object.fromEntries(rows.map((r) => [r.sku, r]));
};

describe("varyant görseli", () => {
  test("atanmış ve galeride duran görsel vitrine dönüyor", async () => {
    await islem(db, async () => {
      await tohum();
      const satirlar = await vitrin();
      assert.equal(satirlar["TS-SIYAH-M"].image_path, SIYAH);
      /* Renk/beden ayrıştırması bozulmamalı: matris de bu yazımı üretiyor. */
      assert.equal(satirlar["TS-SIYAH-M"].color, "Siyah");
      assert.equal(satirlar["TS-SIYAH-M"].size, "M");
    });
  });

  test("galeride olmayan yol eleniyor", async () => {
    /* Kırık resim göstermektense kapağa düşmek. */
    await islem(db, async () => {
      await tohum();
      assert.equal((await vitrin())["TS-BEYAZ-M"].image_path, null);
    });
  });

  test("görseli olmayan varyant NULL dönüyor", async () => {
    await islem(db, async () => {
      await tohum();
      assert.equal((await vitrin())["TS-GRI-M"].image_path, null);
    });
  });

  test("galeriden görsel çıkınca varyant da kapağa düşüyor", async () => {
    /*
      Panel görseli silerken varyantı da çözüyor (removeProductImage)
      ama vitrin ikinci kat olarak burada da eliyor: doğrudan SQL'den
      yapılan bir silme paneli atlıyor.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(
        `update public.arc_products set metadata = jsonb_build_object('image_paths', jsonb_build_array($1::text)) where id = $2::uuid`,
        [KAPAK, URUN],
      );
      assert.equal((await vitrin())["TS-SIYAH-M"].image_path, null);
    });
  });

  test("taslak ürünün varyantları vitrine hiç çıkmıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.arc_products set status = 'draft' where id = $1`, [URUN]);
      const { rows } = await db.query(`select sku from public.get_arvoculture_storefront_variants('tisort')`);
      assert.equal(rows.length, 0);
    });
  });

  test("anon fonksiyonu çağırabiliyor, tablo doğrudan okunamıyor", async () => {
    /*
      Fonksiyon yeniden kurulurken yetkiler silinip verildi. Vitrin
      anonim çalışıyor; tabloya doğrudan erişim ise kapalı kalmalı.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const { rows } = await db.query(`select sku from public.get_arvoculture_storefront_variants('tisort')`);
      assert.equal(rows.length, 3);
      const { rows: dogrudan } = await db.query(`select id from public.arc_product_variants`);
      assert.equal(dogrudan.length, 0, "anon tabloyu doğrudan okumamalı");
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      assert.equal((await vitrin())["TS-SIYAH-M"].image_path, SIYAH);
    });
  });
});
