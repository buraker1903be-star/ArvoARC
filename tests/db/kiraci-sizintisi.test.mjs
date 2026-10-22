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
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

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
       free_shipping_threshold, bank_transfer_enabled, bank_transfer_discount_percent,
       legal_name, contact_email, bank_iban,
       /* Yurtdışı AÇIK: kargo fiyatı sorgusu kapalı modda her iki
          mağazada da 'mod' döndürür, yani kiracıyı ayırt etmez. */
       international_enabled, usd_rate) values
      ('${A}', 'Mağaza A', 'MA', '${A_HOST}', now(), 11100, 100000, true,  7,
       'A ŞİRKETİ LİMİTED', 'a@ornek.test', 'TR100000000000000000000001', true, 40),
      ('${B}', 'Mağaza B', 'MB', '${B_HOST}', now(), 22200, 200000, false, 3,
       'B ŞİRKETİ LİMİTED', 'b@ornek.test', 'TR100000000000000000000002', true, 40),
      -- C alan adını yazmış ama DOĞRULAMAMIŞ: mağazası açılmamalı.
      ('${C}', 'Mağaza C', 'MC', '${C_HOST}', null,  33300, 300000, true,  5,
       'C ŞİRKETİ LİMİTED', 'c@ornek.test', 'TR100000000000000000000003', false, null);

    /* Tanıtım sayfası metni: kiracının kendi anlatısı. A'nın
       "hakkımızda"sı B'nin vitrininde görünmemeli. */
    insert into public.arc_store_pages (organization_id, page_key, title, body) values
      ('${A}', 'hakkimizda', 'A Hakkında', 'A mağazasının anlatısı.'),
      ('${B}', 'hakkimizda', 'B Hakkında', 'B mağazasının anlatısı.');

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

    -- Yurtdışı kargo tarifesi: iki mağazanın ücreti AYRI.
    insert into public.arc_shipping_zones (organization_id, label, countries, fee_cents, free_over_cents, sira) values
      ('${A}', 'A Bölgesi', '{}', 2500, 0, 0),
      ('${B}', 'B Bölgesi', '{}', 3900, 0, 0);

    /*
      Yurtdışına gönderilemeyen ürün işareti MEVCUT ürünlere konuyor,
      yeni ürün eklenmiyor: tohuma ikinci bir ürün koymak ürün
      listelerinin beklediği tek satırı ikiye çıkarıyor ve plandaki
      öteki on iki satırı düşürüyordu. İşaret listelemeyi
      etkilemiyor — süzgeç vitrinde, yurtdışı modunda.
    */
    update public.arc_products set international_blocked = true
     where organization_id in ('${A}', '${B}');

    -- İngilizce ad: her mağazanın KENDİ çevirisi.
    update public.arc_products set name_en = 'A Product' where organization_id = '${A}';
    update public.arc_products set name_en = 'B Product' where organization_id = '${B}';
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
  /*
    Birincil adres: her mağaza KENDİ adresini duymalı. Yanlış
    eşleşme, A'nın sayfalarının B'nin adresini kanonik ilan etmesi
    demek olurdu — arama motoruna "bu sayfalar aslında ötekinin"
    diyen bir etiket.
  */
  { ad: "arc_storefront_primary_host", kip: "deger", alan: "adres",
    sql: "select public.arc_storefront_primary_host($1::text) as adres", a: A_HOST, b: B_HOST },
  { ad: "arc_storefront_product_count", kip: "deger", alan: "adet",
    sql: "select public.arc_storefront_product_count($1::text) as adet", a: 1, b: 1 },
  { ad: "arc_storefront_settings", kip: "deger", alan: "shipping_fee",
    sql: "select shipping_fee from public.arc_storefront_settings($1::text)", a: 11100, b: 22200 },
  /*
    Kargo tarifesi: A'nın adresinden B'nin ücreti görünürse yurtdışı
    siparişi YANLIŞ tutarla hesaplanır — sipariş fonksiyonu bu
    tarifeyi kuruşa çeviriyor.
  */
  /*
    Engelli ürün listesi: A'nın adresinden B'nin ürünü görünürse o
    kart B'nin vitrininde değil A'nın vitrininde gizlenirdi.
  */
  /*
    KARGO FİYATI yalnızca service_role'a açık: vitrin onu SUNUCU
    tarafından çağırıyor. A'nın adresinden B'nin tarifesi hesaplanırsa
    müşteri yanlış kargo görür ve öder.
  */
  /*
    İngilizce ad: A'nın adresinden B'nin çevirisi görünürse yabancı
    müşteri komşunun ürün adını okur.
  */
  { ad: "arc_storefront_translations", kip: "deger", alan: "name_en",
    sql: "select name_en from public.arc_storefront_translations($1::text, array['a-urun','b-urun']::text[])",
    a: "A Product", b: "B Product" },
  { ad: "arc_storefront_shipping_quote", kip: "deger", alan: "fee_cents", rol: "service_role",
    sql: "select fee_cents from public.arc_storefront_shipping_quote($1::text, 'DE', '[{\"sku\":\"A-1\",\"quantity\":1}]'::jsonb)",
    a: 2500, b: 3900 },
  { ad: "arc_storefront_blocked_products", kip: "satir", alan: "slug",
    sql: "select slug from public.arc_storefront_blocked_products($1::text)",
    a: "a-urun", b: "b-urun" },
  { ad: "arc_storefront_shipping_zones", kip: "deger", alan: "fee_cents",
    sql: "select fee_cents from public.arc_storefront_shipping_zones($1::text)", a: 2500, b: 3900 },
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
  /*
    Tanıtım sayfası metni: A'nın "hakkımızda"sı B'nin vitrininde
    görünürse müşteriye BAŞKA bir markanın hikâyesi anlatılmış olur.
  */
  { ad: "arc_storefront_pages", kip: "deger", alan: "baslik",
    sql: "select public.arc_storefront_pages($1::text) -> 'hakkimizda' ->> 'baslik' as baslik",
    a: "A Hakkında", b: "B Hakkında" },
  /*
    SATICI KİMLİĞİ: bu sızıntının bedeli en yüksek olanı. Yanlış
    unvan, mesafeli satış sözleşmesinde yanlış tarafı göstermek
    demek — müşteri kiminle sözleşme yaptığını buradan okuyor.
  */
  { ad: "arc_storefront_seller", kip: "deger", alan: "legal_name",
    sql: "select legal_name from public.arc_storefront_seller($1::text)",
    a: "A ŞİRKETİ LİMİTED", b: "B ŞİRKETİ LİMİTED" },
  /*
    IBAN: bu ailenin en pahalı sızıntısı. Yanlış IBAN, müşterinin
    parayı BAŞKA bir mağazanın hesabına göndermesi demek — sipariş
    "ödeme bekliyor"da kalır, para üçüncü bir yerdedir ve hiçbir
    yerde hata görünmez. Ödeme adımı bu değeri koddan okuyordu
    (SELLER.iban, üstelik istemci paketinde).
  */
  { ad: "arc_storefront_seller", kip: "deger", alan: "bank_iban",
    sql: "select bank_iban from public.arc_storefront_seller($1::text)",
    a: "TR100000000000000000000001", b: "TR100000000000000000000002" },
];

