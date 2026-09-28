/*
  VİTRİN RENK VE BEDENİ NİTELİKLERDEN OKUYOR.

  Fonksiyon rengi varyant BAŞLIĞINI "/" ile bölerek buluyordu ve
  varsayım üç yerde kırılıyordu; her biri burada bir senaryo:

    - seçenekler renk/beden değilse ("Hacim / Koku") renk diye hacim
      gösteriliyordu,
    - renk adında "/" varsa ("Siyah/Beyaz Çizgili") başlık yanlış
      bölünüyordu,
    - seçenek sırası farklıysa ("M / Siyah") beden renk sanılıyordu.

  ESKİ KAYITLAR DA SINANIYOR: niteliği boş varyantlar hâlâ başlıktan
  okunmalı. Geri düşüş kaldırılsaydı vitrinde beden seçicisi yok
  olurdu — düzeltmenin bedelini eski katalog öderdi.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928175449_vitrin_varyant_nitelikleri.sql",
);

const KURUM = "00000000-0000-4000-8000-00000000d001";
const URUN = "00000000-0000-4000-8000-00000000d002";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_products (id, organization_id, name, slug, status, source, metadata)
      values ('${URUN}', '${KURUM}', 'Tişört', 'tisort', 'active', 'native', '{}'::jsonb);
    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes) values
      -- Nitelik VAR ve başlık ters sırada: nitelik kazanmalı.
      ('${KURUM}', '${URUN}', 'TS-1', 'M / Siyah', 10000, 'TRY', 5, false,
       '{"Beden":"M","Renk":"Siyah"}'::jsonb),
      -- Renk adında "/" var: başlık bölünseydi "Siyah" çıkardı.
      ('${KURUM}', '${URUN}', 'TS-2', 'Siyah/Beyaz Çizgili / L', 10000, 'TRY', 5, false,
       '{"Renk":"Siyah/Beyaz Çizgili","Beden":"L"}'::jsonb),
      -- ESKİ KAYIT: nitelik boş, başlıktan okunmalı.
      ('${KURUM}', '${URUN}', 'TS-3', 'Lacivert / XL', 10000, 'TRY', 5, false, '{}'::jsonb),
      -- Renk/beden OLMAYAN seçenekler: renk diye hacim gösterilmemeli.
      ('${KURUM}', '${URUN}', 'TS-4', '50 ml / Lavanta', 10000, 'TRY', 5, false,
       '{"Hacim":"50 ml","Koku":"Lavanta"}'::jsonb),
      -- İngilizce anahtar: aktarılan kataloglarda görülüyor.
      ('${KURUM}', '${URUN}', 'TS-5', 'Whatever', 10000, 'TRY', 5, false,
       '{"Color":"Bordo","Size":"S"}'::jsonb);
  `);
}

const vitrin = async () => {
  const { rows } = await db.query(
    `select sku, color, size, attributes from public.get_arvoculture_storefront_variants('tisort')`,
  );
  return Object.fromEntries(rows.map((r) => [r.sku, r]));
};

describe("vitrin varyant nitelikleri", () => {
  test("nitelik başlığın sırasını yeniyor", async () => {
    /* "M / Siyah" başlığı eskiden renk diye M gösteriyordu. */
    await islem(db, async () => {
      await tohum();
      const satir = (await vitrin())["TS-1"];
      assert.equal(satir.color, "Siyah");
      assert.equal(satir.size, "M");
    });
  });

  test("renk adındaki bölü işareti başlığı bozmuyor", async () => {
    await islem(db, async () => {
      await tohum();
      const satir = (await vitrin())["TS-2"];
      assert.equal(satir.color, "Siyah/Beyaz Çizgili");
      assert.equal(satir.size, "L");
    });
  });

  test("niteliği boş eski kayıt hâlâ başlıktan okunuyor", async () => {
    /* Geri düşüş kaldırılsaydı vitrinde beden seçicisi yok olurdu. */
    await islem(db, async () => {
      await tohum();
      const satir = (await vitrin())["TS-3"];
      assert.equal(satir.color, "Lacivert");
      assert.equal(satir.size, "XL");
    });
  });

  test("renk olmayan seçenek renk diye gösterilmiyor", async () => {
    await islem(db, async () => {
      await tohum();
      const satir = (await vitrin())["TS-4"];
      /* Nitelikte renk yok; başlığa düşüyor — ama nitelikler de
         dönüyor, vitrin kendi grubunu çizebilir. */
      assert.deepEqual(satir.attributes, { Hacim: "50 ml", Koku: "Lavanta" });
    });
  });

  test("İngilizce anahtarlar da tanınıyor", async () => {
    await islem(db, async () => {
      await tohum();
      const satir = (await vitrin())["TS-5"];
      assert.equal(satir.color, "Bordo");
      assert.equal(satir.size, "S");
    });
  });

  test("beden sıralaması nitelikten gelen bedene göre", async () => {
    /*
      Sıralama eskiden başlığı ikinci kez bölüyordu; nitelikten gelen
      beden sıralanamıyordu. XS önce, XL sonra gelmeli.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(`
        insert into public.organizations
          (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
          values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
        insert into public.arc_products (id, organization_id, name, slug, status, source, metadata)
          values ('${URUN}', '${KURUM}', 'Tişört', 'tisort', 'active', 'native', '{}'::jsonb);
        insert into public.arc_product_variants
          (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes) values
          ('${KURUM}', '${URUN}', 'B-XL', 'Siyah', 10000, 'TRY', 5, false, '{"Renk":"Siyah","Beden":"XL"}'::jsonb),
          ('${KURUM}', '${URUN}', 'B-XS', 'Siyah', 10000, 'TRY', 5, false, '{"Renk":"Siyah","Beden":"XS"}'::jsonb),
          ('${KURUM}', '${URUN}', 'B-M',  'Siyah', 10000, 'TRY', 5, false, '{"Renk":"Siyah","Beden":"M"}'::jsonb);
      `);
      const { rows } = await db.query(`select sku from public.get_arvoculture_storefront_variants('tisort')`);
      assert.deepEqual(rows.map((r) => r.sku), ["B-XS", "B-M", "B-XL"]);
    });
  });

  test("anon çağırabiliyor, tablo doğrudan okunamıyor", async () => {
    /* Fonksiyon düşürülüp kurulurken yetkiler silindi ve geri verildi. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const { rows } = await db.query(`select sku from public.get_arvoculture_storefront_variants('tisort')`);
      assert.equal(rows.length, 5);
      const { rows: dogrudan } = await db.query(`select id from public.arc_product_variants`);
      assert.equal(dogrudan.length, 0);
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      assert.equal((await vitrin())["TS-1"].color, "Siyah");
    });
  });
});
