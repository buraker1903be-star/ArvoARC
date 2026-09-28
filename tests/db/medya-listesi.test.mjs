/*
  MEDYA KİTAPLIĞI LİSTESİ.

  Fonksiyon SECURITY INVOKER: çağıranın haklarıyla çalışıyor, yani
  arc_products üzerindeki RLS olduğu gibi geçerli. Tanımlayıcı
  yapılsaydı kurum kısıtını fonksiyonun kendisi doğrulamak zorunda
  kalırdı ve unutulduğunda BÜTÜN kurumların görselleri açılırdı — bu
  yüzden yalıtım burada sınanıyor, "parametre doğru geçiliyor mu" diye
  değil, "yanlış parametre geçilse ne olur" diye.

  MEŞRU AKIŞ da sınanıyor: kendi salonunun görselleri, doğru ürün
  adıyla ve sıralı gelmeli.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260928180805_medya_listesi.sql",
);

const KURUM = "00000000-0000-4000-8000-00000000e001";
const KOMSU = "00000000-0000-4000-8000-00000000e002";
const UYE = "00000000-0000-4000-8000-00000000e003";
const KOMSU_UYE = "00000000-0000-4000-8000-00000000e004";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${UYE}', 'uye@example.com'), ('${KOMSU_UYE}', 'komsu@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'Tarzyeri', 'tarzyeri', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${KOMSU}', 'Komşu', 'komsu', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${UYE}', 'owner', '{}'::jsonb, true, now(), false),
      ('${KOMSU}', '${KOMSU_UYE}', 'owner', '{}'::jsonb, true, now(), false);

    insert into public.arc_products (organization_id, name, slug, status, source, metadata, created_at) values
      ('${KURUM}', 'Tişört', 'tisort', 'active', 'native',
        jsonb_build_object('image_paths', jsonb_build_array('k/tisort/1.jpg','k/tisort/2.jpg')), now()),
      ('${KURUM}', 'Kupa', 'kupa', 'draft', 'native',
        jsonb_build_object('image_paths', jsonb_build_array('k/kupa/1.jpg')), now() - interval '1 day'),
      -- Görseli olmayan ürün listede hiç görünmemeli.
      ('${KURUM}', 'Görselsiz', 'gorselsiz', 'active', 'native', '{}'::jsonb, now() - interval '2 days'),
      ('${KOMSU}', 'Komşunun ürünü', 'komsu-urun', 'active', 'native',
        jsonb_build_object('image_paths', jsonb_build_array('m/gizli/1.jpg')), now());
  `);
}

const liste = async (kurum, arama = null, limit = 60, offset = 0) => {
  const { rows } = await db.query(
    `select yol, urun_adi, urun_durumu, sira, toplam
       from public.arc_medya_listesi($1::uuid, $2::text, $3::int, $4::int)`,
    [kurum, arama, limit, offset],
  );
  return rows;
};

describe("medya listesi", () => {
  test("kendi salonunun görselleri ürün adıyla geliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const satirlar = await liste(KURUM);
      assert.deepEqual(satirlar.map((r) => r.yol), ["k/tisort/1.jpg", "k/tisort/2.jpg", "k/kupa/1.jpg"]);
      assert.equal(satirlar[0].urun_adi, "Tişört");
      /* Sıra numarası galerideki yerini veriyor: 1 kapak. */
      assert.equal(Number(satirlar[0].sira), 1);
      assert.equal(Number(satirlar[1].sira), 2);
      /* Toplam pencere işleviyle geliyor; ikinci sorgu yok. */
      assert.equal(Number(satirlar[0].toplam), 3);
    });
  });

  test("görseli olmayan ürün listeye girmiyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const adlar = (await liste(KURUM)).map((r) => r.urun_adi);
      assert.equal(adlar.includes("Görselsiz"), false);
    });
  });

  test("başka salonun kimliğiyle sorulunca boş dönüyor", async () => {
    /*
      RLS'in işi. Fonksiyon tanımlayıcı olsaydı bu çağrı komşunun
      görsellerini döndürürdü ve kimse fark etmezdi.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      assert.deepEqual(await liste(KOMSU), []);
      await rol(db, "authenticated", KOMSU_UYE);
      assert.deepEqual((await liste(KURUM)), []);
      assert.deepEqual((await liste(KOMSU)).map((r) => r.yol), ["m/gizli/1.jpg"]);
    });
  });

  test("arama ürün adına göre süzüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      assert.deepEqual((await liste(KURUM, "kupa")).map((r) => r.yol), ["k/kupa/1.jpg"]);
      /* Boş ve boşluk arama süzmüyor. */
      assert.equal((await liste(KURUM, "")).length, 3);
      assert.equal((await liste(KURUM, "   ")).length, 3);
      assert.equal((await liste(KURUM, "bulunmayan")).length, 0);
    });
  });

  test("sayfalama toplamı bozmuyor", async () => {
    /* Toplam LIMIT'ten önce hesaplanmalı, yoksa sayfalar yanlış çıkar. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      const ilk = await liste(KURUM, null, 2, 0);
      assert.equal(ilk.length, 2);
      assert.equal(Number(ilk[0].toplam), 3);
      const ikinci = await liste(KURUM, null, 2, 2);
      assert.equal(ikinci.length, 1);
      assert.equal(Number(ikinci[0].toplam), 3);
      assert.equal(ikinci[0].yol, "k/kupa/1.jpg");
    });
  });

  test("uçuk sınırlar kırpılıyor", async () => {
    /* Negatif offset ya da 10.000'lik limit sunucuyu zorlamamalı. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      assert.equal((await liste(KURUM, null, 100000, -5)).length, 3);
      assert.equal((await liste(KURUM, null, 0, 0)).length, 0);
    });
  });

  test("anon fonksiyonu çağıramıyor", async () => {
    /* Panel okuması; müşteri vitrini bu listeyi görmemeli. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      await db.exec("savepoint bekleniyor");
      try {
        await db.query(`select yol from public.arc_medya_listesi($1::uuid, null, 10, 0)`, [KURUM]);
        await db.exec("release savepoint bekleniyor");
        assert.fail("anon çağırabildi");
      } catch (hata) {
        await db.exec("rollback to savepoint bekleniyor");
        assert.match(String(hata.message), /permission denied|izin/i);
      }
    });
  });

  test("migration ikinci kez çalıştırılabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      await rol(db, "authenticated", UYE);
      assert.equal((await liste(KURUM)).length, 3);
    });
  });
});
