create or replace function public.get_arvoculture_storefront_discounts()
returns table(
  id uuid,
  name text,
  code text,
  discount_type text,
  value bigint,
  minimum_subtotal bigint,
  combinable boolean,
  badge text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.name,
    d.code,
    d.discount_type,
    d.value,
    d.minimum_subtotal,
    d.combinable,
    coalesce(nullif(d.metadata ->> 'badge', ''), d.name) as badge
  from public.arc_discounts d
  join public.organizations o on o.id = d.organization_id
  where o.slug = 'arvoculture'
    and d.status = 'active'
    and (d.starts_at is null or d.starts_at <= now())
    and (d.ends_at is null or d.ends_at > now())
    and (d.usage_limit is null or d.usage_count < d.usage_limit)
  order by d.code nulls first, d.created_at;
$$;

revoke all on function public.get_arvoculture_storefront_discounts() from public;
grant execute on function public.get_arvoculture_storefront_discounts() to anon, authenticated;
