/*
  VİTRİNDE KARGO TAKİBİ — veritabanı tarafı.

  get_arvoculture_my_orders müşterinin sipariş sayfasını besliyor ve
  27.09.2026'da gönderi bilgisi eklendi: paket numarası, kargo firması,
  takip numarası ve paketin içindekiler.

  Geçerli durumlar: draft, created, picked_up, in_transit, delivered,
  cancelled, failed (arc_shipments_status_check). "shipped" diye bir
  durum YOK — vitrinin etiket tablosunda vardı ve ölü anahtardı.

  Sınanan şey HANGİ GÖNDERİLERİN listeye girdiği. İptal edilen paket
  yola çıkmadı, taslak paket OTO'da henüz yok; ikisinin de takip
  numarasını müşteriye göstermek onu olmayan bir kargoyu beklemeye
  iter. Fonksiyon security definer olduğu için bu ayıklamayı RLS değil
  fonksiyonun kendisi yapıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-000000000101";
const MUSTERI = "00000000-0000-4000-8000-000000000102";
const BASKASI = "00000000-0000-4000-8000-000000000103";
const SIPARIS = "00000000-0000-4000-8000-000000000104";
const BASKA_SIPARIS = "00000000-0000-4000-8000-000000000105";
const KALEM = "00000000-0000-4000-8000-000000000106";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MUSTERI}', 'musteri2@example.com'), ('${BASKASI}', 'baskasi2@example.com');
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
      values ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');
    insert into public.arc_orders
      (id, organization_id, user_id, order_number, source, status, payment_status, currency,
       subtotal, tax, shipping, total, metadata, created_at, updated_at) values
      ('${SIPARIS}', '${KURUM}', '${MUSTERI}', 'AC-10', 'native', 'fulfilled', 'paid', 'TRY',
       6000, 0, 0, 6000, '{}'::jsonb, now(), now()),
      ('${BASKA_SIPARIS}', '${KURUM}', '${BASKASI}', 'AC-11', 'native', 'fulfilled', 'paid', 'TRY',
       1000, 0, 0, 1000, '{}'::jsonb, now(), now());
    insert into public.arc_order_items
      (id, organization_id, order_id, product_name, sku, quantity, unit_price, total)
      values ('${KALEM}', '${KURUM}', '${SIPARIS}', 'Kupa', 'KUPA-1', 3, 2000, 6000);
  `);
}

async function gonderi(status, sequence, { firma = null, takip = null, kalemAdedi = null } = {}) {
  const { rows } = await db.query(
    `insert into public.arc_shipments
       (organization_id, order_id, status, sequence, carrier_name, tracking_number)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [KURUM, SIPARIS, status, sequence, firma, takip],
  );
  if (kalemAdedi) {
    await db.query(
      `insert into public.arc_shipment_items (organization_id, shipment_id, order_item_id, quantity)
       values ($1, $2, $3, $4)`,
      [KURUM, rows[0].id, KALEM, kalemAdedi],
    );
  }
  return rows[0].id;
}

const siparisiOku = async (kullanici, numara) => {
  await rol(db, "authenticated", kullanici);
  const { rows } = await db.query(`select * from public.get_arvoculture_my_orders()`);
  return rows.find((satir) => satir.order_number === numara) ?? null;
};

describe("vitrin · sipariş sayfasındaki gönderiler", () => {
  test("MEŞRU AKIŞ: paket numarası, firma, takip ve içindekiler geliyor", () =>
    islem(db, async () => {
      await tohum();
      await gonderi("in_transit", 1, { firma: "Yurtiçi Kargo", takip: "1234567890", kalemAdedi: 2 });

      const siparis = await siparisiOku(MUSTERI, "AC-10");
      assert.equal(siparis.shipments.length, 1);
      const paket = siparis.shipments[0];
      assert.equal(paket.sequence, 1);
      assert.equal(paket.carrier, "Yurtiçi Kargo");
      assert.equal(paket.tracking_number, "1234567890");
      assert.equal(paket.status, "in_transit");
      assert.deepEqual(paket.items, [{ name: "Kupa", quantity: 2 }], "paketin içindekiler");
    }));

  test("İPTAL edilen paket listeye GİRMİYOR", () =>
    islem(db, async () => {
      /*
        İptal edilen paket yola çıkmadı; takip numarasını göstermek
        müşteriyi olmayan bir kargoyu beklemeye iter.
      */
      await tohum();
      await gonderi("cancelled", 1, { firma: "Aras Kargo", takip: "000" });
      await gonderi("created", 2, { firma: "Sürat Kargo", takip: "111" });

      const siparis = await siparisiOku(MUSTERI, "AC-10");
      assert.equal(siparis.shipments.length, 1);
      assert.equal(siparis.shipments[0].sequence, 2);
      assert.equal(siparis.shipments[0].tracking_number, "111");
    }));

  test("TASLAK paket listeye GİRMİYOR", () =>
    islem(db, async () => {
      // Taslak OTO'da henüz yok; müşteriye gösterilecek bir şey taşımıyor.
      await tohum();
      await gonderi("draft", 1);

      const siparis = await siparisiOku(MUSTERI, "AC-10");
      assert.deepEqual(siparis.shipments, [], "boş dizi, null değil");
    }));

  test("paketler SIRAYLA geliyor", () =>
    islem(db, async () => {
      await tohum();
      await gonderi("created", 2, { takip: "ikinci" });
      await gonderi("created", 1, { takip: "birinci" });

      const siparis = await siparisiOku(MUSTERI, "AC-10");
      assert.deepEqual(siparis.shipments.map((p) => p.sequence), [1, 2]);
    }));

  test("BAŞKASININ siparişi hiç dönmüyor", () =>
    islem(db, async () => {
      /*
        Fonksiyon security definer: RLS'i atlıyor ve kapsamı kendisi
        auth.uid() ile daraltıyor.
      */
      await tohum();
      await gonderi("created", 1, { takip: "gizli" });

      assert.equal(await siparisiOku(BASKASI, "AC-10"), null, "başkasının siparişi görünmüyor");
      assert.notEqual(await siparisiOku(BASKASI, "AC-11"), null, "kendi siparişini görüyor");
    }));
});
