/*
  SİPARİŞ SİLME — veritabanı tarafı.

  arc_delete_order geri alınamaz bir iş yapıyor: siparişi iptal edip
  stoğu geri veriyor, hareket kayıtlarını ve siparişin kendisini
  siliyor. Kalemler, olaylar ve gönderiler CASCADE ile gidiyor.

  Sınanan şey DÜZ BİR DELETE'İN YAPAMAYACAĞI kısım: stoğun doğru
  kalması. Vitrin satışı stoğu düşürürken hareket kaydı yazmıyor ve
  arc_inventory_movements siparişe yabancı anahtarla değil metin
  referansıyla bağlı; yani silme, stoğu kalıcı olarak düşük bırakmaya
  çok yakın bir işlem.

  MEŞRU AKIŞ da sınanıyor (AGENTS.md): koruma eklerken yalnızca saldırı
  senaryosuna bakmak canlıda müşteri akışını kırmıştı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000e1";
const SAHIP = "00000000-0000-4000-8000-0000000000e2";
const YONETICI = "00000000-0000-4000-8000-0000000000e3";
const SIPARIS = "00000000-0000-4000-8000-0000000000e4";
const URUN = "00000000-0000-4000-8000-0000000000e5";
const VARYANT = "00000000-0000-4000-8000-0000000000e6";
const KALEM = "00000000-0000-4000-8000-0000000000e7";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum({ durum = "confirmed" } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@example.com'), ('${YONETICI}', 'yonetici@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Silme Testi', 'silme-testi', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${SAHIP}', 'owner', '{}'::jsonb, true, now(), false),
      ('${KURUM}', '${YONETICI}', 'manager', '{}'::jsonb, true, now(), false);
    insert into public.organization_modules (organization_id, module_code, is_enabled)
      values ('${KURUM}', 'commerce', true);
    insert into public.arc_products (id, organization_id, name, slug, status, created_at, updated_at)
      values ('${URUN}', '${KURUM}', 'Kupa', 'kupa', 'active', now(), now());
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, price, stock, allow_backorder, created_at, updated_at)
      values ('${VARYANT}', '${KURUM}', '${URUN}', 'KUPA-1', 2000, 7, false, now(), now());
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'SL-1', 'native', '${durum}', 'pending', 'TRY',
              6000, 0, 0, 6000, '{}'::jsonb, now(), now());
    insert into public.arc_order_items
      (id, organization_id, order_id, product_name, sku, variant_id, quantity, unit_price, total)
      values ('${KALEM}', '${KURUM}', '${SIPARIS}', 'Kupa', 'KUPA-1', '${VARYANT}', 3, 2000, 6000);
  `);
}

const stok = async () => {
  const { rows } = await db.query(`select stock from public.arc_product_variants where id = $1`, [VARYANT]);
  return rows[0]?.stock ?? null;
};

const sayim = async (tablo, kosul, deger) => {
  const { rows } = await db.query(`select count(*)::int as n from public.${tablo} where ${kosul} = $1`, [deger]);
  return rows[0].n;
};

describe("sipariş silme · arc_delete_order", () => {
  test("MEŞRU AKIŞ: sipariş ve bağlı kayıtları siliniyor, STOK GERİ GELİYOR", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(
        `insert into public.arc_shipments (organization_id, order_id, status, sequence) values ($1, $2, 'draft', 1)`,
        [KURUM, SIPARIS],
      );
      const oncekiStok = await stok();

      await rol(db, "authenticated", SAHIP);
      const { rows } = await db.query(`select public.arc_delete_order($1) as no`, [SIPARIS]);
      assert.equal(rows[0].no, "SL-1", "silinen siparişin numarası dönüyor");

      await rol(db, "postgres");
      assert.equal(await sayim("arc_orders", "id", SIPARIS), 0, "sipariş silindi");
      assert.equal(await sayim("arc_order_items", "order_id", SIPARIS), 0, "kalemler CASCADE ile gitti");
      assert.equal(await sayim("arc_shipments", "order_id", SIPARIS), 0, "gönderiler CASCADE ile gitti");
      /*
        ASIL SINANAN: sipariş açıkken stok düşmüştü; silme onu geri
        vermeli. Düz bir DELETE stoğu kalıcı olarak düşük bırakırdı.
      */
      assert.equal(await stok(), oncekiStok + 3, "stok iade edildi");
    }));

  test("hareket kayıtları da siliniyor: yabancı anahtar olmadığı için CASCADE ulaşmıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.arc_delete_order($1)`, [SIPARIS]);

      await rol(db, "postgres");
      const { rows } = await db.query(
        `select count(*)::int as n from public.arc_inventory_movements
          where reference_type = 'order_status' and reference_id = $1`,
        [SIPARIS],
      );
      assert.equal(rows[0].n, 0, "silinen siparişi işaret eden hareket kalmadı");
    }));

  test("ZATEN İPTAL edilmiş siparişte stok İKİNCİ KEZ eklenmiyor", () =>
    islem(db, async () => {
      /*
        İptal sırasında stok bir kez geri verilmişti; silme onu tekrar
        eklerse stok şişer ve fark yalnızca sayımda görülür.
      */
      await tohum({ durum: "cancelled" });
      const oncekiStok = await stok();

      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.arc_delete_order($1)`, [SIPARIS]);

      await rol(db, "postgres");
      assert.equal(await stok(), oncekiStok, "stok değişmedi");
    }));

  test("MANAGER silemiyor: silme geri alınamaz, owner/admin işi", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", YONETICI);
      await reddedilir(
        db,
        `select public.arc_delete_order($1)`,
        [SIPARIS],
        /mağaza sahibi ya da yönetici/i,
      );

      await rol(db, "postgres");
      assert.equal(await sayim("arc_orders", "id", SIPARIS), 1, "sipariş duruyor");
    }));

  test("olmayan sipariş anlaşılır hata veriyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `select public.arc_delete_order($1)`,
        ["00000000-0000-4000-8000-00000000ffff"],
        /Sipariş bulunamadı/i,
      );
    }));
});
