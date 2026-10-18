// Canlı ziyaret kaydı (20261018212040).
//
// Sınanan: kayıt yazılıyor, bilinmeyen adres yazmıyor, dakikada
// otuzdan fazlası (bot) elenip sayaç şişmiyor ve IP saklanmıyor —
// yalnızca günlük tuzlu karma.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const KONAK = "arvoculture.test";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
    values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000')
    on conflict (id) do nothing;

    /* Konak çözümü arc_store_settings üzerinden: doğrulanmış özel
       alan adı ya da platform alt alan adı (arc_storefront_org). */
    insert into public.arc_store_settings (organization_id, store_name, custom_domain, domain_verified_at)
    values ('${KURUM}', 'ArvoCulture', '${KONAK}', now())
    on conflict (organization_id) do update
      set custom_domain = excluded.custom_domain,
          domain_verified_at = excluded.domain_verified_at;
  `);
});

const yaz = (yol, ip, slug = null) =>
  db.query(
    `select public.arc_storefront_visit($1::text, $2::text, $3::text, 'TR', 'Istanbul', 41.0, 29.0, $4::text)`,
    [KONAK, yol, slug, ip],
  );

const sayi = async () =>
  Number(
    (await db.query(`select count(*)::int as n from public.arc_visits`)).rows[0].n,
  );

describe("canlı ziyaret kaydı", () => {
  test("ziyaret yazılıyor ve ürün slug'ı ayrı duruyor", async () => {
    await yaz("/urun/kurk-manto", "1.2.3.4", "kurk-manto");
    const { rows } = await db.query(
      `select organization_id, path, product_slug, country, city, lat from public.arc_visits order by id desc limit 1`,
    );
    assert.equal(rows[0].organization_id, KURUM);
    assert.equal(rows[0].path, "/urun/kurk-manto");
    assert.equal(rows[0].product_slug, "kurk-manto");
    assert.equal(rows[0].country, "TR");
    assert.equal(Number(rows[0].lat), 41);
  });

  test("IP saklanmıyor, yalnızca karma", async () => {
    const { rows } = await db.query(
      `select ip_hash from public.arc_visits order by id desc limit 1`,
    );
    assert.ok(rows[0].ip_hash && !rows[0].ip_hash.includes("1.2.3.4"));
    assert.equal(rows[0].ip_hash.length, 32);
  });

  test("bilinmeyen adres hiçbir şey yazmıyor", async () => {
    const once = await sayi();
    await yaz("/", "9.9.9.9");
    /* Konak çözülemezse sessizce çıkıyor: uydurma bir Host ile
       başka mağazanın sayacı şişirilemesin. */
    await db.query(
      `select public.arc_storefront_visit('baska.test','/', null,'TR','Istanbul',41,29,'9.9.9.9')`,
    );
    assert.equal(await sayi(), once + 1);
  });

  test("dakikada otuzdan fazlası yazılmıyor", async () => {
    const once = await sayi();
    for (let i = 0; i < 40; i += 1) await yaz(`/s/${i}`, "5.5.5.5");
    /* Sınır 30: aynı karmadan fazlası bot sayılıyor. */
    assert.equal(await sayi() - once, 30);
  });
});
