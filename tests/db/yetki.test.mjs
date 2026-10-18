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
  "public.get_arvoculture_storefront_collection_products_page",
  "public.get_arvoculture_storefront_collection_facets",
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
  /* Birincil adres: vitrin kanonik adresi bundan kuruyor; adres
     zaten herkese görünür bir bilgi. */
  "public.arc_storefront_primary_host",
  "public.arc_storefront_collection_products",
  "public.arc_storefront_collection_products_page",
  "public.arc_storefront_collection_facets",
  "public.arc_storefront_collections",
  "public.arc_storefront_deals",
  "public.arc_storefront_discounts",
  "public.arc_storefront_facets",
  /*
    Sipariş durum sayfasının okuması. Anon'a AÇIK olmak zorunda:
    müşteri oturum açmadan, bağlantısındaki anahtarla geliyor.
    Fonksiyon yalnızca o anahtarla eşleşen tek siparişi döndürüyor;
    adres, e-posta ve telefon hiç dönmüyor. PANEL listesi ANON'u
    içine aldığı için oturumlu kullanıcıya ayrıca yazılmıyor —
    yazılınca aynı ad iki kez sayılıyor ve liste gerçekle tutmuyor.
  */
  "public.arc_storefront_order_status",
  "public.arc_storefront_product",
  "public.arc_storefront_product_badges",
  "public.arc_storefront_product_count",
  "public.arc_storefront_product_slugs",
  "public.arc_storefront_products",
  "public.arc_storefront_products_page",
  "public.arc_storefront_search_index",
  "public.arc_storefront_settings",
  /*
    KARGO TARİFESİ anon'a açık: yurtdışı müşterisi ülkesini seçtiği
    anda ücreti görmek zorunda ve tutarı ArvoARC hesaplasa da ekranda
    aynı rakam çıkmalı. Dönen şey mağazanın kendi ilan ettiği
    tarife — ürün fiyatı gibi herkese açık bir bilgi.
  */
  "public.arc_storefront_shipping_zones",
  /*
    Yurtdışına gönderilemeyen ürünlerin slug listesi anon'a açık:
    vitrin yurtdışı modunda o kartları gizliyor. Dönen şey ürün
    adresinden başka bir şey değil ve o adresler zaten herkese açık
    sayfalarda.
  */
  "public.arc_storefront_blocked_products",
  /*
    Ödeme yöntemleri: vitrin, gösterebileceği yöntemleri ödeme adımından
    ÖNCE bilmeli. Yalnızca boolean dönüyor, PayTR anahtarları değil.
  */
  "public.arc_storefront_payment_methods",
  "public.arc_storefront_variants",
  /*
    Tanıtım sayfalarının metni. Tablonun kendisi anon'a KAPALI
    (arc_store_pages RLS'i üyelere açık); anon'a açık olan yalnızca
    "şu adresten görünen metin" sorusu. Metinler zaten herkese açık
    sayfalarda basılıyor ve tabloda taslak/yayında ayrımı yok.
  */
  "public.arc_storefront_pages",
  /*
    Satıcı bilgisi ADRESTEN. Mevzuat bu bilgilerin tüketiciye açık
    sunulmasını arıyor, yani anon'a açık olması zorunlu. Eski
    get_storefront_seller de listede: kiracı adını SABİT alıyor
    (ArvoCulture) ve vitrin güncellenip dağıtılana kadar canlıda —
    silinirse hukuki sayfalar yedek sabitlere düşer.
  */
  "public.arc_storefront_seller",
  /*
    ZİYARET SAYACI anon'a açık: vitrin kendi sunucusundan
    çağırıyor ve elindeki anahtar anon. Yazdığı şey bir sayaç —
    en kötü ihtimalle gürültü üretir, okunabilir bir veri
    sızdırmaz; hiçbir şey de DÖNDÜRMÜYOR. Hız sınırı
    fonksiyonun içinde (dakikada 30).
  */
  "public.arc_storefront_visit",
  "public.get_arvoculture_storefront_blocked_products",
  "public.get_arvoculture_storefront_shipping_zones",
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
  /*
    Müşterinin hesap alanı: siparişlerim ve iadelerim. Yalnızca
    oturumlu kullanıcıya açık — süzgeç auth.uid() VE adres, yani
    anon'a açmanın anlamı yok, oturumsuz çağrı zaten boş dönerdi.
  */
  "public.arc_storefront_my_orders",
  "public.arc_storefront_my_returns",
  /*
    Hediye çekleri de aynı alanda: süzgeç oturumdaki e-posta,
    oturumsuz çağrı boş döner. Çekin PARA hareketleri bilerek
    burada DEĞİL (arc_gift_card_issue, _apply, _refund): üçü de
    bakiye yaratıyor ya da hareket ettiriyor, yalnızca
    service_role'a açık.
  */
  "public.arc_storefront_my_gift_cards",
  /* Medya kitaplığı: panel okuması, anon'a kapalı. */
  "public.arc_medya_listesi",
  "public.arc_medya_ozeti",
  /*
    Sipariş silme: yalnızca oturumlu kullanıcıya açık, yetkiyi
    fonksiyonun kendisi daraltıyor (private.arvo_is_org_admin ile
    owner/admin). anon'a KAPALI olmalı — silme geri alınamaz.
  */
  "public.arc_delete_order",
  /*
    Sipariş kalemi düzenleme: oturumlu kullanıcıya açık, yetkiyi işlev
    daraltıyor (owner/admin/manager). Stok ve tutar değiştirdiği için
    anon'a KAPALI.
  */
  "public.arc_siparis_kalemi_duzenle",
  "public.arc_baslik",
  "public.arc_check_coupon",
  "public.arc_clean",
  "public.arc_create_order",
  "public.arc_find_address",
  "public.arc_first_text",
  "public.arc_normalize_address",
  "public.arc_resolve_commerce_tenant",
  "public.arc_sale_price",
  /* İki aşırı yüklü imza var; liste adları saydığı için satır da iki. */
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
  "public.arc_close_missing_supplier_variants",
  "public.arc_set_supplier_links",
  "public.arc_set_supplier_variant_stock",
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
  /*
    İKİ TARAF DA JAVASCRIPT'İN SIRALAMASIYLA diziliyor.

    Önceden gerçek liste SQL'in `order by 1`'inden, beklenen liste
    JS'in `toSorted()`'ından geliyordu. İki harmanlama alt çizgiyi
    farklı değerlendiriyor: `arc_storefront_order_status` ile
    `arc_storefront_org` ikisinde ters sırada çıktı ve deepEqual,
    aynı kümeyi taşıyan iki diziyi "farklı" saydı. Hata da yanıltıcı
    görünüyordu — eksik bir ad varmış gibi.
  */
  assert.deepEqual((await acik(db, "anon")).toSorted(), ANON.toSorted());
  assert.deepEqual((await acik(db, "authenticated")).toSorted(), PANEL.toSorted());
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
