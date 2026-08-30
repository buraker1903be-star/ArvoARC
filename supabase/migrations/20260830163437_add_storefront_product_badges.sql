create or replace function public.get_arvoculture_storefront_product_badges()
returns table(slug text,badge text,badge_tone text,is_best_seller boolean,discount_percent integer)
language sql stable security definer set search_path = ''
as $function$
  select p.slug,
    nullif(p.metadata ->> 'badge', '') as badge,
    coalesce(nullif(p.metadata ->> 'badge_tone', ''), 'green') as badge_tone,
    exists (
      select 1 from public.arc_collection_products cp
      join public.arc_collections c on c.id=cp.collection_id and c.organization_id=cp.organization_id
      where cp.organization_id=p.organization_id and cp.product_id=p.id
        and c.status='active' and c.title='Çok Satanlar'
    ) as is_best_seller,
    coalesce((
      select max(round((1-v.price::numeric/nullif(v.compare_at_price,0)::numeric)*100))::integer
      from public.arc_product_variants v
      where v.organization_id=p.organization_id and v.product_id=p.id
        and v.compare_at_price>v.price and v.price>=0
    ),0) as discount_percent
  from public.arc_products p
  join public.organizations o on o.id=p.organization_id and o.slug='arvoculture'
  where p.status='active';
$function$;
revoke all on function public.get_arvoculture_storefront_product_badges() from public;
grant execute on function public.get_arvoculture_storefront_product_badges() to anon,authenticated;
