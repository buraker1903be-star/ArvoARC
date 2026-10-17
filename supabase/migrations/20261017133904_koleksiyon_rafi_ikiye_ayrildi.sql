-- koleksiyon_rafi_ikiye_ayrildi
--
-- RAF SORGUSU İKİYE AYRILDI: sayfa ve süzgeç seçenekleri.
--
-- 20261017125314 ile gelen fonksiyon ağır koleksiyonlarda anon
-- rolünün süre sınırını aşıyordu; 20261017132710'daki hızlandırma
-- (üyelik EXISTS, küçük grup anahtarı) yetmedi — canlıda giyim
-- gruplarıyla çağrı yine 57014 ile düştü. Supabase'in sınırı
-- `set_config` ile de yükseltilemediği için süre ölçülemedi;
-- tasarım ölçüme dayanmadan, PAHALI PARÇA ÇIKARILARAK düzeltildi.
--
-- Pahalı parça belli: beden listesi. `jsonb_agg(distinct …)` grup
-- başına sıralama gerektiriyor ve koleksiyonun BÜTÜN varyantları
-- üzerinde çalışıyordu (giyim: ~3.250 ürün, ~15.000 varyant).
-- Üstelik iki kez: hem satırlar için hem süzgeç seçenekleri için.
--
-- ÜÇ DEĞİŞİKLİK:
--
-- 1. Sayfa sorgusunda beden toplaması yalnızca SAYFAYA GİREN
--    ürünler için yapılıyor (lateral, en çok 200 satır). Sıralama
--    ve süzme için gereken üç toplam (en düşük fiyat, indirim
--    karşılaştırması, satılabilirlik) ucuz; onlar koleksiyonun
--    tamamında kalıyor.
--
-- 2. Beden SÜZGECİ de toplama değil EXISTS: "bu bedende satılabilir
--    varyant var mı". Sonuç aynı, maliyet grup başına sıralama
--    değil.
--
-- 3. Süzgeç seçenekleri (marka listesi, beden listesi, en yüksek
--    fiyat, süzgeçsiz toplam) AYRI fonksiyona taşındı. Katalog
--    sayfası zaten böyle çalışıyor: vitrin onu beş dakika
--    önbellekte tutuyor, yani her sayfa görüntülemesinde yeniden
--    hesaplanmıyor.
--
-- Sayfa fonksiyonunun dönüş tipi daraldı (facet_* sütunları gitti),
-- bu yüzden önce düşürülüyor. Çağıranı yalnızca vitrin ve vitrin
-- tarafı bu migration ile birlikte güncelleniyor.

