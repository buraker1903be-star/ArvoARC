-- vitrin_sarmalayicilar_cekirdege_baglandi
--
-- TAŞIMA GERİ GELİYOR — SUÇLU O DEĞİLDİ.
--
-- 20261017141944 ile 16 çiftin gövdesi `arc_vitrin_*` çekirdeklerine
-- taşındı. Hemen ardından canlıda bütün ÜRÜN SAYFALARI 500 verdi ve
-- ben sebebi bu taşımada arayıp 20261017143359 ile geri aldım.
-- Sayfalar yine 500 verdi.
--
-- Gerçek sebep kendi vitrin değişikliğimdi: fiyat ve stok taze
-- gelsin diye ürün ve varyant okumalarına `onbelleksiz: true`
-- eklemişim. Ürün rotası `export const revalidate = 60` ile
-- saklanıyor ve Next, saklanacak bir sayfanın içinde
-- `cache: "no-store"` görünce rotayı hiç çizemiyor — var olmayan
-- ürün bile 404 yerine 500 veriyordu. Teşhisi veren ölçüm bu oldu:
-- var olan ve olmayan slug'ın İKİSİ de 500. Vitrin tarafı
-- düzeltildi, ürün sayfaları açıldı.
--
-- Üstelik kronoloji de taşımayı aklıyor: `onbelleksiz` dağıtımı
-- taşımadan ÖNCE yayına girmişti, yani sayfalar taşıma uygulanmadan
-- da 500 veriyordu. Aradaki boşlukta ürün sayfasını ölçmediğim için
-- fark etmedim.
--
-- Bu migration 32 sarmalayıcıyı (16 çift) çekirdeklere geri bağlıyor.
-- Çekirdekler zaten yerinde: 20261017143359 onlara dokunmadı.
--
-- AYRICA SON ÇİFT: iade talebi de tek gövdeye iniyor
-- (`arc_vitrin_iade_talebi`). İkizleri birebir aynıydı ve yazan,
-- oturum gerektiren bir fonksiyon olduğu için bugüne bırakılmıştı;
-- tests/db/iade-talebi.test.mjs dokuz testle uçtan uca sınıyor
-- (cayma penceresi, ödeme durumu, kalem doğrulaması).
-- Böylece ailede gövdesi iki yerde duran fonksiyon KALMIYOR.

