create table public.arc_store_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  store_name text not null check (char_length(store_name) between 1 and 160),
  storefront_url text check (storefront_url is null or storefront_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/.*)?$'),
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'tr-TR' check (char_length(locale) between 2 and 20),
  low_stock_threshold integer not null default 5 check (low_stock_threshold between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.arc_store_settings enable row level security;
grant select,insert,update on public.arc_store_settings to authenticated;

create policy "arc members read store settings"
on public.arc_store_settings for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id=arc_store_settings.organization_id
    and membership.user_id=(select auth.uid()) and membership.is_active=true
));

create policy "arc managers insert store settings"
on public.arc_store_settings for insert to authenticated
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id=arc_store_settings.organization_id
    and membership.user_id=(select auth.uid()) and membership.is_active=true
    and membership.role::text in ('owner','admin','manager')
));

create policy "arc managers update store settings"
on public.arc_store_settings for update to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id=arc_store_settings.organization_id
    and membership.user_id=(select auth.uid()) and membership.is_active=true
    and membership.role::text in ('owner','admin','manager')
))
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id=arc_store_settings.organization_id
    and membership.user_id=(select auth.uid()) and membership.is_active=true
    and membership.role::text in ('owner','admin','manager')
));

insert into public.arc_store_settings(organization_id,store_name,storefront_url)
select id,'ArvoCulture','https://arvoculture.com'
from public.organizations where slug='arvoculture'
on conflict(organization_id) do nothing;