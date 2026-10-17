/*
  KİRACI SIZINTISI — BÜTÜN VİTRİN AİLESİ, TEK TEK.

  vitrin-kiraci.test.mjs kiracı çözümünü ve dört fonksiyonu sınıyor.
  Bu dosya ailenin TAMAMINI sınıyor ve en önemlisi: yeni bir
  `arc_storefront_*` fonksiyonu eklenip buraya yazılmazsa test
  DÜŞÜYOR. Böylece kapsam insan hafızasına kalmıyor.

  Neden bu kadar önemli: çok kiracılı bir sistemde en pahalı kusur,
  bir mağazanın adresinden ötekinin ürününün, kuponunun, siparişinin
  ya da kargo tarifesinin görünmesi. Müşteri şikâyeti değil, güven
  kaybı ve veri sızması olur.

  17.10.2026'da bu ailede üç ayrışma bulundu (arama dizini ve sitemap
  sayfalaması, varyant sınırı): ikisi ArvoCulture'da düzeltilip
  buraya taşınmamıştı. Ayrışmayı `npm run check:ikizler` yakalıyor;
  bu dosya ise ayrışmanın öteki yüzünü, KAPSAMI tutuyor.

  Her ölçüm iki kiracıyla: A'nın adresi yalnızca A'yı getirmeli, B'nin
  tek bir satırı bile görünmemeli. Üçüncü kiracı (C) alan adını
  doğrulamamış: mağazası hiç açılmamalı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const A = "00000000-0000-4000-8000-00000000e001";
const B = "00000000-0000-4000-8000-00000000e002";
const C = "00000000-0000-4000-8000-00000000e003";
const A_HOST = "magaza-a.example";
const B_HOST = "magaza-b.example";
const C_HOST = "magaza-c.example"; // doğrulanmamış
const YOK_HOST = "hicbiryer.example";

let db;
before(async () => {
  db = await veritabani();
});

/*
  TOHUM. Her kiracıda aynı YAPIDA veri var; ayırt edici olan değerler:
  slug ve SKU öneki (a-/b-), kupon kodu, kargo ücreti, marka adı,
  beden. Böylece "A'nın adresinden B'nin değeri geldi mi" sorusu her
  fonksiyon için aynı biçimde sorulabiliyor.
*/
async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${A}', 'Mağaza A', 'magaza-a', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${B}', 'Mağaza B', 'magaza-b', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${C}', 'Mağaza C', 'magaza-c', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_store_settings
      (organization_id, store_name, order_prefix, custom_domain, domain_verified_at, shipping_fee,
       free_shipping_threshold, bank_transfer_enabled, bank_transfer_discount_percent) values
      ('${A}', 'Mağaza A', 'MA', '${A_HOST}', now(), 11100, 100000, true,  7),
      ('${B}', 'Mağaza B', 'MB', '${B_HOST}', now(), 22200, 200000, false, 3),
      -- C alan adını yazmış ama DOĞRULAMAMIŞ: mağazası açılmamalı.
      ('${C}', 'Mağaza C', 'MC', '${C_HOST}', null,  33300, 300000, true,  5);

    insert into public.arc_products (organization_id, name, slug, status, source, metadata) values
      ('${A}', 'A Ürünü', 'a-urun', 'active', 'native', '{"vendor":"A MARKA","product_type":"Tişört","badge":"A rozeti"}'::jsonb),
      ('${B}', 'B Ürünü', 'b-urun', 'active', 'native', '{"vendor":"B MARKA","product_type":"Tişört","badge":"B rozeti"}'::jsonb),
      ('${C}', 'C Ürünü', 'c-urun', 'active', 'native', '{"vendor":"C MARKA"}'::jsonb);

    /* İndirimli ve stokta: fırsatlar listesi de dolsun. */
    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, compare_at_price, currency, stock, allow_backorder, attributes)
      select p.organization_id, p.id,
             upper(left(p.slug, 1)) || '-1',
             'Siyah / ' || case left(p.slug, 1) when 'a' then 'M' when 'b' then 'XL' else 'S' end,
             10000, 20000, 'TRY', 50, false, '{}'::jsonb
        from public.arc_products p where p.slug in ('a-urun','b-urun','c-urun');

    insert into public.arc_collections
      (id, organization_id, title, slug, description, status, source, seo_title, seo_description, metadata, created_at, updated_at) values
      (gen_random_uuid(), '${A}', 'A Rafı', 'a-raf', '', 'active', 'native', '', '', '{"menu_group":"A Grubu"}'::jsonb, now(), now()),
      (gen_random_uuid(), '${B}', 'B Rafı', 'b-raf', '', 'active', 'native', '', '', '{"menu_group":"B Grubu"}'::jsonb, now(), now());

    insert into public.arc_collection_products (organization_id, collection_id, product_id, "position", created_at)
      select c.organization_id, c.id, p.id, 1, now()
        from public.arc_collections c
        join public.arc_products p on p.organization_id = c.organization_id
       where c.slug in ('a-raf','b-raf');

    insert into public.arc_discounts (organization_id, name, code, discount_type, value, status, combinable, metadata) values
      ('${A}', 'A Kuponu', 'AKOD', 'percentage', 10, 'active', false, '{}'::jsonb),
      ('${B}', 'B Kuponu', 'BKOD', 'percentage', 20, 'active', false, '{}'::jsonb);
  `);
}

/* Tek sütunu dizi olarak döndürür. */
const sutun = async (sql, parametreler, alan) =>
  (await db.query(sql, parametreler)).rows.map((satir) => satir[alan]);

/*
  ÖLÇÜM PLANI. Her satır bir fonksiyon: çağrısı, kiracıyı ayırt eden
  alan ve A ile B'nin beklenen değerleri.

  `kip`:
   - "satir": satır döndürür; A'nın adresinden gelen her satır A'ya
     ait olmalı, B'nin değeri HİÇ görünmemeli, doğrulanmamış ve
     tanınmayan adres boş dönmeli.
   - "deger": tek değer döndürür; A'nın adresinde A'nın değeri,
     B'nin adresinde B'nin değeri gelmeli.
*/
const PLAN = [
  { ad: "arc_storefront_products", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_products($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_products_page", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_products_page($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_product", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_product($1::text, 'a-urun')", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_product_slugs", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_product_slugs($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_product_badges", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_product_badges($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_search_index", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_search_index($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_deals", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_deals($1::text)", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_variants", kip: "satir", alan: "sku",
    sql: "select sku from public.arc_storefront_variants($1::text, 'a-urun')", a: "A-1", b: "B-1" },
  { ad: "arc_storefront_collections", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_collections($1::text)", a: "a-raf", b: "b-raf" },
  { ad: "arc_storefront_collection_products", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_collection_products($1::text, 'a-raf')", a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_collection_products_page", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_collection_products_page($1::text, array['a-raf']::text[])",
    a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_discounts", kip: "satir", alan: "code",
    sql: "select code from public.arc_storefront_discounts($1::text)", a: "AKOD", b: "BKOD" },

  { ad: "arc_storefront_org", kip: "deger", alan: "id",
    sql: "select public.arc_storefront_org($1::text) as id", a: A, b: B },
  { ad: "arc_storefront_product_count", kip: "deger", alan: "adet",
    sql: "select public.arc_storefront_product_count($1::text) as adet", a: 1, b: 1 },
  { ad: "arc_storefront_settings", kip: "deger", alan: "shipping_fee",
    sql: "select shipping_fee from public.arc_storefront_settings($1::text)", a: 11100, b: 22200 },
  { ad: "arc_storefront_payment_methods", kip: "deger", alan: "bank_transfer_discount_percent",
    sql: "select bank_transfer_discount_percent from public.arc_storefront_payment_methods($1::text)", a: 7, b: 3 },
  { ad: "arc_storefront_facets", kip: "deger", alan: "brands",
    sql: "select brands from public.arc_storefront_facets($1::text)", a: "A MARKA", b: "B MARKA" },
  { ad: "arc_storefront_collection_facets", kip: "deger", alan: "brands",
    sql: "select brands from public.arc_storefront_collection_facets($1::text, array['a-raf']::text[])",
    /* B'nin adresinde 'a-raf' diye bir koleksiyon yok: marka listesi boş. */
    a: "A MARKA", b: "" },
  /*
    KUPON yalnızca service_role'a açık: vitrin onu sunucu tarafından
    çağırıyor. Tarayıcıdaki anon anahtarıyla çağrılamaması bilinçli
    ve aşağıda ayrıca sınanıyor.
  */
  { ad: "arc_storefront_coupon", kip: "deger", alan: "valid", rol: "service_role",
    sql: "select valid from public.arc_storefront_coupon($1::text, 'AKOD', 100000)", a: true, b: false },
];

/*
  YAZAN FONKSİYONLAR ayrı sınanıyor: yan etkileri var ve oturum
  gerektiriyorlar. Aşağıdaki iki test onları kapsıyor.
*/
const YAZANLAR = new Set(["arc_storefront_create_order", "arc_storefront_return_request"]);

describe("kiracı sızıntısı", () => {
  test("plan ailenin TAMAMINI kapsıyor", () => {
    /*
      Yeni bir arc_storefront_* fonksiyonu eklenip buraya
      yazılmazsa bu test düşer. Kapsamın insan hafızasına kalmaması
      için.
    */
    const sema = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/schema/canli-sema.sql"),
      "utf8",
    );
    const semadakiler = new Set(
      [...sema.matchAll(/CREATE OR REPLACE FUNCTION public\.(arc_storefront_[a-z_]+)\(/g)].map((m) => m[1]),
    );
    const planda = new Set([...PLAN.map((satir) => satir.ad), ...YAZANLAR]);
    const eksik = [...semadakiler].filter((ad) => !planda.has(ad)).sort();
    assert.deepEqual(eksik, [], `plana eklenmemiş fonksiyon: ${eksik.join(", ")}`);
    /* Ters yön: plandaki ad şemada yoksa plan bayatlamış. */
    const fazla = [...planda].filter((ad) => !semadakiler.has(ad)).sort();
    assert.deepEqual(fazla, [], `şemada olmayan plan satırı: ${fazla.join(", ")}`);
  });

  for (const satir of PLAN) {
    test(`${satir.ad}: A'nın adresi yalnızca A'yı getiriyor`, async () => {
      await islem(db, async () => {
        await tohum();
        await rol(db, satir.rol ?? "anon");

        if (satir.kip === "satir") {
          const aDegerleri = await sutun(satir.sql, [A_HOST], satir.alan);
          assert.ok(aDegerleri.length > 0, "A kendi verisini görmeli — tohum ya da çağrı eksik");
          assert.deepEqual([...new Set(aDegerleri)], [satir.a]);
          assert.ok(!aDegerleri.includes(satir.b), "B'nin verisi A'nın adresinde göründü");

          /* Doğrulanmamış ve tanınmayan adres: mağaza hiç açılmıyor. */
          assert.deepEqual(await sutun(satir.sql, [C_HOST], satir.alan), []);
          assert.deepEqual(await sutun(satir.sql, [YOK_HOST], satir.alan), []);
          return;
        }

        const [aDeger] = await sutun(satir.sql, [A_HOST], satir.alan);
        const [bDeger] = await sutun(satir.sql, [B_HOST], satir.alan);
        assert.equal(String(aDeger), String(satir.a));
        assert.equal(String(bDeger), String(satir.b));
      });
    });
  }

  test("arc_storefront_create_order siparişi adresin mağazasına yazıyor", async () => {
    await islem(db, async () => {
      await tohum();
      /* Sipariş oluşturma yalnızca service_role'a açık: vitrin onu
         sunucu tarafından çağırıyor (ödeme uçları). */
      await rol(db, "service_role");
      const { rows } = await db.query(
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'musteri@example.com', 'Müşteri', '+905551112233',
           '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
           '[{"sku":"A-1","quantity":1,"name":"A Ürünü"}]'::jsonb)`,
        [A_HOST],
      );
      await rol(db, "postgres");
      const { rows: siparis } = await db.query(
        `select organization_id from public.arc_orders where id = $1`,
        [rows[0].order_id],
      );
      assert.equal(siparis[0].organization_id, A, "sipariş adresin mağazasına yazılmalı");
    });
  });

  test("arc_storefront_create_order komşunun SKU'suyla sipariş açmıyor", async () => {
    /* A'nın adresinden B'nin SKU'su istenirse sipariş oluşmamalı:
       aksi hâlde bir mağaza ötekinin stoğunu düşürebilirdi. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await assert.rejects(
        () =>
          db.query(
            `select order_id from public.arc_storefront_create_order(
               $1::text, 'musteri@example.com', 'Müşteri', '+905551112233',
               '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
               '[{"sku":"B-1","quantity":1,"name":"B Ürünü"}]'::jsonb)`,
            [A_HOST],
          ),
        /.*/,
      );
    });
  });

  test("tarayıcıdaki anon anahtarı sipariş açamıyor, kupon sorgulayamıyor", async () => {
    /*
      Bu iki fonksiyon yalnızca service_role'a açık ve öyle kalmalı.
      Anon'a açılırsa tarayıcıdan doğrudan sipariş oluşturulabilir
      ve vitrinin sunucu tarafındaki denetimleri (stok, kupon
      sınırı, tutar) atlanır. Kupon da kullanım sayısını sızdırır.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      for (const sql of [
        `select valid from public.arc_storefront_coupon($1::text, 'AKOD', 100000)`,
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'm@example.com', 'M', '+905551112233', '{}'::jsonb, '[]'::jsonb)`,
      ]) {
        /* Her deneme kendi kaydetme noktasında: ilk hata işlemi
           iptal edince ikinci sorgu "transaction is aborted" derdi
           ve test yetkiyi değil o mesajı ölçerdi. */
        await db.exec("savepoint deneme");
        await assert.rejects(() => db.query(sql, [A_HOST]), /permission denied/);
        await db.exec("rollback to savepoint deneme");
      }
    });
  });

  test("arc_storefront_return_request oturum olmadan açılmıyor", async () => {
    /* Oturum yoksa talep hiç açılmamalı; sipariş numarasını bilen
       biri başkasının siparişine iade açamaz. */
    await islem(db, async () => {
      await tohum();
      /* İade talebi authenticated'a açık; oturum (auth.uid) yoksa
         fonksiyonun kendisi reddetmeli. */
      await rol(db, "authenticated");
      await assert.rejects(
        () =>
          db.query(
            `select public.arc_storefront_return_request($1::text, 'MA-1', '[]'::jsonb, 'Beğenmedim')`,
            [A_HOST],
          ),
        /Oturum/,
      );
    });
  });
});