/*
  YAZAN FONKSİYONLAR ayrı sınanıyor: yan etkileri var ve oturum
  gerektiriyorlar. Aşağıdaki iki test onları kapsıyor.
*/
const YAZANLAR = new Set([
  "arc_storefront_create_order",
  "arc_storefront_return_request",
  /* Ziyaret sayacı: adresten kurumu çözüyor ve yalnızca YAZIYOR,
     hiçbir şey döndürmüyor — plandaki "A'nın adresi yalnızca A'yı
     getiriyor" kalıbına okunacak bir çıktısı yok. Kiracı ayrımı
     kendi dosyasında sınanıyor (canli-ziyaret.test.mjs:
     "bilinmeyen adres hiçbir şey yazmıyor"). */
  "arc_storefront_visit",
]);

/*
  ANAHTARLA ÇALIŞANLAR: kiracıyı ADRESTEN değil, müşterinin
  bağlantısındaki anahtardan çözüyorlar. Plandaki "A'nın adresi
  yalnızca A'yı getiriyor" kalıbı bunlara uymuyor — adres hiç
  sorulmuyor. Ayrı senaryolarla sınanıyorlar; sızıntı sorusu burada
  "A'nın anahtarı B'nin siparişini açabiliyor mu" biçimini alıyor.
*/
const ANAHTARLILAR = new Set(["arc_storefront_order_status"]);

