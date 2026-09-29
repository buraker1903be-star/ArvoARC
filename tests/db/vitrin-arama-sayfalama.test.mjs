/*
  VİTRİN ARAMA DİZİNİ SAYFALANABİLİR.

  Dizin canlıda 1000 satırda kesiliyordu: PostgREST bu RPC uçlarında
  db-max-rows sınırını uyguluyor, `Range` başlığını ise yok sayıyor.
  29.09.2026'da Range ile sayfalama denendiğinde her istek aynı ilk
  1000 satırı döndürdü; dizin 50 kat tekrarlı 49.800 satıra çıktı ama
  "dudak kalemi" hâlâ hiç görünmedi. Sayfalama artık fonksiyonun kendi
  p_offset parametresiyle.

  ASIL SINANAN, SIRALAMANIN KESİNLİĞİ: aynı `updated_at` değerine sahip
  ürünlerde sıra belirsiz olsaydı bir ürün iki sayfada birden çıkar,
  bir başkası hiç çıkmazdı — tam da düzeltmeye çalıştığımız hata.
  Bu yüzden tohum kasıtlı olarak ÜÇ ürüne aynı zaman damgasını veriyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-00000000e001";

let db;
before(async () => {
  db = await veritabani();
});

/** Üçü aynı anda güncellenmiş beş ürün. */
async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
  `);
  const urunler = [
    ["a-urun", "2026-09-30T10:00:00Z"],
    ["b-urun", "2026-09-30T09:00:00Z"],
    ["c-urun", "2026-09-30T09:00:00Z"],
    ["d-urun", "2026-09-30T09:00:00Z"],
    ["e-urun", "2026-09-30T08:00:00Z"],
  ];
  for (const [slug, an] of urunler) {
    await db.query(
      `insert into public.arc_products (organization_id, name, slug, status, source, metadata, updated_at)
       values ($1, $2, $3, 'active', 'native', '{}'::jsonb, $4)`,
      [KURUM, slug.toUpperCase(), slug, an],
    );
    await db.query(
      `insert into public.arc_product_variants
         (organization_id, product_id, sku, title, price, currency, stock, allow_backorder)
       select $1, id, $2, 'Tek', 10000, 'TRY', 5, false
       from public.arc_products where organization_id = $1 and slug = $3`,
      [KURUM, `${slug}-1`, slug],
    );
  }
}

const dizin = async (limit, offset) => {
  const { rows } = await db.query(
    `select slug from public.get_arvoculture_storefront_search_index($1, $2)`,
    [limit, offset],
  );
  return rows.map((r) => r.slug);
};

const slugListesi = async (limit, offset) => {
  const { rows } = await db.query(
    `select slug from public.get_arvoculture_storefront_product_slugs($1, $2)`,
    [limit, offset],
  );
  return rows.map((r) => r.slug);
};

describe("vitrin arama dizini sayfalama", () => {
  test("sayfalar örtüşmüyor ve hiçbir ürün atlanmıyor", async () => {
    await islem(db, async () => {
      await tohum();
      const hepsi = await dizin(100, 0);
      const birinci = await dizin(2, 0);
      const ikinci = await dizin(2, 2);
      const ucuncu = await dizin(2, 4);
      assert.deepEqual([...birinci, ...ikinci, ...ucuncu], hepsi);
      assert.equal(new Set(hepsi).size, 5);
    });
  });

  test("aynı zaman damgalı ürünler kesin sırada", async () => {
    /* Slug eşitlik bozucu değilse bu sıra çağrıdan çağrıya değişebilir. */
    await islem(db, async () => {
      await tohum();
      assert.deepEqual(await dizin(100, 0), [
        "a-urun", "b-urun", "c-urun", "d-urun", "e-urun",
      ]);
    });
  });

  test("sitemap slug'ları da aynı biçimde sayfalanıyor", async () => {
    await islem(db, async () => {
      await tohum();
      assert.deepEqual(await slugListesi(2, 0), ["a-urun", "b-urun"]);
      assert.deepEqual(await slugListesi(2, 2), ["c-urun", "d-urun"]);
      assert.deepEqual(await slugListesi(2, 4), ["e-urun"]);
    });
  });

  test("sayfa sonu boş dönüyor, başa sarmıyor", async () => {
    /* Range denemesinde son sayfa yeniden ilk 1000 satırı döndürmüştü. */
    await islem(db, async () => {
      await tohum();
      assert.deepEqual(await dizin(2, 10), []);
    });
  });

  test("limit 1000'i aşamıyor, offset negatif olamıyor", async () => {
    /* PostgREST zaten 1000'de kesiyor; fonksiyonun 20000 vaat etmesi
       çağıranı "hepsi geldi" sanmaya itiyordu. */
    await islem(db, async () => {
      await tohum();
      assert.deepEqual(await dizin(999999, -5), await dizin(1000, 0));
    });
  });
});
