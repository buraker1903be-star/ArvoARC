/*
  KARGO BÖLGELERİNİN PANEL YETKİSİ (20261022172855).

  NEDEN VAR: `arc_shipping_zones` 20261018220531'de RLS AÇIK ve
  POLİTİKASIZ kuruldu. O migration "yazma panelde servis anahtarıyla"
  diyordu ve YANLIŞTI — panel oturum istemcisiyle çalışıyor
  (lib/tenant.ts → createClient(), rol `authenticated`). Sonuç:
  Ayarlar → Yurtdışı satış bölgeleri ne okuyabiliyor ne yazabiliyordu.
  Okuma politikasız bir tabloda SESSİZCE boş dönüyor; operatör
  "Henüz bölge tanımlanmadı" görüyor ve hiçbir yerde hata yok.

  Kusur üç gün görünmedi çünkü `npm run check:rls` canlı şema
  DÖKÜMÜNÜ okuyor ve döküm bayattı. Döküm 22.10.2026'da yenilenince
  denetim ilk iş olarak bunu bildirdi.

  Burada ölçülen şey PANELİN GERÇEKTEN ÇALIŞMASI: ekranda ne
  olduğunu değil, `authenticated` rolünün tabloyu okuyup
  yazabildiğini sınıyor. Kiracı ayrımı ve yönetici/üye ayrımı da
  burada — tarife PARA belirliyor (yurtdışı kargosu).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

/* UUID olmak zorunda: "b" ve "k" onaltılık değil, bu dosyada
   daha önce geçersiz kimlik yüzünden tohum düşmüştü. */
const A = "11111111-1111-4111-8111-00000000cb01";
const B = "11111111-1111-4111-8111-00000000cb02";
const YONETICI_A = "11111111-1111-4111-8111-00000000cc01";
const UYE_A = "11111111-1111-4111-8111-00000000cc02";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${A}', 'Mağaza A', 'bolge-a', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${B}', 'Mağaza B', 'bolge-b', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into auth.users (id, email) values
      ('${YONETICI_A}', 'yonetici@example.com'),
      ('${UYE_A}', 'personel@example.com');

    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${A}', '${YONETICI_A}', 'admin', true),
      ('${A}', '${UYE_A}', 'member', true);

    insert into public.arc_shipping_zones
      (organization_id, label, countries, fee_cents, free_over_cents, sira) values
      ('${A}', 'A Dünya', '{}', 2500, 0, 0),
      ('${B}', 'B Dünya', '{}', 3900, 0, 0);
  `);
}

const oku = async () =>
  (await db.query(`select organization_id, label, fee_cents from public.arc_shipping_zones order by label`)).rows;

describe("kargo bölgesi yetkisi", () => {
  test("üye kendi mağazasının tarifesini OKUYABİLİYOR", async () => {
    /*
      Asıl kusur buydu: politikasız tabloda okuma boş dönüyor ve
      operatör girdiği bölgeyi göremiyordu.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE_A);
      const satirlar = await oku();
      assert.equal(satirlar.length, 1, "üye kendi tarifesini görmeli");
      assert.equal(satirlar[0].organization_id, A);
      assert.equal(Number(satirlar[0].fee_cents), 2500);
    });
  });

  test("komşunun tarifesi görünmüyor", async () => {
    /* Çok kiracılı sistemde en pahalı kusur: komşunun verisi. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI_A);
      const satirlar = await oku();
      assert.deepEqual(satirlar.map((s) => s.label), ["A Dünya"]);
    });
  });

  test("yönetici tarifeyi yazabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI_A);
      await db.query(
        `update public.arc_shipping_zones set fee_cents = 3000 where organization_id = $1`,
        [A],
      );
      await db.query(
        `insert into public.arc_shipping_zones (organization_id, label, countries, fee_cents, free_over_cents, sira)
         values ($1, 'A Avrupa', '{DE,FR}', 1500, 0, 1)`,
        [A],
      );
      await rol(db, "postgres");
      const satirlar = await oku();
      const a = satirlar.filter((s) => s.organization_id === A);
      assert.equal(a.length, 2, "yeni bölge eklenmeli");
      assert.equal(Number(a.find((s) => s.label === "A Dünya").fee_cents), 3000);
    });
  });

  test("yönetici olmayan üye tarifeyi değiştiremiyor", async () => {
    /*
      Tarife PARA belirliyor: yurtdışı kargosunu her üyenin
      değiştirmesi doğru değil. RLS yazmayı engellediğinde hata DEĞİL
      0 satır döner, o yüzden ölçüt ücretin değişmemesi.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE_A);
      await db.query(
        `update public.arc_shipping_zones set fee_cents = 1 where organization_id = $1`,
        [A],
      );
      await rol(db, "postgres");
      const satirlar = await oku();
      assert.equal(Number(satirlar.find((s) => s.label === "A Dünya").fee_cents), 2500);
    });
  });

  test("başka mağazanın tarifesine yazılamıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI_A);
      await db.query(
        `update public.arc_shipping_zones set fee_cents = 1 where organization_id = $1`,
        [B],
      );
      await rol(db, "postgres");
      const satirlar = await oku();
      assert.equal(Number(satirlar.find((s) => s.label === "B Dünya").fee_cents), 3900);
    });
  });

  test("vitrin politikalardan bağımsız okuyor", async () => {
    /*
      Vitrin tarifeyi SECURITY DEFINER fonksiyondan alıyor; panel
      politikaları değişse de yurtdışı satışı etkilenmemeli.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select fee_cents from public.arc_vitrin_kargo_bolgeleri($1::uuid)`,
        [A],
      );
      assert.equal(Number(rows[0].fee_cents), 2500);
    });
  });
});
