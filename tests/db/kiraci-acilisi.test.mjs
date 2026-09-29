/*
  KİRACI AÇILIŞI — yeni salon ayar satırını alabiliyor mu?

  CANLIDA OLAN ŞEY (29.09.2026'da PGlite'ta birebir üretildi):
  order_prefix'in varsayılanı 'AC' ve sütun kiracılar arası TEKİL.
  ArvoCulture 'AC'yi tuttuğu için ikinci salonun ayar satırı açılırken
  23505 veriyordu. Ayar satırı uygulamada tembel açıldığı ve önek
  göndermediği için, yeni salon hangi ayar sekmesine girerse girsin
  KAYDEDEMİYORDU — üstelik hata "Bu sipariş öneki başka bir mağazada
  kullanılıyor" diyordu, kullanıcı hiç önek yazmamışken.

  Burada sınananlar sırasıyla: açılışın çalışması, üretilen değerlerin
  kısıtlara uyması, kullanıcının kendi seçiminin KORUNMASI ve dolu bir
  öneği elle yazmanın hâlâ hata vermesi (sessizce değiştirmek daha
  kötü olurdu).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260929065948_kiraci_acilisi_varsayilanlari.sql",
);

let db;
before(async () => {
  db = await veritabani();
});

let sayac = 0;
/** Kurum açar ve kimliğini döndürür. */
async function kurum(ad, slug) {
  const id = `00000000-0000-4000-8000-0000000400${String(++sayac).padStart(2, "0")}`;
  await db.query(
    `insert into public.organizations (id,name,slug,sector,status,plan_code,created_at,updated_at,provisioning_state,primary_color)
     values ($1::uuid,$2,$3,'retail','active','starter',now(),now(),'active','#000000')`,
    [id, ad, slug],
  );
  return id;
}

/** Uygulamanın tembel açılışıyla aynı: yalnızca mağaza adı gönderiliyor. */
const ayarAc = async (id, ad) =>
  (await db.query(
    `insert into public.arc_store_settings (organization_id, store_name) values ($1::uuid, $2)
     returning order_prefix, platform_subdomain`,
    [id, ad],
  )).rows[0];

