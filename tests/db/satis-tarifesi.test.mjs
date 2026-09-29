/*
  SATIŞ TARİFESİ — yeni salon başkasının tarifesiyle mi satıyor?

  CANLIDA OLAN ŞEY (29.09.2026'da PGlite'ta üretildi): shipping_fee
  NOT NULL ve sütun varsayılanı 12000 kuruş, free_shipping_threshold
  200000 kuruş. Bu sayılar sistem tek mağazalıyken konmuştu ve
  ArvoCulture'ın tarifesi. Kiracı açılışının verdiği ayar satırı da
  onları alıyor: yeni salon 120 TL kargoyla, 2000 TL ücretsiz kargo
  eşiğiyle satmaya başlıyor — hiç sorulmadan.

  Kurulum rehberi bunu göremiyordu: ölçüt "shipping_fee bir sayı mı"
  idi ve sütun NOT NULL olduğu için cevap her zaman evet, adım hep
  TAMAM. Damga (sales_configured_at) tam olarak bu ayrımı taşıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260929081212_satis_tarifesi_secildi_mi.sql",
);

let db;
before(async () => {
  db = await veritabani();
});

let sayac = 0;
async function kurum(ad, slug) {
  const id = `00000000-0000-4000-8000-0000000500${String(++sayac).padStart(2, "0")}`;
  await db.query(
    `insert into public.organizations (id,name,slug,sector,status,plan_code,created_at,updated_at,provisioning_state,primary_color)
     values ($1::uuid,$2,$3,'retail','active','starter',now(),now(),'active','#000000')`,
    [id, ad, slug],
  );
  return id;
}

const ayarAc = async (id, ad) =>
  (await db.query(
    `insert into public.arc_store_settings (organization_id, store_name) values ($1::uuid, $2)
     returning shipping_fee, free_shipping_threshold, sales_configured_at`,
    [id, ad],
  )).rows[0];

describe("satış tarifesi seçildi mi", () => {
  test("yeni salonun tarifesi DAMGASIZ geliyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      const ayar = await ayarAc(await kurum("Salon Beta", "salon-beta"), "Salon Beta");
      /* Sayılar hâlâ varsayılan — hesap yolu değişmedi… */
      assert.equal(Number(ayar.shipping_fee), 12000);
      assert.equal(Number(ayar.free_shipping_threshold), 200000);
      /* …ama "kiracı seçti" demiyoruz: rehber adımı eksik sayacak. */
      assert.equal(ayar.sales_configured_at, null);
    });
  });

  test("ayarları kaydeden mağaza damgalanıyor", async () => {
    /* Panelin updateSalesSettings eylemiyle aynı yazım. */
    await islem(db, async () => {
      await rol(db, "postgres");
      const id = await kurum("Salon Beta", "salon-beta");
      await ayarAc(id, "Salon Beta");
      await db.query(
        `update public.arc_store_settings
            set shipping_fee = 0, free_shipping_threshold = 100000, sales_configured_at = now()
          where organization_id = $1::uuid`,
        [id],
      );
      const { rows } = await db.query(
        `select shipping_fee, sales_configured_at from public.arc_store_settings where organization_id = $1::uuid`,
        [id],
      );
      /* Ücretsiz kargo (0) da bir seçim; damga onu da sayıyor. */
      assert.equal(Number(rows[0].shipping_fee), 0);
      assert.notEqual(rows[0].sales_configured_at, null);
    });
  });

  test("var olan mağazalar seçmiş sayılıyor", async () => {
    /*
      Yıllardır satan bir mağazaya "kargon eksik" demek yanlış alarm
      olurdu. Migration uygulandığı andaki satırlar damgalanıyor.
    */
    await islem(db, async () => {
      await rol(db, "postgres");
      const id = await kurum("Eski Salon", "eski-salon");
      await ayarAc(id, "Eski Salon");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const { rows } = await db.query(
        `select sales_configured_at from public.arc_store_settings where organization_id = $1::uuid`,
        [id],
      );
      assert.notEqual(rows[0].sales_configured_at, null);
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      const ayar = await ayarAc(await kurum("Salon Gama", "salon-gama"), "Salon Gama");
      assert.equal(ayar.sales_configured_at, null, "yeni satır yine damgasız");
    });
  });
});
