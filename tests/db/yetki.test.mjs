// Hangi fonksiyonun kime açık olduğu burada yazılıdır.
//
// Postgres yeni fonksiyonu PUBLIC'e (anon dahil) açık oluşturur ve Supabase'in
// varsayılan yetkileri de anon/authenticated'a EXECUTE verir; migration'da
// "revoke … from public, anon, authenticated" unutulursa fonksiyon herkese
// açık kalır. 19.09.2026'da ARC'ta tam olarak bu oldu: siparişi "ödendi"
// yapan, tedarikçi stoğunu toplu yazan ve fiyat güncelleyen fonksiyonlar
// anonim çağrılabiliyordu (migration 20260919114636 kapattı).
//
// Yeni fonksiyon eklerken bu listeye BİLEREK ekleyin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

/** Müşteri vitrini: yalnızca okuyan, satıcıyı ve ürünleri getiren fonksiyonlar. */
const ANON = [
  "public.arc_decode_entities",
  "public.arc_extract_vat",
  "public.arc_store_stage",
  "public.arc_variant_available",
  "public.get_arvoculture_storefront_collection_products",
  "public.get_arvoculture_storefront_collections",
  "public.get_arvoculture_storefront_deals",
  "public.get_arvoculture_storefront_discounts",
  "public.get_arvoculture_storefront_facets",
  "public.get_arvoculture_storefront_product",
  "public.get_arvoculture_storefront_product_badges",
  "public.get_arvoculture_storefront_product_count",
  "public.get_arvoculture_storefront_product_slugs",
  "public.get_arvoculture_storefront_products",
  "public.get_arvoculture_storefront_products_page",
  "public.get_arvoculture_storefront_search_index",
  "public.get_arvoculture_storefront_settings",
  "public.get_arvoculture_storefront_variants",
  /*
    ÇOK KİRACILI VİTRİN. Kiracı alan adından çözülüyor
    (arc_storefront_org); müşteri tarafı anonim çalıştığı için hepsi
    anon'a BİLEREK açık. Eski get_arvoculture_* fonksiyonları da
    listede duruyor: vitrin uygulaması geçene kadar canlıdalar.
  */
  "public.arc_storefront_org",
  "public.arc_storefront_collection_products",
  "public.arc_storefront_collections",
  "public.arc_storefront_deals",
  "public.arc_storefront_discounts",
  "public.arc_storefront_facets",
  "public.arc_storefront_product",
  "public.arc_storefront_product_badges",
  "public.arc_storefront_product_count",
  "public.arc_storefront_product_slugs",
  "public.arc_storefront_products",
  "public.arc_storefront_products_page",
  "public.arc_storefront_search_index",
  "public.arc_storefront_settings",
  /*
    Ödeme yöntemleri: vitrin, gösterebileceği yöntemleri ödeme adımından
    ÖNCE bilmeli. Yalnızca boolean dönüyor, PayTR anahtarları değil.
  */
  "public.arc_storefront_payment_methods",
  "public.arc_storefront_variants",
  "public.get_storefront_seller",
];

/** Oturum açmış kullanıcı: kendi siparişleri, profili ve panel yardımcıları. */
const PANEL = [
  ...ANON,
  "private.arvo_is_org_admin",
  "private.can_manage_organization_assets",
  "public.arc_address_line",
  "public.arc_adjust_inventory",
  /*
    Çok kiracılı vitrinin yazma yolu. Kupon ve sipariş oluşturma
    BİLEREK burada DEĞİL: yalnızca service_role'a açık (vitrin
    bunları kendi sunucusundan çağırıyor). İade talebi auth.uid()
    istediği için oturumlu kullanıcıya açık.
  */
  "public.arc_storefront_return_request",
  /* Medya kitaplığı: panel okuması, anon'a kapalı. */
  "public.arc_medya_listesi",
  /*
    Sipariş silme: yalnızca oturumlu kullanıcıya açık, yetkiyi
    fonksiyonun kendisi daraltıyor (private.arvo_is_org_admin ile
    owner/admin). anon'a KAPALI olmalı — silme geri alınamaz.
  */
  "public.arc_delete_order",
  "public.arc_baslik",
  "public.arc_check_coupon",
  "public.arc_clean",
  "public.arc_create_order",
  "public.arc_find_address",
  "public.arc_first_text",
  "public.arc_normalize_address",
  "public.arc_resolve_commerce_tenant",
  "public.arc_sale_price",
  "public.arc_sale_price",
  "public.arc_slugify",
  "public.arc_total_stock_units",
  "public.arc_update_order_status",
  "public.claim_arvoculture_orders",
  "public.create_arvoculture_return_request",
  "public.get_arvoculture_my_orders",
  "public.get_arvoculture_my_returns",
  "public.update_arvoculture_profile",
];