CREATE OR REPLACE FUNCTION public.arc_storefront_collections(p_host text)
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyonlar(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collections()
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyonlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_collection_facets(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_secenekleri(public.arc_storefront_org(p_host), p_collection_slugs, p_menu_groups);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_secenekleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slugs, p_menu_groups);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products(p_host text, p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_urunleri(public.arc_storefront_org(p_host), p_collection_slug, p_menu_groups, p_limit);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products(p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_urunleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slug, p_menu_groups, p_limit);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_sayfasi(public.arc_storefront_org(p_host), p_collection_slugs, p_menu_groups, p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_sayfasi(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slugs, p_menu_groups, p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_deals(p_host text, p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_firsatlar(public.arc_storefront_org(p_host), p_limit);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_deals(p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_firsatlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_discounts(p_host text)
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_indirimler(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_discounts()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_indirimler(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_facets(p_host text)
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_secenekler(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_facets()
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_secenekler(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_product(p_host text, p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun(public.arc_storefront_org(p_host), p_slug);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product(p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_slug);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_product_badges(p_host text)
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_rozetleri(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_badges()
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_rozetleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_product_count(p_host text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_urun_sayisi(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_urun_sayisi(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_product_slugs(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_adresleri(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_slugs(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_adresleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_products(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urunler(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urunler(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_products_page(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_sayfasi(public.arc_storefront_org(p_host), p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products_page(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_sayfasi(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_search_index(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_arama_dizini(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_search_index(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_arama_dizini(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_settings(p_host text)
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_ayarlar(public.arc_storefront_org(p_host));
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_settings()
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_ayarlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;
CREATE OR REPLACE FUNCTION public.arc_storefront_variants(p_host text, p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_varyantlar(public.arc_storefront_org(p_host), p_slug);
$function$
;
CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_variants(p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_varyantlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_slug);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_iade_talebi(p_organization_id uuid, p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.arc_orders%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days integer;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  select * into v_order
  from public.arc_orders o
  join public.organizations org
    on org.id = o.organization_id and org.id = p_organization_id
  where o.order_number = p_order_number
    and o.user_id = v_uid
  limit 1;

  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Ödemesi tamamlanmamış sipariş için iade talebi açılamaz.';
  end if;

  /*
    Cayma süresi: ON DÖRT GÜN. Teslim tarihi kayıtlı değilse sipariş
    tarihinden sayılıyor; müşteri lehine geniş yorum.

    OTUZ GÜN YAZIYORDU ve vitrin on dört gün söz veriyor ("14 gün
    içinde iade", ürün sayfasında). İkisi ayrışınca mağaza, taahhüt
    etmediği bir iadeyi kabul etmek zorunda kalıyordu: on beşinci günde
    gelen talep sisteme giriyor, ekranda "karar bekliyor" diye duruyor
    ve reddetmenin bedeli müşteriye "ama sizin fonksiyonunuz kabul
    etti" dedirtiyor. Kaynak vitrindeki söz (16.10.2026, kurum
    sahibinin kararı).

    Süre MAĞAZA BAŞINA DEĞİL: şu an tek bir sayı. Mağazaya göre
    değişmesi gerekirse arc_store_settings'e bir alan eklenip buradan
    okunur; bugün öyle bir alan yok ve uydurmak yerine sabit kaldı.
  */
  v_days := extract(day from now() - v_order.created_at);

  if v_days > 14 then
    raise exception 'İade süresi dolmuş.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'İade sebebi belirtilmeli.';
  end if;

  /*
    KALEMLER SİPARİŞTEN YENİDEN KURULUYOR, gelen jsonb olduğu gibi
    saklanmıyor. Önce coalesce(p_items,'[]') ile doğrudan yazılıyordu:
    istemci istediği SKU'yu, adedi ve tutarı gönderebiliyordu. Para
    tarafı sipariş toplamıyla sınırlı olduğu için korunuyordu ama
    panelde yanlış kalem ve yanlış tutar görünüyordu; stoğa geri ekleme
    de bu adede güveniyor.

    İstemciden yalnızca HANGİ SKU ve KAÇ ADET bilgisi alınıyor; ad ve
    tutar siparişin kendi kaydından yazılıyor.
  */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'sku', oi.sku,
             'name', oi.product_name,
             /* Adet SİPARİŞTEKİ adetle sınırlı. */
             'quantity', least(k.adet, oi.quantity),
             /* Tutar siparişin birim fiyatından; istemciden alınmıyor. */
             'total', oi.unit_price * least(k.adet, oi.quantity)
           )
         ), '[]'::jsonb)
    into v_items
  from (
    select
      nullif(trim(x.sku), '') as sku,
      /* Eksi, sıfır ve boş adet 1 sayılıyor: kutucuğu işaretleyen
         müşteri en az bir adet iade ediyor demektir. */
      greatest(1, coalesce(x.quantity, 1)) as adet
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(sku text, quantity int)
    where nullif(trim(x.sku), '') is not null
  ) k
  join lateral (
    /* Siparişte olmayan SKU eleniyor. */
    select o.sku, o.product_name, o.unit_price, o.quantity
    from public.arc_order_items o
    where o.order_id = v_order.id
      and o.sku = k.sku
    limit 1
  ) oi on true;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'İade edilecek ürün seçilmedi.';
  end if;

  insert into public.arc_return_requests
    (organization_id, order_id, user_id, items, reason, note)
  values
    (v_order.organization_id, v_order.id, v_uid,
     v_items, trim(p_reason), nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Bu sipariş için zaten açık bir iade talebiniz var.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_return_request(p_host text, p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_iade_talebi(
    public.arc_storefront_org(p_host), p_order_number, p_items, p_reason, p_note);
$function$
;

CREATE OR REPLACE FUNCTION public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_iade_talebi(
    (select id from public.organizations where slug = 'arvoculture' limit 1),
    p_order_number, p_items, p_reason, p_note);
$function$
;

-- İade talebi çekirdeği: kurum kimliğini parametre alıyor, bu yüzden
-- anon ve authenticated'a kapalı. Sarmalayıcılar kiracıyı kendileri
-- çözüyor ve SECURITY DEFINER oldukları için çekirdeği çağırabiliyor.
revoke all on function public.arc_vitrin_iade_talebi(p_organization_id uuid, p_order_number text, p_items jsonb, p_reason text, p_note text) from public, anon, authenticated;
grant execute on function public.arc_vitrin_iade_talebi(p_organization_id uuid, p_order_number text, p_items jsonb, p_reason text, p_note text) to service_role;

-- Sarmalayıcıların yetkileri değişmedi; kural gereği yazılıyor.
revoke all on function public.arc_storefront_return_request(p_host text, p_order_number text, p_items jsonb, p_reason text, p_note text) from public, anon;
grant execute on function public.arc_storefront_return_request(p_host text, p_order_number text, p_items jsonb, p_reason text, p_note text) to authenticated, service_role;

revoke all on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) from public, anon;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to authenticated, service_role;