describe("kiracı açılışı", () => {
  test("ikinci salon ayar satırını alabiliyor", async () => {
    /* Düzeltmeden önce burası 23505 ile düşüyordu. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const a = await kurum("ArvoCulture", "arvoculture");
      const b = await kurum("Salon Beta", "salon-beta");
      const ilk = await ayarAc(a, "ArvoCulture");
      const ikinci = await ayarAc(b, "Salon Beta");
      assert.equal(ilk.order_prefix, "AR");
      assert.equal(ikinci.order_prefix, "SA");
      assert.notEqual(ilk.order_prefix, ikinci.order_prefix);
    });
  });

  test("aynı harflerle başlayan salonlar çakışmıyor", async () => {
    /* Numaralandırma HARFLE: önek kısıtı ^[A-Z]{1,6}$, rakam yok. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const onekler = [];
      for (const [ad, slug] of [["Salon Bir", "salon-bir"], ["Salon Iki", "salon-iki"], ["Salon Uc", "salon-uc"]]) {
        onekler.push((await ayarAc(await kurum(ad, slug), ad)).order_prefix);
      }
      assert.deepEqual(onekler, ["SA", "SAA", "SAB"]);
      for (const o of onekler) assert.match(o, /^[A-Z]{1,6}$/);
      assert.equal(new Set(onekler).size, 3);
    });
  });

  test("yeni salonun mağaza adresi oluyor", async () => {
    /*
      Vitrin çözücüsü doğrulanmış özel alan adına ya da alt alan adına
      bakıyor; ikisi de yoksa mağaza hiç açılmıyor. Özel alan adı DNS
      ve doğrulama istiyor, alt alan adı istemiyor.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      const b = await kurum("Salon Beta", "salon-beta");
      const ayar = await ayarAc(b, "Salon Beta");
      assert.equal(ayar.platform_subdomain, "salon-beta");
      const { rows } = await db.query(`select public.arc_storefront_org($1::text) as id`, ["salon-beta.shop.arvo-os.com"]);
      assert.equal(rows[0].id, b, "alt alan adından kurum çözülmeli");
    });
  });

  test("alınmış bir alt alan adı numaralanıyor", async () => {
    /*
      organizations.slug zaten TEKİL, yani iki kurum aynı slug'ı
      taşıyamıyor. Çakışma gerçekte şuradan geliyor: bir salon
      ayarlardan elle bir alt alan adı seçiyor ve o ad, sonradan
      açılan başka bir salonun slug'ıyla aynı oluyor.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      const a = await kurum("Erken Salon", "erken-salon");
      await db.query(
        `insert into public.arc_store_settings (organization_id, store_name, platform_subdomain)
         values ($1::uuid, 'Erken Salon', 'guzellik')`,
        [a],
      );
      /* Slug'ı tam o ad olan salon sonradan açılıyor. */
      const b = await kurum("Güzellik", "guzellik");
      assert.equal((await ayarAc(b, "Güzellik")).platform_subdomain, "guzellik-2");
    });
  });

  test("kullanıcının seçtiği önek KORUNUYOR", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      const b = await kurum("Salon Beta", "salon-beta");
      const { rows } = await db.query(
        `insert into public.arc_store_settings (organization_id, store_name, order_prefix, platform_subdomain)
         values ($1::uuid, 'Salon Beta', 'BETA', 'kendi-adresim') returning order_prefix, platform_subdomain`,
        [b],
      );
      assert.equal(rows[0].order_prefix, "BETA");
      assert.equal(rows[0].platform_subdomain, "kendi-adresim");
    });
  });

  test("DOLU bir öneği elle yazmak hâlâ hata veriyor", async () => {
    /*
      Sessizce başka bir önekle kaydetmek daha kötü olurdu: kullanıcı
      sipariş numaralarının neden beklediği gibi çıkmadığını anlamaz.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      const a = await kurum("ArvoCulture", "arvoculture");
      await db.query(
        `insert into public.arc_store_settings (organization_id, store_name, order_prefix) values ($1::uuid,'ArvoCulture','AC')`,
        [a],
      );
      const b = await kurum("Salon Beta", "salon-beta");
      await db.exec("savepoint bekleniyor");
      try {
        await db.query(
          `insert into public.arc_store_settings (organization_id, store_name, order_prefix) values ($1::uuid,'Salon Beta','AC')`,
          [b],
        );
        await db.exec("release savepoint bekleniyor");
        assert.fail("dolu önek kabul edildi");
      } catch (hata) {
        await db.exec("rollback to savepoint bekleniyor");
        assert.match(String(hata.message), /duplicate key|order_prefix_unique/i);
      }
    });
  });

  test("güncellemede önek değiştirilmiyor", async () => {
    /* Tetikleyici yalnızca INSERT; UPDATE kullanıcının kararı. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const b = await kurum("Salon Beta", "salon-beta");
      await ayarAc(b, "Salon Beta");
      await db.query(`update public.arc_store_settings set order_prefix = 'XYZ' where organization_id = $1::uuid`, [b]);
      const { rows } = await db.query(`select order_prefix from public.arc_store_settings where organization_id = $1::uuid`, [b]);
      assert.equal(rows[0].order_prefix, "XYZ");
    });
  });

  test("slug'ı harfsiz kurum da açılabiliyor", async () => {
    /* Kenar durum: slug yalnızca rakam ya da boşsa üretim çökmemeli. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const a = await kurum("Yüz Yüze", "123");
      const ayar = await ayarAc(a, "Yüz Yüze");
      assert.equal(ayar.order_prefix, "MG");
      assert.equal(ayar.platform_subdomain, "123");
      assert.match(ayar.order_prefix, /^[A-Z]{1,6}$/);
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const b = await kurum("Salon Beta", "salon-beta");
      assert.equal((await ayarAc(b, "Salon Beta")).order_prefix, "SA");
    });
  });
});