/** Yalnızca sunucu (servis anahtarı) çağırmalı: para, stok, fiyat ve veri aktarımı. */
const SUNUCU_OLMALI = [
  "public.arc_settle_storefront_order",
  "public.settle_arvoculture_storefront_order",
  "public.arc_create_storefront_order",
  "public.create_arvoculture_storefront_order",
  "public.arc_bulk_update_supplier_stock",
  "public.arc_reprice_supplier",
  "public.arc_categorize_supplier_products",
  "public.arc_aktarim_yukle",
  "public.arc_aktarim_sil",
  "public.arc_aktarim_pk",
  "public.arc_aktarim_hesap_yukle",
];

async function acik(db, rol) {
  const { rows } = await db.query(
    `select n.nspname || '.' || p.proname as ad
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege($1, p.oid, 'execute')
      order by 1`,
    [rol],
  );
  return rows.map((r) => r.ad);
}

test("fonksiyonlar yalnızca listedeki rollere açık", async () => {
  const db = await veritabani();
  assert.deepEqual(await acik(db, "anon"), ANON.toSorted());
  assert.deepEqual(await acik(db, "authenticated"), PANEL.toSorted());
});

test("para, stok, fiyat ve aktarım fonksiyonları müşteriye kapalı", async () => {
  const db = await veritabani();
  const anon = new Set(await acik(db, "anon"));
  const panel = new Set(await acik(db, "authenticated"));
  for (const ad of SUNUCU_OLMALI) {
    assert.equal(anon.has(ad), false, `${ad} anon'a açık`);
    assert.equal(panel.has(ad), false, `${ad} oturumlu kullanıcıya açık`);
  }
});

/*
  TETİKLEYİCİ FONKSİYONLARI BU DENETİMİN DIŞINDAYDI: yukarıdaki sorgu
  prorettype <> 'trigger' ile onları eliyor, çünkü soru "kim çağırabilir"
  ve bir tetikleyici fonksiyonu zaten doğrudan çağrılamaz.

  Boşluk buradan sızdı. private şemasındaki üç tetikleyici fonksiyonu
  PUBLIC'e açıktı ve gerekçe olarak "satırı yazan rolün çalıştırabilmesi
  gerekiyor" yazılmıştı. 29.09.2026'da ölçüldü: PostgreSQL tetikleyici
  tetiklenirken EXECUTE yetkisini DENETLEMİYOR — yetki kaldırılınca
  INSERT ve tetikleyici çalışmaya devam ediyor (20260929090233).

  Gerekmeyen yetki, bir sonraki fonksiyonu yazanın kopyalayacağı kalıp
  oluyor; ben de öyle yazmıştım. Test artık kalıbı kapatıyor.
*/
test("tetikleyici fonksiyonları kimseye açık değil", async () => {
  const db = await veritabani();
  const { rows } = await db.query(
    `select n.nspname || '.' || p.proname as ad,
            coalesce(p.proacl::text, '(varsayılan)') as yetkiler
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
      order by 1`,
  );
  assert.deepEqual(rows, [], "tetikleyici fonksiyonuna EXECUTE gerekmiyor");
});

test("tetikleyiciler yetki olmadan da çalışıyor", async () => {
  /*
    Kuralın dayandığı olgu. Bozulursa kiracı açılışı sessizce durur:
    yeni salonun ayar satırı öneksiz kalır ve tekillik kısıtına takılır.
  */
  const db = await veritabani();
  await islem(db, async () => {
    await rol(db, "postgres");
    await db.query(
      `insert into public.organizations (id,name,slug,sector,status,plan_code,created_at,updated_at,provisioning_state,primary_color)
       values ('00000000-0000-4000-8000-00000000cd01','Yetki Salonu','yetki-salonu','retail','active','starter',now(),now(),'active','#000000')`,
    );
    const { rows } = await db.query(
      `insert into public.arc_store_settings (organization_id, store_name)
       values ('00000000-0000-4000-8000-00000000cd01','Yetki Salonu')
       returning order_prefix, platform_subdomain`,
    );
    assert.match(rows[0].order_prefix, /^[A-Z]{1,6}$/);
    assert.equal(rows[0].platform_subdomain, "yetki-salonu");
  });
});
