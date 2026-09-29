-- VİTRİN ARTIK KİRACIYA GÖRE: alan adından kurum çözülüyor.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- PANEL ÇOK KİRACILIYDI, VİTRİN DEĞİLDİ. Panelde her sorgu
-- organization_id ile sınırlı ve kiracı oturumdaki üyelikten
-- çözülüyor (arc_resolve_commerce_tenant). Müşterinin gördüğü tarafta
-- ise 19 fonksiyon tek kiracıyı SABİT yazıyordu:
--
--   join public.organizations o on o.id = p.organization_id
--    and o.slug = 'arvoculture'
--
-- Sonuç: panelden ikinci bir salon açılabiliyor, ürününü girip
-- stoğunu yönetebiliyor ama MAĞAZASI OLMUYOR — müşteri tarafındaki
-- her fonksiyon yalnızca tek salonun verisini okuyor.
--
-- EKLEYEREK YAZILIYOR, DEĞİŞTİREREK DEĞİL. Eski get_arvoculture_*
-- fonksiyonları yerinde duruyor; canlı mağaza bu dosyadan hiç
-- etkilenmiyor. Vitrin uygulaması hazır olduğunda yeni adlara geçer,
-- eskiler ondan sonra düşürülür.
--
-- ÇÖZÜM ÖLÇÜTÜ ALAN ADI, çünkü müşteri tarafında oturum yok: kiracıyı
-- yalnızca isteğin geldiği host söyleyebilir.

-- ---------- Çözücü ----------
--
-- YALNIZCA DOĞRULANMIŞ ÖZEL ALAN ADI VE PLATFORM ALT ALAN ADI.
-- İkisi de büyük/küçük harf duyarsız TEKİL indeksle korunuyor
-- (arc_store_settings_custom_domain_unique_idx,
--  arc_store_settings_platform_subdomain_unique_idx), yani iki salon
-- aynı adresi sahiplenemiyor.
--
-- storefront_url BİLEREK KULLANILMIYOR: o sütunda tekillik yok. Bir
-- salon oraya başkasının alan adını yazıp o adrese gelen isteği
-- kendine çekebilirdi — çok kiracılı bir sistemde en sessiz kaçak bu
-- olurdu. Bedeli şu: bir salonun mağazasının açılması için ya özel
-- alan adının DOĞRULANMIŞ olması ya alt alan adının atanmış olması
-- gerekiyor.
--
-- Lisans/abonelik denetimi burada YOK ve bu bilerek: "mağaza kapalı"
-- kararını hangi alanın verdiği (organization.status, commerce
-- modülü, arc lisansı) ayrı bir karar ve yanlış bağlanırsa çalışan
-- bir mağazayı kapatır. Çözücü yalnızca "bu adres kimin" sorusunu
-- yanıtlıyor.

create or replace function public.arc_storefront_org(p_host text)
 returns uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with istek as (
    /* Şema, port ve yol düşürülüp küçük harfe iniliyor: çağıran
       "https://magaza.com/urun" da yollasa aynı sonuca varmalı. */
    select lower(regexp_replace(regexp_replace(coalesce(p_host, ''), '^[a-z]+://', ''), '[:/?#].*$', '')) as host
  ),
  adaylar as (
    /* www'lu ve www'suz biçim birlikte aranıyor; ikisi aynı mağaza. */
    select host, case when host like 'www.%' then substring(host from 5) else host end as kok from istek
  )
  select s.organization_id
  from public.arc_store_settings s, adaylar a
  where a.kok <> ''
    and (
      (s.domain_verified_at is not null
        and s.custom_domain is not null
        and lower(s.custom_domain) in (a.host, a.kok))
      or (s.platform_subdomain is not null
        and lower(s.platform_subdomain) || '.shop.arvo-os.com' in (a.host, a.kok))
    )
  limit 1
$function$;

comment on function public.arc_storefront_org(text) is
  'Vitrin isteğinin host''undan kurumu çözer: doğrulanmış özel alan adı ya da platform alt alan adı.';

-- Postgres yeni fonksiyonu PUBLIC'e (anon dahil) açık oluşturuyor;
-- 19.09.2026'da ARC'ta bu satırlar unutulduğu için siparişi "ödendi"
-- yapan fonksiyon herkese açık kalmıştı. Vitrin anonim çalışıyor,
-- bu yüzden anon'a BİLEREK açık.
revoke all on function public.arc_storefront_org(text) from public;
grant execute on function public.arc_storefront_org(text) to anon;
grant execute on function public.arc_storefront_org(text) to authenticated;
grant execute on function public.arc_storefront_org(text) to service_role;

