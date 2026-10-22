/*
  YURTDIŞI KARGO TARİFESİ (20261018223636).

  Bölge tablosu açıldığı gün sipariş fonksiyonu onu okumuyordu:
  teslimat ülkesi neresi olursa olsun yurt içi tarifesi (120 TL)
  uygulanıyordu. Yurtdışına satış kapalı olduğu için canlıda zarar
  doğmadı; açıldığı gün her yurtdışı siparişinde doğacaktı.

  SINANAN ŞEY TUTARIN KENDİSİ, "sorgu çalışıyor mu" değil. Bu depodaki
  en pahalı kusurların ortak özelliği ekranla tahsilatın sessizce
  ayrılmasıydı; aşağıdaki her satır bir lira/sent rakamı ölçüyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000000d1";
/* 3.840 TL ve 3.800 TL: eşik sınırının iki yanı (aşağıda). */
const PAHALI = "a3333333-3333-3333-3333-333333333333";
const UCUZ = "a4444444-4444-4444-4444-444444444444";

let db;
before(async () => {
  db = await veritabani();
});

/**
 * Tohum. Kur 40, kâr payı %5, yurt içi kargo 120 TL ve
 * ücretsiz kargo eşiği 2.000 TL — yurt içi eşiği YURTDIŞINDA
 * GEÇMEMELİ ve aşağıdaki sepetler o eşiğin üstünde.
 */