drop function if exists public.get_arvoculture_storefront_collection_products_page(text[], text[], integer, integer, text, text, bigint, boolean, boolean, text);
drop function if exists public.arc_storefront_collection_products_page(text, text[], text[], integer, integer, text, text, bigint, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with aday as (
    /*
      UCUZ TOPLAMA. Yalnızca sıralama ve süzme için gereken üç
      toplam: en düşük fiyat, indirim karşılaştırması ve
      satılabilirlik. Beden listesi BURADA YOK — `jsonb_agg(distinct …)`
      koleksiyonun bütün varyantları üzerinde grup başına sıralama
      yapıyor ve ağır kümede anon rolünün süre sınırını aşan parça
      buydu (canlıda 57014). Beden yalnızca sayfaya giren 24 ürün
      için, aşağıda hesaplanıyor.
    */
    select
      p.id,
      p.slug,
      p.updated_at,
      min(v.price) as price,
      min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
      bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available
    from public.arc_products p
    join public.arc_product_variants v
      on v.product_id = p.id and v.organization_id = p.organization_id
    join public.organizations o
      on o.id = p.organization_id and o.slug = 'arvoculture'
    where p.status = 'active'
      /* Koleksiyon üyeliği ürün başına bir kez: JOIN satırları
         varyant × koleksiyon kadar çoğaltıyordu. */
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
      /* Marka süzgeci toplamadan önce: ürün üstverisinde duruyor. */
      and (nullif(p_brand, '') is null or coalesce(p.metadata ->> 'vendor', 'ARVO') = p_brand)
      /*
        BEDEN SÜZGECİ DE EXISTS. Beden listesini toplayıp içinde
        aramak yerine "böyle bir varyant var mı" diye soruyor;
        sonuç aynı, maliyet grup başına sıralama değil.
      */
      and (
        nullif(p_size, '') is null
        or exists (
          select 1
          from public.arc_product_variants v2
          where v2.product_id = p.id
            and v2.organization_id = p.organization_id
            and upper(trim(split_part(v2.title, '/', 2))) = upper(trim(p_size))
            and public.arc_variant_available(v2.stock, v2.allow_backorder, v2.supplier)
        )
      )
    group by p.id
  ),
  puanli as (
    select
      a.*,
      case
        when a.compare_at_price is not null and a.compare_at_price > a.price
          then round(100.0 * (a.compare_at_price - a.price) / a.compare_at_price)::int
        else 0
      end as discount_percent
    from aday a
  ),
  suzulmus as (
    select * from puanli
    where (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
      and (not coalesce(p_only_available, false) or available)
      and (not coalesce(p_only_discounted, false) or discount_percent > 0)
  ),
  sayfa as (
    select s.*, count(*) over () as total_count
    from suzulmus s
    order by
      case when p_sort = 'ucuz'    then s.price            end asc  nulls last,
      case when p_sort = 'pahali'  then s.price            end desc nulls last,
      case when p_sort = 'indirim' then s.discount_percent end desc nulls last,
      case when p_sort = 'yeni'    then s.updated_at       end desc nulls last,
      -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then (case when s.available then 0 else 1 end) end asc  nulls last,
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then s.discount_percent end desc nulls last,
      s.updated_at desc,
      s.slug
    limit  greatest(1, least(coalesce(p_limit, 24), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    sf.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    sf.price,
    sf.compare_at_price,
    sf.available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    /* Beden listesi yalnızca bu sayfanın ürünleri için. */
    coalesce(b.sizes, '[]'::jsonb) as sizes,
    sf.total_count
  from sayfa sf
  join public.arc_products p on p.id = sf.id
  left join lateral (
    select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2)))) as sizes
    from public.arc_product_variants v
    where v.product_id = sf.id
      and v.organization_id = p.organization_id
      and trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
      and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  ) b on true
  order by
    case when p_sort = 'ucuz'    then sf.price            end asc  nulls last,
    case when p_sort = 'pahali'  then sf.price            end desc nulls last,
    case when p_sort = 'indirim' then sf.discount_percent end desc nulls last,
    case when p_sort = 'yeni'    then sf.updated_at       end desc nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then (case when sf.available then 0 else 1 end) end asc  nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then sf.discount_percent end desc nulls last,
    sf.updated_at desc,
    sf.slug;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with aday as (
    /*
      UCUZ TOPLAMA. Yalnızca sıralama ve süzme için gereken üç
      toplam: en düşük fiyat, indirim karşılaştırması ve
      satılabilirlik. Beden listesi BURADA YOK — `jsonb_agg(distinct …)`
      koleksiyonun bütün varyantları üzerinde grup başına sıralama
      yapıyor ve ağır kümede anon rolünün süre sınırını aşan parça
      buydu (canlıda 57014). Beden yalnızca sayfaya giren 24 ürün
      için, aşağıda hesaplanıyor.
    */
    select
      p.id,
      p.slug,
      p.updated_at,
      min(v.price) as price,
      min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
      bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available
    from public.arc_products p
    join public.arc_product_variants v
      on v.product_id = p.id and v.organization_id = p.organization_id
    join public.organizations o
      on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
    where p.status = 'active'
      /* Koleksiyon üyeliği ürün başına bir kez: JOIN satırları
         varyant × koleksiyon kadar çoğaltıyordu. */
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
      /* Marka süzgeci toplamadan önce: ürün üstverisinde duruyor. */
      and (nullif(p_brand, '') is null or coalesce(p.metadata ->> 'vendor', 'ARVO') = p_brand)
      /*
        BEDEN SÜZGECİ DE EXISTS. Beden listesini toplayıp içinde
        aramak yerine "böyle bir varyant var mı" diye soruyor;
        sonuç aynı, maliyet grup başına sıralama değil.
      */
      and (
        nullif(p_size, '') is null
        or exists (
          select 1
          from public.arc_product_variants v2
          where v2.product_id = p.id
            and v2.organization_id = p.organization_id
            and upper(trim(split_part(v2.title, '/', 2))) = upper(trim(p_size))
            and public.arc_variant_available(v2.stock, v2.allow_backorder, v2.supplier)
        )
      )
    group by p.id
  ),
  puanli as (
    select
      a.*,
      case
        when a.compare_at_price is not null and a.compare_at_price > a.price
          then round(100.0 * (a.compare_at_price - a.price) / a.compare_at_price)::int
        else 0
      end as discount_percent
    from aday a
  ),
  suzulmus as (
    select * from puanli
    where (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
      and (not coalesce(p_only_available, false) or available)
      and (not coalesce(p_only_discounted, false) or discount_percent > 0)
  ),
  sayfa as (
    select s.*, count(*) over () as total_count
    from suzulmus s
    order by
      case when p_sort = 'ucuz'    then s.price            end asc  nulls last,
      case when p_sort = 'pahali'  then s.price            end desc nulls last,
      case when p_sort = 'indirim' then s.discount_percent end desc nulls last,
      case when p_sort = 'yeni'    then s.updated_at       end desc nulls last,
      -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then (case when s.available then 0 else 1 end) end asc  nulls last,
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then s.discount_percent end desc nulls last,
      s.updated_at desc,
      s.slug
    limit  greatest(1, least(coalesce(p_limit, 24), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    sf.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    sf.price,
    sf.compare_at_price,
    sf.available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    /* Beden listesi yalnızca bu sayfanın ürünleri için. */
    coalesce(b.sizes, '[]'::jsonb) as sizes,
    sf.total_count
  from sayfa sf
  join public.arc_products p on p.id = sf.id
  left join lateral (
    select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2)))) as sizes
    from public.arc_product_variants v
    where v.product_id = sf.id
      and v.organization_id = p.organization_id
      and trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
      and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  ) b on true
  order by
    case when p_sort = 'ucuz'    then sf.price            end asc  nulls last,
    case when p_sort = 'pahali'  then sf.price            end desc nulls last,
    case when p_sort = 'indirim' then sf.discount_percent end desc nulls last,
    case when p_sort = 'yeni'    then sf.updated_at       end desc nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then (case when sf.available then 0 else 1 end) end asc  nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then sf.discount_percent end desc nulls last,
    sf.updated_at desc,
    sf.slug;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  /*
    SÜZGEÇ SEÇENEKLERİ AYRI ÇAĞRIDA (17.10.2026).

    Marka ve beden listesi koleksiyonun TAMAMI üzerinden
    hesaplanıyor; beden toplaması `jsonb_agg(distinct …)` ile grup
    başına sıralama gerektiriyor ve ağır kümede (giyim ~3.250 ürün,
    ~15.000 varyant) anon rolünün süre sınırını aşıyordu. Sayfa
    sorgusunun içinde dururken her sayfa görüntülemesinde yeniden
    hesaplanıyordu.

    Katalog sayfası zaten böyle çalışıyor: seçenekler
    get_arvoculture_storefront_facets'ten geliyor ve vitrin onu
    beş dakika önbellekte tutuyor. Koleksiyon rafı da aynı düzene
    geçti.

    Seçenekler SÜZGEÇTEN ÖNCEKİ kümeden: "Beden: XL" seçildiğinde
    marka listesi yalnızca XL'i olan markalara inmemeli, yoksa
    müşteri seçimini genişletemez.
  */
  with uyeler as (
    select p.id, p.organization_id,
           coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor
    from public.arc_products p
    join public.organizations o
      on o.id = p.organization_id and o.slug = 'arvoculture'
    where p.status = 'active'
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
  ),
  fiyat as (
    select u.id, min(v.price) as price
    from uyeler u
    join public.arc_product_variants v
      on v.product_id = u.id and v.organization_id = u.organization_id
    group by u.id
  )
  select
    coalesce((select jsonb_agg(distinct u.vendor) from uyeler u where u.vendor <> ''), '[]'::jsonb) as brands,
    coalesce((
      select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
      from uyeler u
      join public.arc_product_variants v
        on v.product_id = u.id and v.organization_id = u.organization_id
      where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    ), '[]'::jsonb) as sizes,
    coalesce((select max(price) from fiyat), 0)::bigint as max_price,
    (select count(*) from uyeler)::bigint as total_count;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_facets(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  /*
    SÜZGEÇ SEÇENEKLERİ AYRI ÇAĞRIDA (17.10.2026).

    Marka ve beden listesi koleksiyonun TAMAMI üzerinden
    hesaplanıyor; beden toplaması `jsonb_agg(distinct …)` ile grup
    başına sıralama gerektiriyor ve ağır kümede (giyim ~3.250 ürün,
    ~15.000 varyant) anon rolünün süre sınırını aşıyordu. Sayfa
    sorgusunun içinde dururken her sayfa görüntülemesinde yeniden
    hesaplanıyordu.

    Katalog sayfası zaten böyle çalışıyor: seçenekler
    get_arvoculture_storefront_facets'ten geliyor ve vitrin onu
    beş dakika önbellekte tutuyor. Koleksiyon rafı da aynı düzene
    geçti.

    Seçenekler SÜZGEÇTEN ÖNCEKİ kümeden: "Beden: XL" seçildiğinde
    marka listesi yalnızca XL'i olan markalara inmemeli, yoksa
    müşteri seçimini genişletemez.
  */
  with uyeler as (
    select p.id, p.organization_id,
           coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor
    from public.arc_products p
    join public.organizations o
      on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
    where p.status = 'active'
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
  ),
  fiyat as (
    select u.id, min(v.price) as price
    from uyeler u
    join public.arc_product_variants v
      on v.product_id = u.id and v.organization_id = u.organization_id
    group by u.id
  )
  select
    coalesce((select jsonb_agg(distinct u.vendor) from uyeler u where u.vendor <> ''), '[]'::jsonb) as brands,
    coalesce((
      select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
      from uyeler u
      join public.arc_product_variants v
        on v.product_id = u.id and v.organization_id = u.organization_id
      where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    ), '[]'::jsonb) as sizes,
    coalesce((select max(price) from fiyat), 0)::bigint as max_price,
    (select count(*) from uyeler)::bigint as total_count;
$function$
;
revoke all on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon, authenticated, service_role;

revoke all on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon, authenticated, service_role;

revoke all on function public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[], p_menu_groups text[]) from public;
grant execute on function public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[], p_menu_groups text[]) to anon, authenticated, service_role;

revoke all on function public.arc_storefront_collection_facets(p_host text, p_collection_slugs text[], p_menu_groups text[]) from public;
grant execute on function public.arc_storefront_collection_facets(p_host text, p_collection_slugs text[], p_menu_groups text[]) to anon, authenticated, service_role;
