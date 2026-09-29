/*
  ÇOK KİRACILI VİTRİN — YAZMA YOLU: kupon, sipariş, iade talebi.

  Okuma tarafı 20260929062348 ile kiracıya bağlanmıştı; bu üçü
  olmadan ikinci salonun mağazası ürün gösterebilir ama SATIŞ YAPAMAZ.

  Burada ölçülen iki şey var ve ikincisi daha pahalı:

    1. Meşru yol: kendi adresinden kupon doğrulanıyor, sipariş
       oluşuyor ve sipariş DOĞRU kuruma yazılıyor.
    2. Sızıntı: bir salonun adresinden ötekinin kuponu geçerli
       sayılmıyor. Para tarafında bu, komşunun indirimini kullanmak
       demekti.

  Yetkiler de sınanıyor: kupon ve sipariş yalnızca service_role'a
  açık. anon'a açılmış olsaydı sepet tarayıcıdan doğrudan "sipariş
  oluştur"a bağlanabilirdi.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260929063937_vitrin_yazma_yolu_kiraciya_gore.sql",
);

const A = "00000000-0000-4000-8000-000000010001";
const B = "00000000-0000-4000-8000-000000010002";

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
      ('${B}', 'Salon B', 'salon-b', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_store_settings (organization_id, store_name, order_prefix, custom_domain, domain_verified_at, shipping_fee, free_shipping_threshold) values
      ('${A}', 'Salon A', 'SA', 'salona.com', now(), 12000, 200000),
      ('${B}', 'Salon B', 'SB', 'salonb.com', now(), 9000, 100000);

    insert into public.arc_products (organization_id, name, slug, status, source, metadata) values
      ('${A}', 'A Ürünü', 'a-urunu', 'active', 'native', '{}'::jsonb),
      ('${B}', 'B Ürünü', 'b-urunu', 'active', 'native', '{}'::jsonb);

    insert into public.arc_product_variants (organization_id, product_id, sku, title, price, currency, stock, allow_backorder, attributes)
      select p.organization_id, p.id, upper(p.slug), 'Tek', 50000, 'TRY', 10, false, '{}'::jsonb
      from public.arc_products p where p.slug in ('a-urunu','b-urunu');

    insert into public.arc_discounts (organization_id, name, code, discount_type, value, minimum_subtotal, status, combinable, metadata) values
      ('${A}', 'A Kuponu', 'AKUPON', 'percentage', 10, 0, 'active', false, '{}'::jsonb),
      ('${B}', 'B Kuponu', 'BKUPON', 'percentage', 50, 0, 'active', false, '{}'::jsonb);
  `);
}

const kupon = async (host, kod) => {
  const { rows } = await db.query(
    `select valid, discount_amount from public.arc_storefront_coupon($1::text, $2::text, $3::bigint, null)`,
    [host, kod, 100000],
  );
  return rows[0];
};

/* Sepet kalemi SKU taşıyor (arc_create_storefront_order: v_item ->> 'sku'). */
const sku = async (slug) =>
  (await db.query(`select v.sku from public.arc_product_variants v join public.arc_products p on p.id = v.product_id where p.slug = $1`, [slug])).rows[0].sku;

