// Hediye çekinin siparişte harcanması (20261018200150).
//
// Para yolu: çek EN SONA uygulanıyor çünkü havale indirimi sipariş
// fonksiyonundan SONRA, ödeme ucunda hesaplanıyor. Sınanan: tavan
// aşılmıyor, bakiye düşüyor, kütüğe hareket yazılıyor, AYNI SİPARİŞ
// İÇİN İKİNCİ ÇAĞRI bakiyeye dokunmuyor (müşteri PayTR ekranını
// kapatıp tekrar deneyebiliyor), süresi dolmuş ve başka mağazanın
// çeki geçmiyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { veritabani, rol } from "./ortam.mjs";

const KURUM = "11111111-1111-1111-1111-111111111111";
const BASKA = "99999999-9999-9999-9999-999999999999";
const SIPARIS = "33333333-3333-3333-3333-333333333333";
const SIPARIS2 = "44444444-4444-4444-4444-444444444444";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color) values
      ('${KURUM}', 'ArvoCulture', 'arvoculture', 'retail', 'active', 'starter', now(), now(), 'active', '#000000'),
      ('${BASKA}', 'Başka', 'baska', 'retail', 'active', 'starter', now(), now(), 'active', '#000000')
      on conflict (id) do nothing;

    insert into public.arc_orders
      (id, organization_id, order_number, status, payment_status, subtotal, shipping, total, currency, created_at, updated_at, metadata) values
      ('${SIPARIS}',  '${KURUM}', 'AC-1', 'pending', 'pending', 100000, 0, 100000, 'TRY', now(), now(), '{}'::jsonb),
      ('${SIPARIS2}', '${KURUM}', 'AC-2', 'pending', 'pending', 100000, 0, 100000, 'TRY', now(), now(), '{}'::jsonb);

    insert into public.arc_gift_cards
      (organization_id, code, initial_amount, balance, recipient_email) values
      ('${KURUM}', 'CEK-500',  50000, 50000, 'a@b.c'),
      ('${KURUM}', 'CEK-AZ',    1000,  1000, 'a@b.c'),
      ('${BASKA}', 'CEK-BASKA', 50000, 50000, 'a@b.c');

    insert into public.arc_gift_cards
      (organization_id, code, initial_amount, balance, recipient_email, expires_at) values
      ('${KURUM}', 'CEK-ESKI', 50000, 50000, 'a@b.c', now() - interval '1 day');
  `);
});

const uygula = async (org, siparis, kod, tavan) =>
  Number(
    (
      await db.query(
        `select public.arc_gift_card_apply($1::uuid, $2::uuid, $3::text, $4::bigint) as t`,
        [org, siparis, kod, tavan],
      )
    ).rows[0].t,
  );

const bakiye = async (org, kod) =>
  Number(
    (
      await db.query(
        `select balance from public.arc_gift_cards where organization_id = $1 and code = $2`,
        [org, kod],
      )
    ).rows[0].balance,
  );

describe("hediye çekinin siparişte kullanılması", () => {
  test("bakiye tavanı aşmıyor ve kütüğe yazılıyor", async () => {
    /* Çek 500 TL, ödenecek 300 TL: yalnızca 300 harcanır, kalanı
       müşterinin hakkı olarak çekte durur. */
    assert.equal(await uygula(KURUM, SIPARIS, "CEK-500", 30000), 30000);
    assert.equal(await bakiye(KURUM, "CEK-500"), 20000);

    const kutuk = await db.query(
      `select amount from public.arc_gift_card_uses where order_id = $1 and amount > 0`,
      [SIPARIS],
    );
    assert.equal(kutuk.rows.length, 1);
    assert.equal(Number(kutuk.rows[0].amount), 30000);
  });

  test("aynı sipariş için ikinci çağrı bakiyeye dokunmuyor", async () => {
    /* Müşteri PayTR ekranını kapatıp tekrar deniyor; uç yeniden
       çağrılıyor. İlk uygulanan tutar dönmeli, bakiye aynı kalmalı. */
    assert.equal(await uygula(KURUM, SIPARIS, "CEK-500", 30000), 30000);
    assert.equal(await bakiye(KURUM, "CEK-500"), 20000);
  });

  test("bakiye ödenecek tutardan azsa hepsi harcanır", async () => {
    assert.equal(await uygula(KURUM, SIPARIS2, "CEK-AZ", 99999), 1000);
    assert.equal(await bakiye(KURUM, "CEK-AZ"), 0);
  });

  test("süresi dolmuş çek geçmiyor", async () => {
    assert.equal(await uygula(KURUM, SIPARIS2, "CEK-ESKI", 10000), 1000);
    /* Yukarıdaki dönüş SIPARIS2'nin önceki hareketi (1000); bakiye
       dokunulmamış olmalı. */
    assert.equal(await bakiye(KURUM, "CEK-ESKI"), 50000);
  });

  test("başka mağazanın çeki geçmiyor", async () => {
    const siparis3 = "55555555-5555-5555-5555-555555555555";
    await db.exec(`
      insert into public.arc_orders
        (id, organization_id, order_number, status, payment_status, subtotal, shipping, total, currency, created_at, updated_at, metadata)
      values ('${siparis3}', '${KURUM}', 'AC-3', 'pending', 'pending', 100000, 0, 100000, 'TRY', now(), now(), '{}'::jsonb);
    `);
    assert.equal(await uygula(KURUM, siparis3, "CEK-BASKA", 10000), 0);
    assert.equal(await bakiye(BASKA, "CEK-BASKA"), 50000);
  });

  test("boş kod ve bilinmeyen kod sıfır döndürüyor", async () => {
    const siparis4 = "66666666-6666-6666-6666-666666666666";
    await db.exec(`
      insert into public.arc_orders
        (id, organization_id, order_number, status, payment_status, subtotal, shipping, total, currency, created_at, updated_at, metadata)
      values ('${siparis4}', '${KURUM}', 'AC-4', 'pending', 'pending', 100000, 0, 100000, 'TRY', now(), now(), '{}'::jsonb);
    `);
    assert.equal(await uygula(KURUM, siparis4, "", 10000), 0);
    assert.equal(await uygula(KURUM, siparis4, "YOK-BOYLE", 10000), 0);
  });
});

describe("asgari sepet tutarı", () => {
  /*
    Kupon gibi: 500 TL'lik bir çek 50 TL'lik siparişe uygulanırsa
    kargo bedeli satıştan büyük olabiliyor ve bakiye on ayrı küçük
    siparişe dağılıyor. Ölçüt ARA TOPLAM — kupon düşülmüş tutar
    değil, sepetin kendi büyüklüğü.
  */
  const AZ = "77777777-7777-7777-7777-777777777777";
  const COK = "88888888-8888-8888-8888-888888888888";

  before(async () => {
    await db.exec(`
      insert into public.arc_orders
        (id, organization_id, order_number, status, payment_status, subtotal, shipping, total, currency, created_at, updated_at, metadata) values
        ('${AZ}',  '${KURUM}', 'AC-AZ',  'pending', 'pending',  40000, 0,  40000, 'TRY', now(), now(), '{}'::jsonb),
        ('${COK}', '${KURUM}', 'AC-COK', 'pending', 'pending', 120000, 0, 120000, 'TRY', now(), now(), '{}'::jsonb);
      insert into public.arc_gift_cards
        (organization_id, code, initial_amount, balance, recipient_email, minimum_subtotal) values
        ('${KURUM}', 'CEK-ASGARI', 50000, 50000, 'a@b.c', 100000);
    `);
  });

  test("ara toplam eşiğin altındaysa çek geçmiyor", async () => {
    assert.equal(await uygula(KURUM, AZ, "CEK-ASGARI", 40000), 0);
    assert.equal(await bakiye(KURUM, "CEK-ASGARI"), 50000);
  });

  test("eşiği geçen sepette uygulanıyor", async () => {
    assert.equal(await uygula(KURUM, COK, "CEK-ASGARI", 120000), 50000);
    assert.equal(await bakiye(KURUM, "CEK-ASGARI"), 0);
  });
});
