-- ============================================================
-- Ürün özelliklerini vitrine açma
--
-- Tedarikçi açıklamaları HTML tablosu olarak geliyor ve
-- düzleştirilince okunmaz hâle geliyordu. İçe aktarma artık
-- tabloları ayrıştırıp `metadata.specs` ve `metadata.size_guide`
-- altında saklıyor.
--
-- Vitrin RPC'si metadata döndürmediği için bu alanlar sayfaya
-- ulaşamıyordu; iki sütun ekleniyor.
-- ============================================================

drop function if exists public.get_arvoculture_storefront_products(integer, integer);

create or replace function public.get_arvoculture_storefront_products(
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  slug text,
  name text,
  description text,
  subtitle text,
  vendor text,
  product_type text,
  price bigint,
  compare_at_price bigint,
  available boolean,
  image_paths jsonb,
  specs jsonb,
  size_guide jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
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
   and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_arvoculture_storefront_products(integer, integer)
  from public;
grant execute on function public.get_arvoculture_storefront_products(integer, integer)
  to anon, authenticated;

-- Tek ürün fonksiyonu da aynı alanları döndürmeli.
drop function if exists public.get_arvoculture_storefront_product(text);

create or replace function public.get_arvoculture_storefront_product(p_slug text)
returns table (
  slug text,
  name text,
  description text,
  subtitle text,
  vendor text,
  product_type text,
  price bigint,
  compare_at_price bigint,
  available boolean,
  image_paths jsonb,
  specs jsonb,
  size_guide jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
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
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$$;

revoke all on function public.get_arvoculture_storefront_product(text) from public;
grant execute on function public.get_arvoculture_storefront_product(text)
  to anon, authenticated;