describe("çok kiracılı vitrin — yazma yolu", () => {
  test("kendi kuponu geçerli, komşunun kuponu DEĞİL", async () => {
    /* Para tarafındaki sızıntı: komşunun indirimini kullanmak. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      assert.equal((await kupon("salona.com", "AKUPON")).valid, true);
      assert.equal((await kupon("salona.com", "BKUPON")).valid, false, "B'nin kuponu A'da geçmemeli");
      assert.equal((await kupon("salonb.com", "BKUPON")).valid, true);
      assert.equal((await kupon("salonb.com", "AKUPON")).valid, false);
    });
  });

  test("indirim tutarı doğru salonun oranıyla hesaplanıyor", async () => {
    /* A %10, B %50: adresler karışsa tutar da karışırdı. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      assert.equal(Number((await kupon("salona.com", "AKUPON")).discount_amount), 10000);
      assert.equal(Number((await kupon("salonb.com", "BKUPON")).discount_amount), 50000);
    });
  });

  test("tanınmayan adreste kupon geçersiz", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      assert.equal((await kupon("yok.com", "AKUPON")).valid, false);
    });
  });

  test("sipariş DOĞRU kuruma yazılıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const kod = await sku("a-urunu");
      const { rows } = await db.query(
        `select order_id, order_number from public.arc_storefront_create_order(
           $1::text, 'musteri@example.com', 'Ayşe Yılmaz', '05000000000',
           '{"city":"İstanbul"}'::jsonb,
           jsonb_build_array(jsonb_build_object('sku', $2::text, 'quantity', 1)),
           null)`,
        ["salona.com", kod],
      );
      assert.equal(rows.length, 1);
      const { rows: siparis } = await db.query(
        `select organization_id from public.arc_orders where id = $1`, [rows[0].order_id],
      );
      assert.equal(siparis[0].organization_id, A, "sipariş A'ya yazılmalı");
      /* Sipariş numarası öneki de o salonunki. */
      assert.match(rows[0].order_number, /^SA/);
    });
  });

  test("tanınmayan adres sipariş oluşturmuyor ve sebebi söylüyor", async () => {
    /*
      Eski mesaj "Organizasyon bulunamadı" derken sorun kurumda
      sanılıyordu; oysa sebep adresin bir mağazaya bağlı olmaması.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const kod = await sku("a-urunu");
      await db.exec("savepoint bekleniyor");
      try {
        await db.query(
          `select * from public.arc_storefront_create_order($1::text, 'x@example.com', 'X', '0500', '{}'::jsonb,
             jsonb_build_array(jsonb_build_object('sku', $2::text, 'quantity', 1)), null)`,
          ["yok.com", kod],
        );
        await db.exec("release savepoint bekleniyor");
        assert.fail("tanınmayan adreste sipariş oluştu");
      } catch (hata) {
        await db.exec("rollback to savepoint bekleniyor");
        assert.match(String(hata.message), /bir mağazaya bağlı değil/i);
      }
    });
  });

  test("kupon ve sipariş anon'a KAPALI", async () => {
    /* anon'a açık olsaydı sepet tarayıcıdan doğrudan siparişe bağlanırdı. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      for (const sql of [
        `select * from public.arc_storefront_coupon('salona.com', 'AKUPON', 1000, null)`,
        `select * from public.arc_storefront_create_order('salona.com','x@example.com','X','0500','{}'::jsonb,'[]'::jsonb,null)`,
      ]) {
        await db.exec("savepoint bekleniyor");
        try {
          await db.query(sql);
          await db.exec("release savepoint bekleniyor");
          assert.fail("anon çağırabildi: " + sql.slice(0, 40));
        } catch (hata) {
          await db.exec("rollback to savepoint bekleniyor");
          assert.match(String(hata.message), /permission denied/i);
        }
      }
    });
  });

  test("tedarikçi yeniden fiyatlama kuruma göre çalışıyor", async () => {
    /*
      Eskiden kurum sabitti: ikinci salonun tedarikçi fiyatları hiç
      güncellenmezdi. Parametre kazanıyor, verilmezse eski davranış.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        insert into public.arc_suppliers (organization_id, code, name, margin_percent, shipping_markup, round_to_kurus, active)
        values ('${B}', 'tarzyeri', 'Tarzyeri', 50, 0, 90, true);
        update public.arc_product_variants set supplier = 'tarzyeri', cost_price = 10000
         where organization_id = '${B}';
      `);
      await rol(db, "service_role");
      const { rows } = await db.query(`select public.arc_reprice_supplier($1::text, $2::uuid) as n`, ["tarzyeri", B]);
      assert.equal(Number(rows[0].n), 1, "B'nin varyantı yeniden fiyatlanmalı");
      const { rows: fiyat } = await db.query(`select price from public.arc_product_variants where organization_id = $1`, [B]);
      assert.ok(Number(fiyat[0].price) > 10000, "fiyat maliyetin üstüne çıkmalı");
    });
  });

  test("eski yazma fonksiyonları yerinde duruyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('check_arvoculture_coupon','create_arvoculture_storefront_order','create_arvoculture_return_request')`,
      );
      assert.equal(rows[0].n, 3, "canlı mağaza bu üçünü çağırmaya devam ediyor");
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      await rol(db, "service_role");
      assert.equal((await kupon("salona.com", "AKUPON")).valid, true);
    });
  });
});

/*
  KUSUR DÜZELTMESİ — GEÇERLİ KUPON HATA VERİYORDU.

  Çok kiracılı sarmalayıcıyı sınarken çıktı ve çok kiracılıkla ilgisi
  yok. arc_discounts.value bigint, fonksiyonun çıktı sütunu numeric;
  RETURN QUERY yapısal eşleşme istiyor ve örtük dönüşüm uygulamıyor.
  Reddeden dalların hepsi null::numeric yazdığı için onlar temiz
  dönüyordu — YALNIZCA "valid = true" dönen iki dal düşüyordu.

  Görünen sonuç: müşteri geçerli kupon kodunu giriyor, indirim
  uygulanmıyor. Beş dalın tamamı burada sabitleniyor, yoksa düzeltme
  ileride sessizce geri alınabilirdi.
*/
describe("kupon doğrulamasının bütün dalları", () => {
  const ORG = "00000000-0000-4000-8000-000000010001";
  const dal = async (kod, tutar) =>
    (await db.query(`select valid, value, discount_amount from public.arc_check_coupon($1::uuid, $2::text, $3::bigint, null)`, [ORG, kod, tutar])).rows[0];

  test("GEÇERLİ kupon artık hata vermiyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const sonuc = await dal("AKUPON", 100000);
      assert.equal(sonuc.valid, true);
      assert.equal(Number(sonuc.value), 10);
      assert.equal(Number(sonuc.discount_amount), 10000);
    });
  });

  test("alt limiti geçen kupon da dönüyor", async () => {
    /* İkinci "valid = true" dalı; ilkiyle aynı sebepten düşüyordu. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.arc_discounts set minimum_subtotal = 50000 where code = 'AKUPON'`);
      await rol(db, "service_role");
      assert.equal((await dal("AKUPON", 60000)).valid, true);
    });
  });

  test("reddeden dallar eskisi gibi çalışıyor", async () => {
    /* Düzeltme çalışan yolları bozmamalı. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.arc_discounts set minimum_subtotal = 500000 where code = 'AKUPON'`);
      await rol(db, "service_role");
      assert.equal((await dal("AKUPON", 1000)).valid, false, "alt limit altında");
      assert.equal((await dal("YOKKOD", 1000)).valid, false, "tanınmayan kod");
      const { rows } = await db.query(`select valid from public.arc_check_coupon(null::uuid, 'AKUPON', 1000, null)`);
      assert.equal(rows[0].valid, false, "kurumsuz çağrı");
    });
  });
});
