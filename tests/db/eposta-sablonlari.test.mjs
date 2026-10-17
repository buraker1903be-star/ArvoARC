// Müşteri postası şablonları (20261017152720).
//
// Metin kiracının, zarf kodun. En kritik kural tabloda DEĞİL kodda:
// satır yoksa bugünkü metin gider (tests/eposta-sablonu.test.ts).
// Burada tablonun kendi güvenceleri sınanıyor: kiracı ayrımı, yetki
// ve anahtarın koddaki kayıtla eşleşmesi.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const A = "11111111-1111-4111-8111-00000000ea01";
const B = "11111111-1111-4111-8111-00000000ea02";
const UYE_A = "11111111-1111-4111-8111-00000000eb01";
const MUSTERI_A = "11111111-1111-4111-8111-00000000eb02";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${A}', 'Mağaza A', 'sablon-a', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${B}', 'Mağaza B', 'sablon-b', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into auth.users (id, email) values
      ('${UYE_A}', 'yonetici@example.com'),
      ('${MUSTERI_A}', 'personel@example.com');

    insert into public.organization_memberships (organization_id, user_id, role, is_active) values
      ('${A}', '${UYE_A}', 'admin', true),
      ('${A}', '${MUSTERI_A}', 'member', true);

    insert into public.arc_email_templates (organization_id, template_key, subject, body) values
      ('${A}', 'fulfilled', 'A · gönderiniz yolda', 'A metni'),
      ('${B}', 'fulfilled', 'B · kargoya verildi', 'B metni');
  `);
}

const oku = async () =>
  (await db.query(`select organization_id, subject from public.arc_email_templates order by subject`)).rows;

describe("e-posta şablonları", () => {
  test("üye yalnızca kendi mağazasının şablonunu görüyor", async () => {
    /* Çok kiracılı sistemde en pahalı kusur: komşunun metni. */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE_A);
      const satirlar = await oku();
      assert.equal(satirlar.length, 1);
      assert.equal(satirlar[0].organization_id, A);
    });
  });

  test("yönetici olmayan üye metni değiştiremiyor", async () => {
    /*
      Metin müşteriye gidiyor; her üyenin değiştirmesi doğru değil.
      RLS yazmayı engellediğinde hata DEĞİL 0 satır döner, o yüzden
      ölçüt metnin değişmemesi.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUSTERI_A);
      await db.query(
        `update public.arc_email_templates set body = 'üye yazdı' where organization_id = $1 and template_key = 'fulfilled'`,
        [A],
      );
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select body from public.arc_email_templates where organization_id = $1 and template_key = 'fulfilled'`,
        [A],
      );
      assert.notEqual(rows[0]?.body, "üye yazdı");
    });
  });

  test("yönetici kendi mağazasının şablonunu yazabiliyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE_A);
      await db.query(
        `update public.arc_email_templates set body = 'yönetici yazdı' where organization_id = $1 and template_key = 'fulfilled'`,
        [A],
      );
      const { rows } = await db.query(
        `select body from public.arc_email_templates where organization_id = $1 and template_key = 'fulfilled'`,
        [A],
      );
      assert.equal(rows[0].body, "yönetici yazdı");
    });
  });

  test("koddaki kayıtta olmayan anahtar yazılamıyor", async () => {
    /*
      Panelde yazım hatasıyla kaydedilen anahtar hiç kullanılmaz ve
      kiracı "neden değişmedi" diye sorar; kısıt onu baştan eler.
    */
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await assert.rejects(
        () =>
          db.query(
            `insert into public.arc_email_templates (organization_id, template_key, subject, body) values ($1, 'boyle_bir_posta_yok', 'x', 'y')`,
            [A],
          ),
        /check constraint/,
      );
    });
  });

  test("aşırı uzun metin kısıtta düşüyor", async () => {
    await islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await assert.rejects(
        () =>
          db.query(
            `insert into public.arc_email_templates (organization_id, template_key, subject, body) values ($1, 'refunded', $2, 'y')`,
            [A, "x".repeat(201)],
          ),
        /check constraint/,
      );
    });
  });
});
