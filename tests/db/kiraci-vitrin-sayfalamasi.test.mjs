// Kiracı vitrini de sayfalanıyor (20261017122520).
//
// arc_storefront_product_slugs ve arc_storefront_search_index,
// ArvoCulture'a özel ikizleri 29–30.09.2026'da düzeltilirken dışarıda
// kalmıştı: `limit 20000` diyorlar ama PostgREST tek istekte en çok
// 1000 satır döndürüyor ve p_offset olmadığı için ikinci sayfa
// istenemiyor. Kesilme sessizdi — arama dizini "en son dokunulan 1000
// ürün"e dönüşüyor, müşteri satın alabildiği ürünü bulamıyordu.
//
// Test iki şeyi kilitliyor: imza p_offset alıyor ve sayfalar GERÇEKTEN
// ilerliyor (ilk onarımda her sayfa aynı ilk 1000 satırı döndürmüş,
// dizin 50 kat tekrarlanmıştı). Sayfa sınırını 1000'in altında
// sınayabilmek için p_limit küçük veriliyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "bbbbbbbb-0000-0000-0000-000000000001";
const HOST = "kiraci-vitrin.example";
const ADET = 7;

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'Kiracı', 'kiraci-vitrin', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    /* Kiracı vitrini alan adından çözülüyor (arc_storefront_org):
       doğrulanmamış alan adı mağazayı açmıyor, bu yüzden
       domain_verified_at yazılıyor. order_prefix kiracılar arası
       tekil. */
    insert into public.arc_store_settings
      (organization_id, store_name, order_prefix, custom_domain, domain_verified_at, storefront_url) values
      ('${KURUM}', 'Kiracı', 'KV', '${HOST}', now(), 'https://${HOST}');
  `);
  /* Aynı saniyeye düşen updated_at sıralamayı belirsiz bırakırdı;
     ikizlerdeki `order by p.updated_at desc, p.slug` tam bunun için
     var. Yine de farklı damgalarla kuruyoruz ki test ne ölçtüğünü
     bilsin. */
  for (let i = 0; i < ADET; i += 1) {
    await db.exec(`
      insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
        (gen_random_uuid(), '${KURUM}', 'Ürün ${i}', 'urun-${i}', '', 'active', 'native', now(), now() - interval '${i} minute', '{}'::jsonb);
      insert into public.arc_product_variants
        (id, organization_id, product_id, sku, title, price, currency, stock, attributes, created_at, updated_at, allow_backorder) values
        (gen_random_uuid(), '${KURUM}', (select id from public.arc_products where slug = 'urun-${i}' and organization_id = '${KURUM}'),
         'K-${i}', 'Tek', 10000, 'TRY', 50, '{}'::jsonb, now(), now(), false);
    `);
  }
});

const slugListesi = async (sql) => (await db.query(sql)).rows.map((satir) => satir.slug);

describe("kiracı vitrininde sayfalama", () => {
  for (const fonksiyon of ["arc_storefront_product_slugs", "arc_storefront_search_index"]) {
    test(`${fonksiyon} p_offset alıyor ve sayfalar ilerliyor`, async () => {
      const ilk = await slugListesi(
        `select slug from public.${fonksiyon}('${HOST}', 3, 0)`,
      );
      const ikinci = await slugListesi(
        `select slug from public.${fonksiyon}('${HOST}', 3, 3)`,
      );
      assert.equal(ilk.length, 3);
      assert.equal(ikinci.length, 3);
      /* İlk onarımda her sayfa aynı satırları döndürüyordu. */
      assert.deepEqual(
        ilk.filter((slug) => ikinci.includes(slug)),
        [],
        "ikinci sayfa ilkini yineliyor",
      );
    });

    test(`${fonksiyon} bütün sayfalar birleşince listeyi eksiksiz veriyor`, async () => {
      const hepsi = [];
      for (let sayfa = 0; sayfa < 5; sayfa += 1) {
        const satirlar = await slugListesi(
          `select slug from public.${fonksiyon}('${HOST}', 3, ${sayfa * 3})`,
        );
        hepsi.push(...satirlar);
        if (satirlar.length < 3) break;
      }
      assert.equal(new Set(hepsi).size, ADET);
    });
  }

  test("sayfa boyutu 1000'le sınırlı: PostgREST'in döndürdüğünden fazlası istenmiyor", async () => {
    /*
      `limit 20000` diyen eski sürüm, PostgREST 1000'de kestiği için
      eksik listeyi "tamam" sanıyordu.

      ÖLÇÜT METİN DEĞİL DAVRANIŞ (20261017141944): bu test eskiden
      pg_get_functiondef içinde `least(coalesce(p_limit, 1000), 1000)`
      arıyordu. Gövdeler tek yere taşınıp iki aile sarmalayıcıya
      inince metin sarmalayıcıda yok diye düştü — oysa kural
      bozulmamıştı. Artık 1000'den fazla ürün kurulup fonksiyondan
      5000 isteniyor; 1000 satır dönmeli.
    */
    await rol(db, "postgres");
    await db.exec(`
      insert into public.arc_products (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata)
        select gen_random_uuid(), '${KURUM}', 'Yığın ' || i, 'yigin-' || i, '', 'active', 'native', now(), now() - (i || ' second')::interval, '{}'::jsonb
          from generate_series(1, 1200) i;
      insert into public.arc_product_variants
        (id, organization_id, product_id, sku, title, price, currency, stock, attributes, created_at, updated_at, allow_backorder)
        select gen_random_uuid(), p.organization_id, p.id, 'Y-' || p.slug, 'Tek', 10000, 'TRY', 50, '{}'::jsonb, now(), now(), false
          from public.arc_products p
         where p.organization_id = '${KURUM}' and p.slug like 'yigin-%';
    `);

    for (const fonksiyon of ["arc_storefront_product_slugs", "arc_storefront_search_index"]) {
      const satirlar = await slugListesi(
        `select slug from public.${fonksiyon}('${HOST}', 5000, 0)`,
      );
      assert.equal(satirlar.length, 1000, `${fonksiyon}: sayfa boyutu 1000'le sınırlı değil`);
    }
  });
});
