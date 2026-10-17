-- koleksiyon_sayfasi_hizlandirma
--
-- RAF FONKSİYONU ANON ROLÜNÜN SÜRE SINIRINI AŞIYORDU.
--
-- 20261017125314 ile gelen sayfalama fonksiyonu SQL editöründe
-- (postgres rolü, sınırsız süre) doğru çalışıyor: 'erkek' için 200
-- satır dönüyor. Ama vitrin anon anahtarıyla çağırıyor ve Supabase
-- anon rolüne kısa bir statement_timeout veriyor. Canlıda ölçüldü
-- (17.10.2026): giyim gruplarıyla yapılan çağrı 3 saniyede
--
--   ERROR: 57014 canceling statement due to statement timeout
--
-- ile düştü. Vitrin tarafında bu hata rpcOrEmpty tarafından
-- yutuluyor, yani müşteri boş raf görüyordu: /koleksiyon/erkek,
-- /kadin, /erkek-t-shirt, /giyim ve /parfum "0 ürün". Küçük
-- koleksiyonlar (kozmetik 13, bakım 90, fırsatlar 17) süreyi
-- aşmadığı için çalışıyordu — gözlemdeki dağılım tam buydu.
--
-- İKİ DEĞİŞİKLİK:
--
-- 1. Koleksiyon üyeliği JOIN değil EXISTS. Eski hâlde satırlar
--    VARYANT × KOLEKSİYON kadar çoğalıyordu (bir ürün hem
--    "erkek-t-shirt" hem "erkek" koleksiyonunda olabiliyor) ve
--    group by onları geri tekilleştiriyordu. EXISTS üyeliği ürün
--    başına bir kez sınıyor; ana sorgu artık katalog sayfası
--    fonksiyonuyla aynı ağırlıkta (ürün × varyant) ve o fonksiyon
--    3.407 ürünle süreyi aşmıyor.
--
-- 2. Grup anahtarı yalnızca birincil anahtar. Önceden description
--    ve metadata da anahtarın içindeydi; ikisi de uzun değerler.
--    PostgreSQL birincil anahtara göre gruplandığında tablonun
--    öteki sütunlarını işlevsel bağımlı sayıyor
--    (arc_products_pkey = (id)).
--
-- Dönüş tipi ve parametreler aynı; vitrin tarafı değişmiyor.

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint, facet_brands jsonb, facet_sizes jsonb, facet_max_price bigint, collection_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    p.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
      as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes,
    p.updated_at
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
    /*
      KOLEKSİYON ÜYELİĞİ JOIN DEĞİL EXISTS (17.10.2026 hızlandırması).

      İlk sürüm arc_collection_products ve arc_collections'a JOIN
      atıyordu. Bir ürün birden çok koleksiyonda olduğu için satırlar
      VARYANT × KOLEKSİYON kadar çoğalıyor, group by da onları geri
      tekilleştiriyordu. Ağır kümede bu, anon rolünün süre sınırını
      (3 sn) aşıyordu: canlıda giyim grupları 57014 ile düştü ve
      vitrin boş raf gösterdi (rpcOrEmpty hatayı yutuyor).

      EXISTS üyeliği ürün başına bir kez sınıyor; ana sorgu yine
      yalnızca ürün × varyant kadar satır üretiyor — yani katalog
      sayfası fonksiyonuyla aynı ağırlıkta. Tekilleştirme de artık
      group by'ın işi değil.
    */
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
  /*
    GRUP ANAHTARI YALNIZCA BİRİNCİL ANAHTAR. Önceden description ve
    metadata da anahtarın içindeydi; ikisi de uzun değerler ve her
    satırda karşılaştırılıyordu. PostgreSQL, birincil anahtara
    (arc_products_pkey) göre gruplandığında tablonun öteki
    sütunlarını işlevsel bağımlı sayıyor.
  */
  group by p.id
),
scored as (
  select
    b.*,
    case
      when b.compare_at_price is not null and b.compare_at_price > b.price
        then round(100.0 * (b.compare_at_price - b.price) / b.compare_at_price)::int
      else 0
    end as discount_percent
  from base b
),
/*
  SÜZGEÇ SEÇENEKLERİ KOLEKSİYONUN TAMAMINDAN. Vitrin bunları
  süzülmüş listeden türetiyordu; "Beden: XL" seçildiğinde marka
  listesi yalnızca XL'i olan markalara iniyordu ve müşteri seçimini
  genişletemiyordu. Burada süzgeçten ÖNCEKİ küme kullanılıyor.
*/
yuzeyler as (
  select
    coalesce(jsonb_agg(distinct s.vendor) filter (where s.vendor <> ''), '[]'::jsonb) as brands,
    coalesce(jsonb_agg(distinct beden.deger) filter (where beden.deger is not null), '[]'::jsonb) as sizes,
    coalesce(max(s.price), 0)::bigint as max_price,
    count(distinct s.slug)::bigint as collection_total
  from scored s
  left join lateral jsonb_array_elements_text(s.sizes) as beden(deger) on true
),
narrowed as (
  select * from scored
  where (nullif(p_brand, '') is null or vendor = p_brand)
    and (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
    and (not coalesce(p_only_available, false) or available)
    and (nullif(p_size, '') is null or sizes ? upper(p_size))
    and (not coalesce(p_only_discounted, false) or discount_percent > 0)
)
select
  n.slug, n.name, n.subtitle, n.vendor, n.product_type,
  n.price, n.compare_at_price, n.available, n.image_paths, n.sizes,
  count(*) over () as total_count,
  y.brands as facet_brands,
  y.sizes as facet_sizes,
  y.max_price as facet_max_price,
  y.collection_total
from narrowed n cross join yuzeyler y
order by
  case when p_sort = 'ucuz'    then n.price            end asc  nulls last,
  case when p_sort = 'pahali'  then n.price            end desc nulls last,
  case when p_sort = 'indirim' then n.discount_percent end desc nulls last,
  case when p_sort = 'yeni'    then n.updated_at       end desc nulls last,
  -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then (case when n.available then 0 else 1 end) end asc  nulls last,
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then n.discount_percent end desc nulls last,
  n.updated_at desc,
  n.slug
limit  greatest(1, least(coalesce(p_limit, 24), 200))
offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint, facet_brands jsonb, facet_sizes jsonb, facet_max_price bigint, collection_total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    p.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
      as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes,
    p.updated_at
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
    /*
      KOLEKSİYON ÜYELİĞİ JOIN DEĞİL EXISTS (17.10.2026 hızlandırması).

      İlk sürüm arc_collection_products ve arc_collections'a JOIN
      atıyordu. Bir ürün birden çok koleksiyonda olduğu için satırlar
      VARYANT × KOLEKSİYON kadar çoğalıyor, group by da onları geri
      tekilleştiriyordu. Ağır kümede bu, anon rolünün süre sınırını
      (3 sn) aşıyordu: canlıda giyim grupları 57014 ile düştü ve
      vitrin boş raf gösterdi (rpcOrEmpty hatayı yutuyor).

      EXISTS üyeliği ürün başına bir kez sınıyor; ana sorgu yine
      yalnızca ürün × varyant kadar satır üretiyor — yani katalog
      sayfası fonksiyonuyla aynı ağırlıkta. Tekilleştirme de artık
      group by'ın işi değil.
    */
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
  /*
    GRUP ANAHTARI YALNIZCA BİRİNCİL ANAHTAR. Önceden description ve
    metadata da anahtarın içindeydi; ikisi de uzun değerler ve her
    satırda karşılaştırılıyordu. PostgreSQL, birincil anahtara
    (arc_products_pkey) göre gruplandığında tablonun öteki
    sütunlarını işlevsel bağımlı sayıyor.
  */
  group by p.id
),
scored as (
  select
    b.*,
    case
      when b.compare_at_price is not null and b.compare_at_price > b.price
        then round(100.0 * (b.compare_at_price - b.price) / b.compare_at_price)::int
      else 0
    end as discount_percent
  from base b
),
/*
  SÜZGEÇ SEÇENEKLERİ KOLEKSİYONUN TAMAMINDAN. Vitrin bunları
  süzülmüş listeden türetiyordu; "Beden: XL" seçildiğinde marka
  listesi yalnızca XL'i olan markalara iniyordu ve müşteri seçimini
  genişletemiyordu. Burada süzgeçten ÖNCEKİ küme kullanılıyor.
*/
yuzeyler as (
  select
    coalesce(jsonb_agg(distinct s.vendor) filter (where s.vendor <> ''), '[]'::jsonb) as brands,
    coalesce(jsonb_agg(distinct beden.deger) filter (where beden.deger is not null), '[]'::jsonb) as sizes,
    coalesce(max(s.price), 0)::bigint as max_price,
    count(distinct s.slug)::bigint as collection_total
  from scored s
  left join lateral jsonb_array_elements_text(s.sizes) as beden(deger) on true
),
narrowed as (
  select * from scored
  where (nullif(p_brand, '') is null or vendor = p_brand)
    and (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
    and (not coalesce(p_only_available, false) or available)
    and (nullif(p_size, '') is null or sizes ? upper(p_size))
    and (not coalesce(p_only_discounted, false) or discount_percent > 0)
)
select
  n.slug, n.name, n.subtitle, n.vendor, n.product_type,
  n.price, n.compare_at_price, n.available, n.image_paths, n.sizes,
  count(*) over () as total_count,
  y.brands as facet_brands,
  y.sizes as facet_sizes,
  y.max_price as facet_max_price,
  y.collection_total
from narrowed n cross join yuzeyler y
order by
  case when p_sort = 'ucuz'    then n.price            end asc  nulls last,
  case when p_sort = 'pahali'  then n.price            end desc nulls last,
  case when p_sort = 'indirim' then n.discount_percent end desc nulls last,
  case when p_sort = 'yeni'    then n.updated_at       end desc nulls last,
  -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then (case when n.available then 0 else 1 end) end asc  nulls last,
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then n.discount_percent end desc nulls last,
  n.updated_at desc,
  n.slug
limit  greatest(1, least(coalesce(p_limit, 24), 200))
offset greatest(0, coalesce(p_offset, 0));
$function$
;