async function tohum({ mod = true, kur = 40, bolgeler = ["dunya"] } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.organizations
      (id, name, slug, sector, status, plan_code, created_at, updated_at, provisioning_state, primary_color)
    values ('${KURUM}', 'Kargo Mağazası', 'kargo-magazasi', 'retail', 'active', 'starter', now(), now(), 'active', '#000000');

    insert into public.arc_store_settings
      (organization_id, store_name, order_prefix, shipping_fee, free_shipping_threshold,
       international_enabled, usd_rate, usd_margin_percent)
    values ('${KURUM}', 'Kargo Mağazası', 'KM', 12000, 200000,
            ${mod}, ${kur === null ? "null" : kur}, 5);

    insert into public.arc_products
      (id, organization_id, name, slug, description, status, source, created_at, updated_at, metadata) values
      ('${PAHALI}', '${KURUM}', 'Pahalı', 'pahali', '', 'active', 'native', now(), now(), '{}'::jsonb),
      ('${UCUZ}',   '${KURUM}', 'Ucuz',   'ucuz',   '', 'active', 'native', now(), now(), '{}'::jsonb);

    insert into public.arc_product_variants
      (organization_id, product_id, sku, title, price, currency, stock, created_at, updated_at, allow_backorder) values
      ('${KURUM}', '${PAHALI}', 'P-1', 'Tek', 384000, 'TRY', 50, now(), now(), false),
      ('${KURUM}', '${UCUZ}',   'U-1', 'Tek', 380000, 'TRY', 50, now(), now(), false);
  `);

  const satirlar = {
    /* Boş ülke listesi = "öteki her yer": 25 $. */
    dunya: `('${KURUM}', 'Dünya', '{}', 2500, 0, 9)`,
    /* Almanya'ya özel tarife: 15 $. Sırası daha önde. */
    almanya: `('${KURUM}', 'Avrupa', '{DE,FR}', 1500, 0, 0)`,
    /* 100 $ üstünde ücretsiz olan dünya bölgesi. */
    esikli: `('${KURUM}', 'Dünya', '{}', 2500, 10000, 9)`,
  };
  const secilen = bolgeler.map((ad) => satirlar[ad]).join(",\n");
  if (secilen) {
    await db.exec(`
      insert into public.arc_shipping_zones
        (organization_id, label, countries, fee_cents, free_over_cents, sira)
      values ${secilen};
    `);
  }
}

const SIPARIS_SQL = `select order_id, total from public.arc_create_storefront_order(
  $1::uuid, 'musteri@ornek.com', 'Ad Soyad', '05001112233',
  jsonb_build_object('line','Sokak 1','city','X','district','Y','postal','1','country',$2::text),
  jsonb_build_array(jsonb_build_object('sku',$3::text,'quantity',1)),
  $4::text)`;

const siparis = (sku, ulke, kupon = null) =>
  db.query(SIPARIS_SQL, [KURUM, ulke, sku, kupon]);

/*
  Reddedilen sipariş SAVEPOINT ile sınanıyor: başarısız bir ifade
  işlemi bozuyor ve aynı testte ardından gelen "yurt içi etkilenmiyor"
  sorgusu da düşerdi.
*/
const siparisReddedilir = (sku, ulke, desen) =>
  reddedilir(db, SIPARIS_SQL, [KURUM, ulke, sku, null], desen);

/** Siparişin kargo ve metadata alanları. */
const kayit = async (orderId) =>
  (
    await db.query(
      `select shipping, subtotal, total, currency, metadata from public.arc_orders where id = $1`,
      [orderId],
    )
  ).rows[0];

describe("yurtdışı kargo tarifesi", () => {
  test("yurtdışında bölge tarifesi kurla liraya çevriliyor", async () => {
    await islem(db, async () => {
      await tohum();
      const { rows } = await siparis("U-1", "US");
      const o = await kayit(rows[0].order_id);
      /* 2.500 sent × 40 = 100.000 kuruş = 1.000 TL. */
      assert.equal(Number(o.shipping), 100000);
      /* Sipariş LİRA kalıyor: sağlayıcı lira çekiyor. */
      assert.equal(o.currency, "TRY");
      /*
        Mal bedeli KÂR PAYLI (20261022190527): 380.000 × 1,05 =
        399.000. Önceden burada 380.000 bekleniyordu, çünkü kâr payı
        yalnızca gösterime uygulanıyordu ve tahsil edilmiyordu.
      */
      assert.equal(Number(o.subtotal), 399000);
      assert.equal(Number(o.total), 399000 + 100000);
    });
  });

  test("yurt içinde yurt içi tarifesi geçerli", async () => {
    await islem(db, async () => {
      await tohum();
      const { rows } = await siparis("U-1", "TR");
      const o = await kayit(rows[0].order_id);
      /* 3.800 TL, yurt içi eşiği 2.000 TL'nin üstünde: kargo bedava. */
      assert.equal(Number(o.shipping), 0);
      assert.equal(o.metadata.international, undefined);
    });
  });

  test("TL eşiği yurtdışında geçmiyor", async () => {
    await islem(db, async () => {
      await tohum();
      /*
        Aynı sepet yurt içinde bedava kargoyla geçiyor (yukarıdaki
        test). Yurtdışında 2.000 TL eşiği uygulanırsa her yurtdışı
        siparişi bedava kargo alırdı — eşik yurt içi maliyetine göre
        konmuş bir söz.
      */
      const { rows } = await siparis("U-1", "DE");
      const o = await kayit(rows[0].order_id);
      assert.equal(Number(o.shipping), 100000);
    });
  });

  test("ücretsiz kargo kuponu yurtdışında kargoyu sıfırlamıyor", async () => {
    await islem(db, async () => {
      await tohum();
      await db.exec(`
        insert into public.arc_discounts
          (organization_id, name, code, discount_type, value, status, combinable, metadata)
        values ('${KURUM}', 'Bedava Kargo', 'KARGO', 'free_shipping', 0, 'active', true, '{}'::jsonb);
      `);
      const { rows } = await siparis("U-1", "US", "KARGO");
      const o = await kayit(rows[0].order_id);
      /* Kupon yurt içi ücretine göre tanımlandı; 1.000 TL'yi
         üstlenmesi mağazaya sessiz bir zarar olurdu. */
      assert.equal(Number(o.shipping), 100000);
    });
  });

  test("ülkeye özel bölge, genel bölgeyi yutmuyor", async () => {
    await islem(db, async () => {
      await tohum({ bolgeler: ["almanya", "dunya"] });
      const de = await kayit((await siparis("U-1", "DE")).rows[0].order_id);
      const us = await kayit((await siparis("U-1", "US")).rows[0].order_id);
      /* DE: 1.500 sent × 40 = 60.000 kuruş. US: genel bölge. */
      assert.equal(Number(de.shipping), 60000);
      assert.equal(Number(us.shipping), 100000);
    });
  });

  test("bölge eşiği MÜŞTERİNİN GÖRDÜĞÜ dolar tutarıyla karşılaştırılıyor", async () => {
    await islem(db, async () => {
      await tohum({ bolgeler: ["esikli"] });
      /*
        Eşik 100 $. İki sepet de ham karşılıkta eşiğin ALTINDA
        (95,00 ve 96,00 $) ama kâr payıyla biri üstüne çıkıyor:
          3.800 TL → 95,00 × 1,05 =  99,75 $  → kargo var
          3.840 TL → 96,00 × 1,05 = 100,80 $  → kargo yok
        Ham tutarla karşılaştırsaydık sepette "100,80 $" yazan
        müşteri kargo ücreti görürdü: ekranla tahsilatın ayrıldığı,
        bu depoda bir kez yaşanmış kusur.
      */
      const ucuz = await kayit((await siparis("U-1", "US")).rows[0].order_id);
      const pahali = await kayit((await siparis("P-1", "US")).rows[0].order_id);
      assert.equal(Number(ucuz.shipping), 100000);
      assert.equal(Number(pahali.shipping), 0);
      assert.equal(Number(pahali.metadata.subtotal_usd_cents), 10080);
    });
  });

  test("siparişin kendi kuru kayıtta duruyor", async () => {
    await islem(db, async () => {
      await tohum();
      const o = await kayit((await siparis("U-1", "US")).rows[0].order_id);
      /* Kur panelden değişiyor; kayıtta olmasaydı eski bir sipariş
         bugünkü kurla yeniden hesaplanırdı (iade, muhasebe, itiraz). */
      assert.equal(o.metadata.international, true);
      assert.equal(o.metadata.shipping_country, "US");
      assert.equal(Number(o.metadata.usd_rate), 40);
      assert.equal(Number(o.metadata.usd_margin_percent), 5);
      assert.equal(Number(o.metadata.shipping_usd_cents), 2500);
    });
  });

  test("mod kapalıysa yurtdışı siparişi geçmiyor", async () => {
    await islem(db, async () => {
      await tohum({ mod: false });
      await siparisReddedilir("U-1", "US", /yurtdışına satış kapalı/i);
      /* Yurt içi satış etkilenmiyor. */
      assert.ok((await siparis("U-1", "TR")).rows[0].order_id);
    });
  });

  test("kur tanımsızsa yurtdışı siparişi geçmiyor", async () => {
    await islem(db, async () => {
      await tohum({ kur: null });
      await siparisReddedilir("U-1", "US", /kuru tanımlı değil/i);
    });
  });

  test("bölgesi olmayan ülkeye satış yapılmıyor", async () => {
    await islem(db, async () => {
      /* Yalnızca Almanya tarifesi var, genel bölge YOK. */
      await tohum({ bolgeler: ["almanya"] });
      await siparisReddedilir("U-1", "US", /gönderim yapılmıyor/i);
      /* Tarifesi olan ülke etkilenmiyor. */
      assert.equal(Number((await kayit((await siparis("U-1", "DE")).rows[0].order_id)).shipping), 60000);
    });
  });
});

/*
  KÂR PAYI TAHSİL EDİLİYOR (20261022190527).

  Kâr payı yalnızca vitrinin GÖSTERİMİNE uygulanıyordu: ekranda
  1.000 TL'lik ürün 27,71 $ yazıyor, karttan 1.000 TL (20,53 $)
  çekiliyordu. Kâr payı hiçbir şey kazandırmıyor, üstelik ekranla
  tahsilat %35 ayrışıyordu.

  Buradaki ölçüt tek cümle: gösterilen dolar = tahsil edilen TL ÷ kur.
*/
describe("yurtdışı kâr payı", () => {
  test("yurtdışı kaleminin birim fiyatı kâr payını içeriyor", async () => {
    await islem(db, async () => {
      await tohum();
      const { rows } = await siparis("U-1", "US");
      const o = await kayit(rows[0].order_id);
      /* 380.000 kuruş × 1,05 = 399.000 */
      assert.equal(Number(o.subtotal), 399000);

      /* KALEMLER TOPLAMI ARA TOPLAMI TUTUYOR: kâr payı ara toplama
         sonradan eklenseydi sipariş detayı "rakamlar toplanmıyor"
         derdi (AC261017-F93525). */
      const { rows: kalemler } = await db.query(
        `select unit_price, quantity, total from public.arc_order_items where order_id = $1`,
        [rows[0].order_id],
      );
      assert.equal(Number(kalemler[0].unit_price), 399000);
      assert.equal(
        kalemler.reduce((t, k) => t + Number(k.total), 0),
        Number(o.subtotal),
      );
    });
  });

  test("yurt içinde kâr payı UYGULANMIYOR", async () => {
    await islem(db, async () => {
      await tohum();
      const o = await kayit((await siparis("U-1", "TR")).rows[0].order_id);
      assert.equal(Number(o.subtotal), 380000);
    });
  });

  test("gösterilen dolar = tahsil edilen TL ÷ kur", async () => {
    await islem(db, async () => {
      await tohum();
      const o = await kayit((await siparis("U-1", "US")).rows[0].order_id);
      /*
        Kur 40. Mal 399.000 kuruş = 3.990 TL → 99,75 $.
        Kargo 2.500 sent × 40 = 100.000 kuruş = 1.000 TL → 25,00 $.
        Toplam 499.000 kuruş = 4.990 TL → 124,75 $.

        Vitrin fiyatı TL × 1,05 ÷ 40 ile gösteriyor; aynı rakam:
        3.800 × 1,05 ÷ 40 = 99,75.
      */
      assert.equal(Number(o.total), 499000);
      assert.equal(Number(o.total) / 100 / 40, 124.75);
    });
  });

  test("bölge eşiği kâr payını İKİ KEZ uygulamıyor", async () => {
    await islem(db, async () => {
      await tohum({ bolgeler: ["esikli"] });
      /*
        Eşik 100 $. Ara toplam artık kâr paylı: 3.800 × 1,05 = 3.990 TL
        → 99,75 $, eşiğin ALTINDA, kargo var. Eski kod burada bir kez
        daha 1,05 ile çarpıyordu (104,74 $) ve eşiği müşterinin
        gördüğünden ÖNCE aşıyordu.
      */
      const ucuz = await kayit((await siparis("U-1", "US")).rows[0].order_id);
      assert.equal(Number(ucuz.shipping), 100000);
      assert.equal(Number(ucuz.metadata.subtotal_usd_cents), 9975);

      /* 3.840 × 1,05 = 4.032 TL → 100,80 $: eşiğin üstünde. */
      const pahali = await kayit((await siparis("P-1", "US")).rows[0].order_id);
      assert.equal(Number(pahali.shipping), 0);
      assert.equal(Number(pahali.metadata.subtotal_usd_cents), 10080);
    });
  });
});