-- ---------- Vitrin okuma fonksiyonları ----------
--
-- Gövdeler eskilerinden MAKİNEYLE üretildi: tek değişiklik
-- "o.slug = 'arvoculture'" yerine "o.id = arc_storefront_org(p_host)"
-- ve imzanın başına p_host. Elle yeniden yazmak kopyalama hatası
-- demekti; on dört fonksiyonun tamamı aynı dönüşümden geçti.
create or replace function public.arc_storefront_collection_products(p_host text, p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and (v.stock > 0 or v.allow_backorder)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = public.arc_storefront_org(p_host)
  join public.arc_collection_products cp
    on cp.product_id = p.id
  join public.arc_collections c
    on c.id = cp.collection_id
   and c.status = 'active'
  where p.status = 'active'
    and (
      (p_collection_slug is not null and c.slug = p_collection_slug)
      or (
        p_menu_groups is not null
        and (c.metadata ->> 'menu_group') = any (p_menu_groups)
      )
    )
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 5000));
$function$;

create or replace function public.arc_storefront_collections(p_host text)
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    c.title,
    c.slug,
    c.description,
    coalesce(c.metadata ->> 'menu_group', '') as menu_group,
    coalesce(c.metadata ->> 'parent', '') as parent,
    count(distinct p.id)::integer as product_count
  from public.arc_collections c
  join public.organizations o
    on o.id = c.organization_id
   and o.id = public.arc_storefront_org(p_host)
  left join public.arc_collection_products cp
    on cp.collection_id = c.id
  left join public.arc_products p
    on p.id = cp.product_id
   and p.status = 'active'
  where c.status = 'active'
  group by c.id, c.title, c.slug, c.description, c.metadata
  -- Boş koleksiyon menüde yer kaplamasın.
  having count(distinct p.id) > 0
  order by count(distinct p.id) desc;
$function$;

create or replace function public.arc_storefront_deals(p_host text, p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata
  -- Yalnızca gerçekten indirimli ve stokta olanlar.
  having min(v.compare_at_price) filter (where v.compare_at_price > v.price)
         is not null
     and bool_or(v.stock > 0 or v.allow_backorder)
  -- En yüksek indirim oranı başta.
  order by
    (
      min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      - min(v.price)
    )::numeric
    / nullif(
        min(v.compare_at_price) filter (where v.compare_at_price > v.price),
        0
      ) desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$function$;

create or replace function public.arc_storefront_discounts(p_host text)
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select d.id,d.name,d.code,d.discount_type,d.value,d.minimum_subtotal,d.combinable,
    coalesce(nullif(d.metadata ->> 'badge', ''), d.name) as badge
  from public.arc_discounts d
  join public.organizations o on o.id=d.organization_id
  where o.id = public.arc_storefront_org(p_host) and d.status='active'
    and (d.starts_at is null or d.starts_at<=now())
    and (d.ends_at is null or d.ends_at>now())
    and (d.usage_limit is null or d.usage_count<d.usage_limit)
  order by d.code nulls first,d.created_at;
$function$;

create or replace function public.arc_storefront_facets(p_host text)
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
with base as (
  select
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    min(v.price) as price,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
  group by p.id, p.metadata
)
select
  (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
     from (select distinct vendor as v from base where vendor <> '') b1) as brands,
  (select coalesce(jsonb_agg(s order by s), '[]'::jsonb)
     from (select distinct e as s
             from base, lateral jsonb_array_elements_text(base.sizes) e) b2) as sizes,
  (select coalesce(max(price), 0) from base) as max_price,
  (select count(*) from base) as total_count;
$function$;

create or replace function public.arc_storefront_product(p_host text, p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
    bool_or(v.stock > 0 or v.allow_backorder) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$;

create or replace function public.arc_storefront_product_badges(p_host text)
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug,
    nullif(p.metadata ->> 'badge', '') as badge,
    coalesce(nullif(p.metadata ->> 'badge_tone', ''), 'green') as badge_tone,
    exists (
      select 1
      from public.arc_collection_products cp
      join public.arc_collections c
        on c.id = cp.collection_id
       and c.organization_id = cp.organization_id
      where cp.organization_id = p.organization_id
        and cp.product_id = p.id
        and c.status = 'active'
        and c.title = 'Çok Satanlar'
    ) as is_best_seller,
    coalesce((
      select max(
        round(
          (1 - v.price::numeric / nullif(v.compare_at_price, 0)::numeric) * 100
        )
      )::integer
      from public.arc_product_variants v
      where v.organization_id = p.organization_id
        and v.product_id = p.id
        and v.compare_at_price > v.price
        and v.price >= 0
    ), 0) as discount_percent
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id
   and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active';
$function$;

create or replace function public.arc_storefront_product_count(p_host text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select count(distinct p.id)::integer
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active';
$function$;

create or replace function public.arc_storefront_product_slugs(p_host text, p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
    /*
      Varyantı olmayan ürünün sayfası da yok; sitemap'e girmemeli.
      Ama varyantları toplamaya gerek yok — varlık kontrolü yeter.
      Asıl fonksiyon burada group by yapıp fiyat ve beden
      hesaplıyor, sitemap ise hiçbirini kullanmıyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
    )
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20000), 50000));
$function$;

create or replace function public.arc_storefront_products(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug, p.name, p.description,
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
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

create or replace function public.arc_storefront_products_page(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
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
narrowed as (
  select * from scored
  where (nullif(p_brand, '') is null or vendor = p_brand)
    and (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
    and (not coalesce(p_only_available, false) or available)
    and (nullif(p_size, '') is null or sizes ? upper(p_size))
    and (not coalesce(p_only_discounted, false) or discount_percent > 0)
)
select
  slug, name, subtitle, vendor, product_type,
  price, compare_at_price, available, image_paths, sizes,
  count(*) over () as total_count
from narrowed
order by
  case when p_sort = 'ucuz'    then price            end asc  nulls last,
  case when p_sort = 'pahali'  then price            end desc nulls last,
  case when p_sort = 'indirim' then discount_percent end desc nulls last,
  case when p_sort = 'yeni'    then updated_at       end desc nulls last,
  -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then (case when available then 0 else 1 end) end asc  nulls last,
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then discount_percent end desc nulls last,
  updated_at desc
limit  greatest(1, least(coalesce(p_limit, 24), 200))
offset greatest(0, coalesce(p_offset, 0));
$function$;

create or replace function public.arc_storefront_search_index(p_host text, p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    p.slug,
    p.name,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    /*
      Yalnızca ilk görsel. Arama sonucu tek küçük resim gösteriyor
      ama katalog fonksiyonu her ürünün tüm galerisini taşıyordu —
      3.400 ürün için tek başına 1,7 MB.
    */
    (p.metadata -> 'image_paths' ->> 0) as image_path
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.metadata, p.updated_at
  /*
    Stokta olmayan ürün aramada zaten gösterilmiyordu; süzme
    uygulama tarafında yapılıyordu. Veritabanında yapmak hem
    satır sayısını hem taşınan veriyi düşürüyor.
  */
  having bool_or(
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  )
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20000), 50000));
$function$;

create or replace function public.arc_storefront_settings(p_host text)
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3)
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.id = public.arc_storefront_org(p_host)
  limit 1;
