create or replace function public.get_arvoculture_storefront_products(p_limit integer default 24)
returns table(slug text,name text,description text,subtitle text,vendor text,product_type text,price bigint,compare_at_price bigint,available boolean,image_paths jsonb)
language sql stable security definer set search_path=''
as $$
  select p.slug,p.name,p.description,
    coalesce(nullif(p.metadata->>'subtitle',''),left(regexp_replace(coalesce(p.description,''),'<[^>]*>','','g'),140)) as subtitle,
    coalesce(p.metadata->>'vendor','ARVO') as vendor,
    coalesce(p.metadata->>'product_type','') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter(where v.compare_at_price>v.price) as compare_at_price,
    bool_or(v.stock>0 or v.allow_backorder) as available,
    coalesce(p.metadata->'image_paths','[]'::jsonb) as image_paths
  from public.arc_products p
  join public.arc_product_variants v on v.product_id=p.id and v.organization_id=p.organization_id
  join public.organizations o on o.id=p.organization_id and o.slug='arvoculture'
  where p.status='active'
  group by p.id,p.slug,p.name,p.description,p.metadata,p.updated_at
  order by p.updated_at desc
  limit greatest(1,least(coalesce(p_limit,24),100));
$$;

revoke all on function public.get_arvoculture_storefront_products(integer) from public;
grant execute on function public.get_arvoculture_storefront_products(integer) to anon,authenticated;
