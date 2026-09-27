/*
  İADE TALEBİ — veritabanı tarafı.

  create_arvoculture_return_request MÜŞTERİNİN TARAYICISINDAN çağrılıyor
  ve 27.09.2026'ya kadar gelen jsonb'yi olduğu gibi saklıyordu:
  coalesce(p_items, '[]'::jsonb). İstenen SKU, istenen adet ve istenen
  TUTAR gönderilebiliyordu.

  Para tarafı korunuyordu (panel iade tutarını sipariş toplamıyla
  sınırlıyor) ama panelde yanlış kalem görünüyordu ve aynı gün eklenen
  "iade edileni stoğa geri ekle" adımı bu adede güveniyordu.

  Sınanan şey: kalemlerin siparişten YENİDEN KURULMASI. RLS burada
  yetmez — fonksiyon security definer ve girdiyi kendisi doğrulamalı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000f1";
const MUSTERI = "00000000-0000-4000-8000-0000000000f2";
const BASKASI = "00000000-0000-4000-8000-0000000000f3";
const SIPARIS = "00000000-0000-4000-8000-0000000000f4";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  /* Fonksiyon kurumu slug'dan buluyor: 'arvoculture'. */
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MUSTERI}', 'musteri@example.com'), ('${BASKASI}', 'baskasi@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_orders
      (id, organization_id, user_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at)
      values ('${SIPARIS}', '${KURUM}', '${MUSTERI}', 'AC-1', 'native', 'fulfilled', 'paid', 'TRY',
              6000, 0, 0, 6000, '{}'::jsonb, now(), now());
    insert into public.arc_order_items
      (organization_id, order_id, product_name, sku, quantity, unit_price, total) values
      ('${KURUM}', '${SIPARIS}', 'Kupa', 'KUPA-1', 3, 2000, 6000);
  `);
}

const talepKalemleri = async () => {
  const { rows } = await db.query(
    `select items from public.arc_return_requests where order_id = $1 order by created_at desc limit 1`,
    [SIPARIS],
  );
  return rows[0]?.items ?? null;
};

const istek = (kalemler) =>
  db.query(`select public.create_arvoculture_return_request($1, $2::jsonb, $3, null)`, [
    "AC-1",
    JSON.stringify(kalemler),
    "Beden uymadı",
  ]);

describe("iade talebi · kalem doğrulaması", () => {
  test("MEŞRU AKIŞ: seçilen adet kadar talep açılıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUSTERI);
      await istek([{ sku: "KUPA-1", quantity: 2 }]);

      await rol(db, "postgres");
      const kalemler = await talepKalemleri();
      assert.equal(kalemler.length, 1);
      assert.equal(kalemler[0].quantity, 2, "seçilen adet");
      assert.equal(kalemler[0].sku, "KUPA-1");
      assert.equal(kalemler[0].name, "Kupa", "ad siparişten yazılıyor");
      assert.equal(kalemler[0].total, 4000, "tutar birim fiyattan hesaplanıyor");
    }));

  test("İSTEMCİDEN GELEN TUTAR yok sayılıyor", () =>
    islem(db, async () => {
      /*
        Eskiden gelen jsonb olduğu gibi saklanıyordu; panelde iade
        tutarı bu kalemlerden hesaplanıyor.
      */
      await tohum();
      await rol(db, "authenticated", MUSTERI);
      await istek([{ sku: "KUPA-1", quantity: 1, total: 999999, name: "Altın Kupa" }]);

      await rol(db, "postgres");
      const kalemler = await talepKalemleri();
      assert.equal(kalemler[0].total, 2000, "tutar siparişin birim fiyatından");
      assert.equal(kalemler[0].name, "Kupa", "ad da siparişten");
    }));

  test("ADET sipariştekiyle SINIRLI", () =>
    islem(db, async () => {
      /*
        Şişirilmiş adet, iade tutarını ve stoğa geri eklemeyi bozardı.
      */
      await tohum();
      await rol(db, "authenticated", MUSTERI);
      await istek([{ sku: "KUPA-1", quantity: 9999 }]);

      await rol(db, "postgres");
      const kalemler = await talepKalemleri();
      assert.equal(kalemler[0].quantity, 3, "siparişte 3 adet vardı");
      assert.equal(kalemler[0].total, 6000);
    }));

  test("SİPARİŞTE OLMAYAN SKU eleniyor, hiçbiri eşleşmezse talep açılmıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", MUSTERI);
      await reddedilir(
        db,
        `select public.create_arvoculture_return_request($1, $2::jsonb, $3, null)`,
        ["AC-1", JSON.stringify([{ sku: "BASKA-URUN", quantity: 1 }]), "Beden uymadı"],
        /İade edilecek ürün seçilmedi/i,
      );

      await rol(db, "postgres");
      assert.equal(await talepKalemleri(), null, "talep hiç açılmadı");
    }));

  test("BAŞKASININ siparişine talep açılamıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", BASKASI);
      await reddedilir(
        db,
        `select public.create_arvoculture_return_request($1, $2::jsonb, $3, null)`,
        ["AC-1", JSON.stringify([{ sku: "KUPA-1", quantity: 1 }]), "Beden uymadı"],
        /Sipariş bulunamadı/i,
      );
    }));

  test("AYNI SİPARİŞE ikinci açık talep engelleniyor", () =>
    islem(db, async () => {
      /*
        Vitrin artık açık talep varken formu gizliyor; bu, formu
        atlayan istek için son savunma.
      */
      await tohum();
      await rol(db, "authenticated", MUSTERI);
      await istek([{ sku: "KUPA-1", quantity: 1 }]);
      await reddedilir(
        db,
        `select public.create_arvoculture_return_request($1, $2::jsonb, $3, null)`,
        ["AC-1", JSON.stringify([{ sku: "KUPA-1", quantity: 1 }]), "Beden uymadı"],
        /zaten açık bir iade talebiniz var/i,
      );
    }));
});