$function$;

create or replace function public.arc_storefront_variants(p_host text, p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
  with hesaplanan as (
    select
      v.sku as v_sku,
      coalesce(nullif(trim(v.title), ''), v.sku) as v_title,
      /*
        Nitelikten okuma. order by ile SABİT: aynı varyantta hem
        "Renk" hem "Color" bulunursa sonuç turdan tura değişmesin.
      */
      coalesce(
        (select n.value from jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) n
          where lower(n.key) in ('renk', 'renkler', 'color', 'colour')
            and nullif(trim(n.value), '') is not null
          order by n.key limit 1),
        nullif(trim(split_part(coalesce(v.title, ''), '/', 1)), '')
      ) as v_color,
      coalesce(
        (select n.value from jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) n
          where lower(n.key) in ('beden', 'size', 'numara', 'ölçü', 'olcu')
            and nullif(trim(n.value), '') is not null
          order by n.key limit 1),
        nullif(trim(split_part(coalesce(v.title, ''), '/', 2)), '')
      ) as v_size,
      v.price as v_price,
      v.compare_at_price as v_compare,
      v.stock as v_stock,
      public.arc_variant_available(v.stock, v.allow_backorder, v.supplier) as v_available,
      /*
        Ürünün galerisinde OLMAYAN yol dönmüyor: elle yazılmış ya da
        görseli silinmiş varyant, vitrinde kırık resim demekti.
      */
      case
        when v.image_path is not null
         and coalesce(p.metadata -> 'image_paths', '[]'::jsonb) ? v.image_path
        then v.image_path
      end as v_image_path,
      coalesce(v.attributes, '{}'::jsonb) as v_attributes
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    join public.organizations o
      on o.id = p.organization_id
     and o.id = public.arc_storefront_org(p_host)
    where p.status = 'active'
      and p.slug = p_slug
      and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  )
  select
    h.v_sku, h.v_title, h.v_color, h.v_size, h.v_price,
    h.v_compare, h.v_stock, h.v_available, h.v_image_path, h.v_attributes
  from hesaplanan h
  /* Beden sıralaması artık TÜRETİLMİŞ bedene bakıyor; eskiden başlığı
     ikinci kez bölüyordu ve nitelikten gelen beden sıralanamazdı. */
  order by
    case upper(trim(coalesce(h.v_size, '')))
      when 'XXS' then 1 when 'XS' then 2 when 'S' then 3
      when 'M' then 4 when 'L' then 5 when 'XL' then 6
      when '2XL' then 7 when 'XXL' then 7
      when '3XL' then 8 when '4XL' then 9
      else 50
    end,
    h.v_price,
    h.v_sku
  limit 60;
