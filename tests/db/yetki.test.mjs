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
import { veritabani } from "./ortam.mjs";

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
  "public.get_storefront_seller",
];

/** Oturum açmış kullanıcı: kendi siparişleri, profili ve panel yardımcıları. */
const PANEL = [
  ...ANON,
  "private.arvo_is_org_admin",
  "private.can_manage_organization_assets",
  "public.arc_address_line",
  "public.arc_adjust_inventory",
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