/*
  OTURUMLU OKUMALAR: müşterinin kendi hesap alanı. Plandaki "A'nın
  adresi yalnızca A'yı getiriyor" kalıbına uymuyorlar çünkü oturum
  da gerekiyor — süzgeç auth.uid() VE adres. Ayrı senaryolarla
  sınanıyorlar; sızıntı sorusu burada "A'dan alışveriş yapmış
  müşteri B'nin vitrininde ne görüyor" biçimini alıyor.
*/
const OTURUMLULAR = new Set([
  "arc_storefront_my_orders",
  "arc_storefront_my_returns",
  "arc_storefront_my_gift_cards",
]);

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
    /*
      DÖKÜM + MİGRATION'LAR. Döküm canlıdan alınıyor ve migration SQL
      Editor'den elle uygulandığı için HEP BİRAZ GERİDE: yeni bir
      fonksiyonu plana yazmak, döküm yenilenene kadar aşağıdaki ters
      yön kontrolünü düşürüyordu ("şemada olmayan plan satırı").
      Oysa fonksiyon var — testin kendisi onu çağırıp sınıyor, çünkü
      PGlite ortamı dökümün ardından migration'ları da kuruyor
      (tests/db/ortam.mjs). Kod kataloğun ilerisinde olmak bu depoda
      olağan akış; check:schema de gecikmeyi hatadan aynı şekilde
      ayırıyor.
    */
    const migrationlar = fs
      .readdirSync(path.resolve(import.meta.dirname, "../../supabase/migrations"))
      .filter((ad) => ad.endsWith(".sql"))
      .map((ad) =>
        fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", ad), "utf8"),
      )
      .join("\n");

    const ADLAR = /create or replace function public\.(arc_storefront_[a-z_]+)\s*\(/gi;
    const semadakiler = new Set([
      ...[...sema.matchAll(ADLAR)].map((m) => m[1]),
      ...[...migrationlar.matchAll(ADLAR)].map((m) => m[1]),
    ]);
    const planda = new Set([...PLAN.map((satir) => satir.ad), ...YAZANLAR, ...ANAHTARLILAR, ...OTURUMLULAR]);
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

  test("çekirdek fonksiyonlar anon'a kapalı", async () => {
    /*
      Gövdeler `arc_vitrin_*(p_organization_id, …)` içinde tek kez
      duruyor ve iki aile ince sarmalayıcı (20261017141416). Çekirdek
      kurum kimliğini PARAMETRE aldığı için anon'a açılırsa
      tarayıcıdan başka bir mağazanın kimliği geçilip verisi
      okunabilir — kiracı çözümü atlanmış olur. Bu test o kapıyı
      kapalı tutuyor ve yeni çekirdek eklendikçe kendiliğinden
      kapsıyor.
    */
    /*
      Liste VERİTABANINDAN okunuyor, anlık görüntü dosyasından değil:
      harness migration'ları görüntünün üstüne uyguluyor, yani yeni
      bir çekirdek görüntü eşitlenmeden önce de kapsanıyor.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      const cekirdekler = (
        await db.query(`
          select p.proname as ad, has_function_privilege('anon', p.oid, 'EXECUTE') as acik
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'arc_vitrin_%'
        `)
      ).rows;
      assert.ok(cekirdekler.length > 0, "çekirdek aile boş: desen kaybolmuş olabilir");
      for (const { ad, acik } of cekirdekler) {
        assert.equal(acik, false, `${ad} anon'a açık: kiracı çözümü atlanabilir`);
      }
    });
  });

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
           $1::text, 'm@example.com', 'Müşteri Adı', '+905551112233', '{}'::jsonb, '[]'::jsonb)`,
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

  test("tedarikçi varyantında stoktan fazla adet sipariş edilemiyor", async () => {
    /*
      Miktar denetimi "stok yetmiyor VE stoksuz satış kapalı" diyordu
      ve tedarikçi varyantında ikinci koşul hiç sağlanmıyor:
      allow_backorder sütununun varsayılanı true, içe aktarım o alanı
      yazmıyor. Stoğu 3 olan varyanta 5 adet geçiyordu
      (20261017144835). Kendi ürünümüzde kural değişmedi.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        update public.arc_product_variants
           set stock = 3, allow_backorder = true, supplier = 'LR'
         where sku = 'A-1' and organization_id = '${A}';
        insert into public.arc_suppliers
          (id, organization_id, code, name, active, margin_percent, shipping_markup, round_to_kurus,
           publish_directly, created_at, updated_at, sync_cursor, sync_total, service_fee, stock_buffer) values
          (gen_random_uuid(), '${A}', 'LR', 'LR', true, 0, 0, 1, true, now(), now(), 0, 0, 0, 0);
      `);
      await rol(db, "service_role");
      const siparis = (adet) =>
        db.query(
          `select order_id from public.arc_storefront_create_order(
             $1::text, 'm@example.com', 'Müşteri Adı', '+905551112233',
             '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
             $2::jsonb)`,
          [A_HOST, JSON.stringify([{ sku: "A-1", quantity: adet, name: "A Ürünü" }])],
        );

      await db.exec("savepoint fazla");
      await assert.rejects(() => siparis(5), /Yetersiz stok/);
      await db.exec("rollback to savepoint fazla");

      /* Stok kadarı geçmeli: kural "fazlası olmaz", "hiç olmaz" değil. */
      const { rows } = await siparis(3);
      assert.ok(rows[0].order_id, "stok kadarı sipariş edilebilmeli");
    });
  });

  test("kendi ürünümüzde stoksuz satış kuralı korunuyor", async () => {
    /* Tedarikçisi olmayan varyantta stoksuz satış açıksa stoktan
       fazlası satılabilir; bu mağazanın bilinçli tercihi. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        update public.arc_product_variants
           set stock = 1, allow_backorder = true, supplier = null
         where sku = 'A-1' and organization_id = '${A}';
      `);
      await rol(db, "service_role");
      const { rows } = await db.query(
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'm@example.com', 'Müşteri Adı', '+905551112233',
           '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
           '[{"sku":"A-1","quantity":4,"name":"A Ürünü"}]'::jsonb)`,
        [A_HOST],
      );
      assert.ok(rows[0].order_id);
    });
  });

  test("sipariş durumu yalnızca kendi anahtarıyla açılıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const { rows: a } = await db.query(
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'a@example.com', 'A Müşterisi', '+905551112233',
           '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
           '[{"sku":"A-1","quantity":1,"name":"A Ürünü"}]'::jsonb)`,
        [A_HOST],
      );
      const { rows: b } = await db.query(
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'b@example.com', 'B Müşterisi', '+905551112244',
           '{"line":"Adres","city":"İzmir","district":"Konak","country":"TR"}'::jsonb,
           '[{"sku":"B-1","quantity":1,"name":"B Ürünü"}]'::jsonb)`,
        [B_HOST],
      );

      await rol(db, "postgres");
      const anahtar = async (id) =>
        (await db.query(`select public_token from public.arc_orders where id = $1`, [id]))
          .rows[0].public_token;
      const aAnahtar = await anahtar(a[0].order_id);
      const bAnahtar = await anahtar(b[0].order_id);

      /* Vitrin bu çağrıyı tarayıcıdaki anon anahtarıyla yapıyor. */
      await rol(db, "anon");

      const oku = async (token) =>
        (await db.query(`select public.arc_storefront_order_status($1::text) as s`, [token]))
          .rows[0].s;

      const aSonuc = await oku(aAnahtar);
      const bSonuc = await oku(bAnahtar);
      assert.ok(aSonuc, "A kendi anahtarıyla siparişini görmeli");
      assert.ok(bSonuc, "B kendi anahtarıyla siparişini görmeli");

      /*
        ASIL SORU: A'nın anahtarı B'nin verisini taşıyor mu. Kalem
        adlarına bakmak yeterli — iki mağazanın ürünleri ayrı.
      */
      assert.ok(
        !JSON.stringify(aSonuc).includes("B Ürünü"),
        "A'nın anahtarından B'nin ürünü görünmemeli",
      );
      assert.ok(
        !JSON.stringify(bSonuc).includes("A Ürünü"),
        "B'nin anahtarından A'nın ürünü görünmemeli",
      );
      assert.notEqual(aSonuc.siparis_no, bSonuc.siparis_no);
    });
  });

  test("sipariş durumu kişisel veri döndürmüyor", async () => {
    /*
      Bağlantı WhatsApp'tan gidiyor ve İLETİLEBİLİYOR. Adres, e-posta
      ve telefon "siparişim nerede" sorusu için gerekmiyor; eline
      geçen biri için kişisel veri olurlar.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const { rows } = await db.query(
        `select order_id from public.arc_storefront_create_order(
           $1::text, 'gizli@example.com', 'A Müşterisi', '+905551112233',
           '{"line":"Gizli Sokak 5","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
           '[{"sku":"A-1","quantity":1,"name":"A Ürünü"}]'::jsonb)`,
        [A_HOST],
      );
      await rol(db, "postgres");
      const { rows: tok } = await db.query(
        `select public_token from public.arc_orders where id = $1`,
        [rows[0].order_id],
      );
      await rol(db, "anon");
      const { rows: sonuc } = await db.query(
        `select public.arc_storefront_order_status($1::text) as s`,
        [tok[0].public_token],
      );
      const metin = JSON.stringify(sonuc[0].s);
      for (const sizinti of ["gizli@example.com", "905551112233", "Gizli Sokak"]) {
        assert.ok(!metin.includes(sizinti), `sayfa ${sizinti} döndürmemeli`);
      }
    });
  });

  test("tanınmayan ve bozuk anahtar boş dönüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      for (const kotu of ["0".repeat(32), "abc", "", "ABCDEF0123456789ABCDEF0123456789"]) {
        const { rows } = await db.query(
          `select public.arc_storefront_order_status($1::text) as s`,
          [kotu],
        );
        assert.equal(rows[0].s, null, `"${kotu}" için null dönmeli`);
      }
    });
  });

  test("müşterinin siparişleri yalnızca alışveriş yaptığı mağazada görünüyor", async () => {
    /*
      ASIL SORU. Eski fonksiyon (get_arvoculture_my_orders) KURUMLA
      HİÇ SÜZMÜYORDU, yalnızca auth.uid() ile: iki mağazadan alışveriş
      yapan müşteri, B'nin vitrininde A'dan verdiği siparişleri de
      görürdü. Kendi verisi ama yanlış yerde — B'nin vitrini başka bir
      mağazanın sipariş numaralarını ve ürün adlarını gösteriyordu.
    */
    await islem(db, async () => {
      await tohum();
      const musteri = "00000000-0000-4000-8000-0000000000a1";
      await rol(db, "postgres");
      await db.query(
        `insert into auth.users (id, email) values ($1, 'musteri@example.com')
         on conflict (id) do nothing`,
        [musteri],
      );

      await rol(db, "service_role");
      for (const [host, sku, ad] of [[A_HOST, "A-1", "A Ürünü"], [B_HOST, "B-1", "B Ürünü"]]) {
        const { rows } = await db.query(
          `select order_id from public.arc_storefront_create_order(
             $1::text, 'musteri@example.com', 'Müşteri', '+905551112233',
             '{"line":"Adres","city":"İstanbul","district":"Kadıköy","country":"TR"}'::jsonb,
             $2::jsonb)`,
          [host, JSON.stringify([{ sku, quantity: 1, name: ad }])],
        );
        /* Sipariş misafir olarak açılıyor; hesaba bağlanması ayrı bir adım. */
        await rol(db, "postgres");
        await db.query(`update public.arc_orders set user_id = $1 where id = $2`, [musteri, rows[0].order_id]);
        await rol(db, "service_role");
      }

      await rol(db, "authenticated", musteri);
      const oku = async (host) =>
        (await db.query(`select order_number from public.arc_storefront_my_orders($1::text)`, [host])).rows;

      const a = await oku(A_HOST);
      const b = await oku(B_HOST);
      assert.equal(a.length, 1, "A'nın vitrininde A'nın siparişi görünmeli");
      assert.equal(b.length, 1, "B'nin vitrininde B'nin siparişi görünmeli");
      assert.notEqual(a[0].order_number, b[0].order_number);
      /* Mağaza öneki hangi mağazanın siparişi olduğunu söylüyor. */
      assert.ok(a[0].order_number.startsWith("MA"), `A'da MA ile başlamalı: ${a[0].order_number}`);
      assert.ok(b[0].order_number.startsWith("MB"), `B'de MB ile başlamalı: ${b[0].order_number}`);
    });
  });

  test("oturumsuz çağrı hiç sipariş döndürmüyor", async () => {
    await islem(db, async () => {
      await tohum();
      /* Vitrin bu çağrıyı tarayıcıdan yapıyor; oturum yoksa boş dönmeli. */
      await rol(db, "anon");
      await reddedilir(
        db,
        `select * from public.arc_storefront_my_orders($1::text)`,
        [A_HOST],
        /permission denied/i,
      );
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
