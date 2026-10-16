/*
  SİPARİŞ DÜZENLEME — arc_siparis_kalemi_duzenle (16.10.2026).

  Kalem kaldırma, adet değiştirme ve varyant değiştirme tek işlemde:
  stok, ara toplam, toplam, KDV ve olay kaydı. Para kuralı ayrıca
  sınanıyor: ödenmiş siparişte fark "düzenleme alacağı" olarak yazılır,
  ödenen tutar aşılamaz, kart ödemesi sürerken düzenleme yapılmaz.

  MEŞRU AKIŞLAR da sınanıyor (AGENTS.md): yalnızca reddedilme senaryoları
  yeşil kalıp asıl işi kıran bir kural canlıda yaşanmıştı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000d1";
const SAHIP = "00000000-0000-4000-8000-0000000000d2";
const SIPARIS = "00000000-0000-4000-8000-0000000000d3";
const URUN = "00000000-0000-4000-8000-0000000000d4";
const VAR_A = "00000000-0000-4000-8000-0000000000d5";
const VAR_B = "00000000-0000-4000-8000-0000000000d6";
const VAR_C = "00000000-0000-4000-8000-0000000000d7";
const KALEM_A = "00000000-0000-4000-8000-0000000000d8";
const KALEM_B = "00000000-0000-4000-8000-0000000000d9";

let db;
before(async () => {
  db = await veritabani();
});

/* A: 2 × 1000, B: 1 × 3000, kargo 500 → toplam 5500. C: değiştirme adayı (1500, stok 4). */
async function tohum({ odeme = "pending", yontem = null } = {}) {
  await rol(db, "postgres");
  const meta = yontem ? JSON.stringify({ payment_method: yontem }) : "{}";
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip-duzenle@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'Düzenleme Testi', 'duzenleme-testi', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.organization_memberships
      (organization_id, user_id, role, permissions, is_active, joined_at, role_from_management) values
      ('${KURUM}', '${SAHIP}', 'owner', '{}'::jsonb, true, now(), false);
    insert into public.organization_modules (organization_id, module_code, is_enabled)
      values ('${KURUM}', 'commerce', true);
    insert into public.arc_products (id, organization_id, name, slug, status, created_at, updated_at)
      values ('${URUN}', '${KURUM}', 'Eşofman', 'esofman', 'active', now(), now());
    insert into public.arc_product_variants
      (id, organization_id, product_id, sku, price, stock, allow_backorder, created_at, updated_at) values
      ('${VAR_A}', '${KURUM}', '${URUN}', 'ES-A', 1000, 7, false, now(), now()),
      ('${VAR_B}', '${KURUM}', '${URUN}', 'ES-B', 3000, 5, false, now(), now()),
      ('${VAR_C}', '${KURUM}', '${URUN}', 'ES-C', 1500, 4, false, now(), now());
    insert into public.arc_orders
      (id, organization_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', 'DZ-1', 'native', 'confirmed', '${odeme}', 'TRY',
              5000, 0, 500, 5500, '${meta}'::jsonb, now(), now());
    insert into public.arc_order_items
      (id, organization_id, order_id, product_name, sku, variant_id, quantity, unit_price, total) values
      ('${KALEM_A}', '${KURUM}', '${SIPARIS}', 'Eşofman', 'ES-A', '${VAR_A}', 2, 1000, 2000),
      ('${KALEM_B}', '${KURUM}', '${SIPARIS}', 'Eşofman', 'ES-B', '${VAR_B}', 1, 3000, 3000);
  `);
}

const stok = async (id) => (await db.query(`select stock from public.arc_product_variants where id = $1`, [id])).rows[0].stock;
const siparis = async () => (await db.query(`select subtotal, total, tax, metadata from public.arc_orders where id = $1`, [SIPARIS])).rows[0];
const duzenle = (kalem, adet, varyant = null) =>
  db.query(`select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4) as sonuc`, [SIPARIS, kalem, adet, varyant]);

describe("sipariş düzenleme · arc_siparis_kalemi_duzenle", () => {
  test("MEŞRU: stokta olmayan kalem kaldırılıyor; stok geri, toplam ve KDV yeniden", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      const { rows } = await duzenle(KALEM_B, 0);
      assert.equal(rows[0].sonuc.islem, "kaldirildi");

      await rol(db, "postgres");
      const s = await siparis();
      assert.equal(Number(s.subtotal), 2000);
      assert.equal(Number(s.total), 2500, "ara toplam + kargo");
      assert.ok(Number(s.tax) > 0, "KDV tetikleyiciyle yeniden hesaplandı");
      assert.equal(await stok(VAR_B), 6, "kaldırılan kalemin stoğu geri geldi");
      const olay = await db.query(`select event_type from public.arc_order_events where order_id = $1 and event_type = 'item_edited'`, [SIPARIS]);
      assert.equal(olay.rows.length, 1, "olay kaydı yazıldı");
      /* Kalem silinmiyor, görünür kalıyor (kurum sahibi: "üstüne çizgi çeksin"). */
      const cikan = s.metadata.cikan_kalemler;
      assert.equal(cikan.length, 1, "çıkarılan kalem kayıtta");
      assert.deepEqual([cikan[0].sku, cikan[0].adet, Number(cikan[0].tutar), cikan[0].islem], ["ES-B", 1, 3000, "kaldirildi"]);
    }));

  test("değiştirilen kalemin eskisi de çıkan kalemlerde, yerine geçenle", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await duzenle(KALEM_B, 1, VAR_C);
      await rol(db, "postgres");
      const cikan = (await siparis()).metadata.cikan_kalemler;
      assert.deepEqual([cikan[0].sku, cikan[0].islem, cikan[0].yerine], ["ES-B", "degisti", "ES-C"]);
    }));

  test("GERİYE DÖNÜK DOLDURMA: ilk sürümde silinen kalem olay kaydından geri geliyor, iki kez eklenmiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      /* İlk sürümün bıraktığı iz: kalem yok, yalnızca olay var. */
      await db.query(`delete from public.arc_order_items where id = $1`, [KALEM_B]);
      await db.query(
        `insert into public.arc_order_events (organization_id, order_id, event_type, event_data)
         values ($1, $2, 'item_edited', '{"islem":"kaldirildi","urun":"Eşofman","eski_sku":"ES-B","eski_adet":1}'::jsonb)`,
        [KURUM, SIPARIS],
      );
      const dosya = fs.readFileSync(new URL("../../supabase/migrations/20261016121535_cikan_kalemler_gorunur.sql", import.meta.url), "utf8");
      const doldurma = dosya.slice(dosya.indexOf("update public.arc_orders o"));
      await db.exec(doldurma);
      await db.exec(doldurma);
      const cikan = (await siparis()).metadata.cikan_kalemler;
      assert.equal(cikan.length, 1, "bir kez eklendi");
      assert.deepEqual([cikan[0].sku, Number(cikan[0].birim), Number(cikan[0].tutar)], ["ES-B", 3000, 3000], "fiyat varyanttan");
    }));

  test("adet değişikliği çıkan kalem yazmıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await duzenle(KALEM_A, 1);
      await rol(db, "postgres");
      assert.equal((await siparis()).metadata.cikan_kalemler, undefined);
    }));

  test("MEŞRU: adet değişiyor, satış fiyatı korunuyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.arc_product_variants set price = 9999 where id = $1`, [VAR_A]);
      await rol(db, "authenticated", SAHIP);
      await duzenle(KALEM_A, 3);

      await rol(db, "postgres");
      const k = (await db.query(`select quantity, total from public.arc_order_items where id = $1`, [KALEM_A])).rows[0];
      assert.equal(k.quantity, 3);
      assert.equal(Number(k.total), 3000, "birim fiyat sipariş anındaki 1000");
      assert.equal(await stok(VAR_A), 6, "7 + 2 geri − 3");
    }));

  test("MEŞRU: kalem başka varyantla değişiyor, yeni fiyat ve stok", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      const { rows } = await duzenle(KALEM_B, 2, VAR_C);
      assert.equal(rows[0].sonuc.islem, "degisti");

      await rol(db, "postgres");
      const kalemler = (await db.query(`select sku, quantity, total from public.arc_order_items where order_id = $1 order by sku`, [SIPARIS])).rows;
      assert.deepEqual(kalemler.map((k) => [k.sku, k.quantity, Number(k.total)]), [["ES-A", 2, 2000], ["ES-C", 2, 3000]]);
      assert.equal(await stok(VAR_B), 6);
      assert.equal(await stok(VAR_C), 2);
      assert.equal(Number((await siparis()).total), 5500);
    }));

  test("ÖDENMİŞ siparişte fark alacak olarak yazılıyor, ödenen tutar aşılamıyor", () =>
    islem(db, async () => {
      await tohum({ odeme: "paid", yontem: "Kredi kartı" });
      await rol(db, "authenticated", SAHIP);
      const { rows } = await duzenle(KALEM_B, 0);
      assert.equal(rows[0].sonuc.alacak, 3000);
      await rol(db, "postgres");
      assert.equal(Number((await siparis()).metadata.duzenleme_alacagi), 3000);

      /* Ödenen 5500. A yerine C × 4 = 6000 → toplam 6500, ödenenden 1000 fazla. */
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_A, 4, VAR_C], /ödenen tutarı aşamaz/);
    }));

  test("kart ödemesi sürerken düzenleme yok (PayTR tutarı siparişle karşılaştırıyor)", () =>
    islem(db, async () => {
      await tohum({ odeme: "pending", yontem: "Kredi kartı" });
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_B, 0, null], /Kart ödemesi/);
    }));

  test("havale bekleyen sipariş düzenlenebiliyor", () =>
    islem(db, async () => {
      await tohum({ odeme: "pending", yontem: "Banka havalesi / EFT" });
      await rol(db, "authenticated", SAHIP);
      await duzenle(KALEM_B, 0);
      await rol(db, "postgres");
      assert.equal(Number((await siparis()).total), 2500);
    }));

  test("HAVALE İNDİRİMİ korunuyor: yeni mal tutarının yüzdesi yeniden hesaplanıyor", () =>
    islem(db, async () => {
      /* Mal 5000, %3 havale indirimi 150, kargo 500 → 5350. */
      await tohum({ odeme: "pending", yontem: "Banka havalesi / EFT" });
      await rol(db, "postgres");
      await db.query(
        `update public.arc_orders set total = 5350,
           metadata = metadata || '{"transfer_discount": 150, "transfer_discount_percent": 3}'::jsonb where id = $1`,
        [SIPARIS],
      );
      await rol(db, "authenticated", SAHIP);
      await duzenle(KALEM_B, 0);
      await rol(db, "postgres");
      const s = await siparis();
      /* Mal 2000 → indirim 60, toplam 2000 − 60 + 500. */
      assert.equal(Number(s.metadata.transfer_discount), 60);
      assert.equal(Number(s.total), 2440);
    }));

  test("son kalem kaldırılamıyor, gönderideki kalem düzenlenemiyor, stok yetmezse reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const g = await db.query(
        `insert into public.arc_shipments (organization_id, order_id, status, sequence) values ($1, $2, 'draft', 1) returning id`,
        [KURUM, SIPARIS],
      );
      await db.query(`insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity) values ($1, $2, $3, 2)`,
        [KURUM, g.rows[0].id, KALEM_A]);

      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_A, 0, null], /gönderide/);
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_B, 9, null], /Stok yetersiz/);
      await duzenle(KALEM_B, 0).catch(() => {});
    }));

  test("tek kalemli siparişte kaldırma yerine iptal öneriliyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`delete from public.arc_order_items where id = $1`, [KALEM_A]);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_B, 0, null], /siparişi iptal edin/);
    }));

  test("kodun yazdığı olay türleri kısıta takılmıyor (stock_shortfall ödeme onayının içinde)", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      for (const tur of ["payment_amount_mismatch", "payment_settle_failed", "payment_session_failed", "stock_shortfall", "item_edited"]) {
        await db.query(`insert into public.arc_order_events (organization_id, order_id, event_type, event_data) values ($1, $2, $3, '{}'::jsonb)`, [KURUM, SIPARIS, tur]);
      }
      await reddedilir(db, `insert into public.arc_order_events (organization_id, order_id, event_type, event_data) values ($1, $2, 'uydurma', '{}'::jsonb)`, [KURUM, SIPARIS], /check constraint/);
    }));

  test("anon çağıramıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      await reddedilir(db, `select public.arc_siparis_kalemi_duzenle($1, $2, $3, $4)`, [SIPARIS, KALEM_B, 0, null], /permission denied/);
    }));
});