$function$;

revoke all on function public.arc_storefront_collection_products(text, text, text[], integer) from public;
grant execute on function public.arc_storefront_collection_products(text, text, text[], integer) to anon;
grant execute on function public.arc_storefront_collection_products(text, text, text[], integer) to authenticated;
grant execute on function public.arc_storefront_collection_products(text, text, text[], integer) to service_role;
revoke all on function public.arc_storefront_collections(text) from public;
grant execute on function public.arc_storefront_collections(text) to anon;
grant execute on function public.arc_storefront_collections(text) to authenticated;
grant execute on function public.arc_storefront_collections(text) to service_role;
revoke all on function public.arc_storefront_deals(text, integer) from public;
grant execute on function public.arc_storefront_deals(text, integer) to anon;
grant execute on function public.arc_storefront_deals(text, integer) to authenticated;
grant execute on function public.arc_storefront_deals(text, integer) to service_role;
revoke all on function public.arc_storefront_discounts(text) from public;
grant execute on function public.arc_storefront_discounts(text) to anon;
grant execute on function public.arc_storefront_discounts(text) to authenticated;
grant execute on function public.arc_storefront_discounts(text) to service_role;
revoke all on function public.arc_storefront_facets(text) from public;
grant execute on function public.arc_storefront_facets(text) to anon;
grant execute on function public.arc_storefront_facets(text) to authenticated;
grant execute on function public.arc_storefront_facets(text) to service_role;
revoke all on function public.arc_storefront_product(text, text) from public;
grant execute on function public.arc_storefront_product(text, text) to anon;
grant execute on function public.arc_storefront_product(text, text) to authenticated;
grant execute on function public.arc_storefront_product(text, text) to service_role;
revoke all on function public.arc_storefront_product_badges(text) from public;
grant execute on function public.arc_storefront_product_badges(text) to anon;
grant execute on function public.arc_storefront_product_badges(text) to authenticated;
grant execute on function public.arc_storefront_product_badges(text) to service_role;
revoke all on function public.arc_storefront_product_count(text) from public;
grant execute on function public.arc_storefront_product_count(text) to anon;
grant execute on function public.arc_storefront_product_count(text) to authenticated;
grant execute on function public.arc_storefront_product_count(text) to service_role;
revoke all on function public.arc_storefront_product_slugs(text, integer) from public;
grant execute on function public.arc_storefront_product_slugs(text, integer) to anon;
grant execute on function public.arc_storefront_product_slugs(text, integer) to authenticated;
grant execute on function public.arc_storefront_product_slugs(text, integer) to service_role;
revoke all on function public.arc_storefront_products(text, integer, integer) from public;
grant execute on function public.arc_storefront_products(text, integer, integer) to anon;
grant execute on function public.arc_storefront_products(text, integer, integer) to authenticated;
grant execute on function public.arc_storefront_products(text, integer, integer) to service_role;
revoke all on function public.arc_storefront_products_page(text, integer, integer, text, text, bigint, boolean, boolean, text) from public;
grant execute on function public.arc_storefront_products_page(text, integer, integer, text, text, bigint, boolean, boolean, text) to anon;
grant execute on function public.arc_storefront_products_page(text, integer, integer, text, text, bigint, boolean, boolean, text) to authenticated;
grant execute on function public.arc_storefront_products_page(text, integer, integer, text, text, bigint, boolean, boolean, text) to service_role;
revoke all on function public.arc_storefront_search_index(text, integer) from public;
grant execute on function public.arc_storefront_search_index(text, integer) to anon;
grant execute on function public.arc_storefront_search_index(text, integer) to authenticated;
grant execute on function public.arc_storefront_search_index(text, integer) to service_role;
revoke all on function public.arc_storefront_settings(text) from public;
grant execute on function public.arc_storefront_settings(text) to anon;
grant execute on function public.arc_storefront_settings(text) to authenticated;
grant execute on function public.arc_storefront_settings(text) to service_role;
revoke all on function public.arc_storefront_variants(text, text) from public;
grant execute on function public.arc_storefront_variants(text, text) to anon;
grant execute on function public.arc_storefront_variants(text, text) to authenticated;
grant execute on function public.arc_storefront_variants(text, text) to service_role;

-- 14 fonksiyon
