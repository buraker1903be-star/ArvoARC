/*
  VİTRİN KARTIN AÇIK OLDUĞUNU BİLMELİ.

  arc_storefront_settings havale için bank_transfer_enabled döndürüyor,
  yani vitrin havaleyi gizleyebiliyordu; kartın karşılığı yoktu. PayTR
  bilgisi girilmemiş bir mağazanın vitrininde "Kartla öde" duruyor,
  müşteri formu dolduruyor ve ancak en sonda 503 görüyordu. Yeni bir
  salonun varsayılan hâli tam olarak bu: havale kapalı, PayTR boş.

  Ölçüt lib/paytr/config.ts ile BİREBİR aynı olmalı; ayrışırsa vitrin
  "açık" der, sunucu reddeder — düzeltmeye çalıştığımız duvarın aynısı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260929092603_vitrin_odeme_yontemleri.sql",
);

let db;
before(async () => {
  db = await veritabani();
});

let sayac = 0;
async function salon(ad, slug, ayarlar = {}) {
  const id = `00000000-0000-4000-8000-0000000600${String(++sayac).padStart(2, "0")}`;
  await db.query(
    `insert into public.organizations (id,name,slug,sector,status,plan_code,created_at,updated_at,provisioning_state,primary_color)
     values ($1::uuid,$2,$3,'retail','active','starter',now(),now(),'active','#000000')`,
    [id, ad, slug],
  );
  const sutunlar = Object.keys(ayarlar);
  await db.query(
    `insert into public.arc_store_settings (organization_id, store_name${sutunlar.map((s) => `, ${s}`).join("")})
     values ($1::uuid, $2${sutunlar.map((_, i) => `, $${i + 3}`).join("")})`,
    [id, ad, ...sutunlar.map((s) => ayarlar[s])],
  );
  return { id, host: `${slug}.shop.arvo-os.com` };
}

const ayar = async (host) => (await db.query(`select * from public.arc_storefront_payment_methods($1::text)`, [host])).rows[0];

const TAM = { paytr_enabled: true, paytr_merchant_id: "123456", paytr_merchant_key_enc: "sifreli", paytr_merchant_salt_enc: "sifreli" };

describe("vitrin: kartla ödeme açık mı", () => {
  test("yeni salonun kartı KAPALI", async () => {
    /* Kiracı açılışının verdiği hâl: PayTR boş. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const s = await salon("Salon Beta", "salon-beta");
      const a = await ayar(s.host);
      assert.equal(a.card_enabled, false);
      assert.equal(a.bank_transfer_enabled, false, "havale de varsayılanda kapalı");
    });
  });

  test("bilgisini girmiş mağazanın kartı açık", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      const s = await salon("Salon Tam", "salon-tam", TAM);
      assert.equal((await ayar(s.host)).card_enabled, true);
    });
  });

  test("eksik anahtar kartı açmıyor", async () => {
    /* Sunucu da bu üçünün hepsini arıyor (lib/paytr/config.ts). */
    await islem(db, async () => {
      await rol(db, "postgres");
      for (const eksik of ["paytr_merchant_id", "paytr_merchant_key_enc", "paytr_merchant_salt_enc"]) {
        const ayarlar = { ...TAM };
        delete ayarlar[eksik];
        const s = await salon(`Salon ${eksik}`, `salon-${eksik.replace(/_/g, "-")}`, ayarlar);
        assert.equal((await ayar(s.host)).card_enabled, false, eksik);
      }
    });
  });

  test("panelden kapatılan kart kapalı görünüyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      const s = await salon("Salon Kapali", "salon-kapali", { ...TAM, paytr_enabled: false });
      assert.equal((await ayar(s.host)).card_enabled, false);
    });
  });

  test("ayar satırı hiç olmayan kurumda ikisi de kapalı", async () => {
    /*
      Sol birleşim NULL döndürüyor. coalesce'ler olmasaydı vitrin
      "bilinmiyor" ile "açık"ı ayıramaz, kartı gösterirdi.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      const id = "00000000-0000-4000-8000-0000000609ff";
      await db.query(
        `insert into public.organizations (id,name,slug,sector,status,plan_code,created_at,updated_at,provisioning_state,primary_color)
         values ($1::uuid,'Satirsiz Salon','satirsiz','retail','active','starter',now(),now(),'active','#000000')`,
        [id],
      );
      /* Alt alan adı yok; çözücü bu kurumu bulamaz, satır dönmez. */
      const { rows } = await db.query(
        `select * from public.arc_storefront_payment_methods($1::text)`, ["satirsiz.shop.arvo-os.com"]);
      assert.equal(rows.length, 0);
    });
  });

  test("tanınmayan adres satır döndürmüyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      await salon("Salon Beta", "salon-beta");
      const { rows } = await db.query(`select * from public.arc_storefront_payment_methods($1::text)`, ["baskasi.com"]);
      assert.equal(rows.length, 0);
    });
  });

  test("anon çağırabiliyor, yetkiler DROP'tan sonra geri verilmiş", async () => {
    /*
      Dönüş tipi değiştiği için fonksiyon DROP edildi; DROP yetkileri
      düşürür. Geri verilmezse vitrin ayarları hiç okuyamazdı.
    */
    const { rows } = await db.query(
      `select has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('service_role', p.oid, 'execute') as servis
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'arc_storefront_payment_methods'`,
    );
    assert.equal(rows[0].anon, true);
    assert.equal(rows[0].servis, true);
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const s = await salon("Salon Tekrar", "salon-tekrar", TAM);
      assert.equal((await ayar(s.host)).card_enabled, true);
    });
  });
});
