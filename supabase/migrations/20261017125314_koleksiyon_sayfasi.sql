-- koleksiyon_sayfasi
--
-- KOLEKSİYON SAYFALARI 200 ÜRÜNDE KESİLİYORDU.
--
-- Vitrin koleksiyon raflarını get_arvoculture_storefront_collection_products
-- ile çekiyor, listeyi BELLEKTE süzüyor, sıralıyor ve 24'erlik sayfalara
-- bölüyordu. Çağrı 200 satırla sınırlı (vitrin: products.ts
-- `Math.min(200, limit)`), fonksiyonun kendisinde de `p_offset` yok —
-- yani 200'den sonrasına ulaşmanın yolu yoktu.
--
-- 17.10.2026'da canlıda ölçüldü: /koleksiyon/erkek, /kadin ve /cocuk
-- üçü de tam "200 ürün" diyor. Katalogda 3.407 aktif ürün var ve
-- kozmetik + bakım + parfüm + aksesuar toplamı 181; yani giyimin
-- yaklaşık 3.200 ürününün çok büyük kısmına KOLEKSİYONDAN
-- ulaşılamıyordu. Arama buluyor, /koleksiyon/tumu sayfalıyor, ama
-- kategoriden gezen müşteri 200 üründen sonrasını göremiyordu.
-- Kesilme sessizdi: sayfa "200 ürün" diyor, eksiği söylemiyor.
--
-- Bu fonksiyon, katalog sayfasının (get_arvoculture_storefront_products_page)
-- koleksiyon kısıtlı ikizi: süzme, sıralama, sayfalama ve toplam sayım
-- VERİTABANINDA yapılıyor. Böylece
--
--   * sayfa başına yalnızca 24 satır taşınıyor (200 değil),
--   * toplam sayı gerçek toplam oluyor,
--   * vitrindeki bellek içi süzme/sıralama kodu — katalog yolundaki
--     SQL'in ikizi — ortadan kalkıyor.
--
-- p_collection_slugs ÇOĞUL: birleştirilen koleksiyonlar (ör. erkek
-- parfümü iki ayrı kaynaktan geliyor) tek çağrıda birleşiyor ve
-- tekilleştirme group by ile veritabanında yapılıyor. Vitrin bunu
-- üç ayrı sorgu atıp bellekte birleştiriyordu.
--
-- SÜZGEÇ SEÇENEKLERİ (facet_*) süzgeçten ÖNCEKİ kümeden geliyor.
-- Vitrin bunları süzülmüş listeden türetiyordu: "Beden: XL"
-- seçildiğinde marka listesi yalnızca XL'i olan markalara iniyor ve
-- müşteri seçimini genişletemiyordu.

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
  join public.arc_collection_products cp
    on cp.product_id = p.id and cp.organization_id = p.organization_id
  join public.arc_collections c
    on c.id = cp.collection_id
   and c.organization_id = p.organization_id
   and c.status = 'active'
  where p.status = 'active'
    and (
      (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
      or (
        p_menu_groups is not null
        and (c.metadata ->> 'menu_group') = any (p_menu_groups)
      )
    )
  /*
    ÜRÜN BAŞINA TEK SATIR. Bir ürün birden çok koleksiyonda olabilir
    (birleştirilen koleksiyonlarda bu kural): group by ürünü
    tekilleştiriyor, yoksa raf aynı ürünü iki kez gösterirdi.
  */
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
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
  join public.arc_collection_products cp
    on cp.product_id = p.id and cp.organization_id = p.organization_id
  join public.arc_collections c
    on c.id = cp.collection_id
   and c.organization_id = p.organization_id
   and c.status = 'active'
  where p.status = 'active'
    and (
      (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
      or (
        p_menu_groups is not null
        and (c.metadata ->> 'menu_group') = any (p_menu_groups)
      )
    )
  /*
    ÜRÜN BAŞINA TEK SATIR. Bir ürün birden çok koleksiyonda olabilir
    (birleştirilen koleksiyonlarda bu kural): group by ürünü
    tekilleştiriyor, yoksa raf aynı ürünü iki kez gösterirdi.
  */
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
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
revoke all on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon;
grant execute on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to authenticated;
grant execute on function public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;

revoke all on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon;
grant execute on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to authenticated;
grant execute on function public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;
