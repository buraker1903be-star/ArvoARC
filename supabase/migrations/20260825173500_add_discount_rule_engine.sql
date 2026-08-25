create table if not exists public.arc_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  code text null check (code is null or code ~ '^[A-Z0-9_-]{2,40}$'),
  discount_type text not null check (discount_type in ('percentage','fixed_amount','free_shipping')),
  value bigint not null default 0 check (value >= 0),
  minimum_subtotal bigint not null default 0 check (minimum_subtotal >= 0),
  usage_limit integer null check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  per_customer_limit integer null check (per_customer_limit is null or per_customer_limit > 0),
  starts_at timestamptz null,
  ends_at timestamptz null,
  status text not null default 'draft' check (status in ('draft','active','paused','expired')),
  combinable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (
    (discount_type='percentage' and value between 1 and 100)
    or (discount_type='fixed_amount' and value > 0)
    or (discount_type='free_shipping' and value = 0)
  ),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists arc_discounts_org_status_idx on public.arc_discounts(organization_id,status);
create index if not exists arc_discounts_org_type_idx on public.arc_discounts(organization_id,discount_type);

alter table public.arc_discounts enable row level security;
revoke all on table public.arc_discounts from anon,authenticated;
grant select,insert,update,delete on table public.arc_discounts to authenticated;

create policy "arc members read discounts" on public.arc_discounts for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_discounts.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));

create policy "arc managers insert discounts" on public.arc_discounts for insert to authenticated
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_discounts.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

create policy "arc managers update discounts" on public.arc_discounts for update to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_discounts.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_discounts.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

create policy "arc managers delete discounts" on public.arc_discounts for delete to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_discounts.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

insert into public.arc_discounts(organization_id,name,code,discount_type,value,minimum_subtotal,status,combinable,metadata)
values ('f00ab7ef-e9be-467b-9e95-db8f753275c3','ARVO10 Sepet İndirimi','ARVO10','percentage',10,0,'active',false,'{"badge":"%10 İndirim","source":"starter"}'::jsonb)
on conflict (organization_id,code) do nothing;

insert into public.arc_discounts(organization_id,name,code,discount_type,value,minimum_subtotal,status,combinable,metadata)
select 'f00ab7ef-e9be-467b-9e95-db8f753275c3','2.000 TL Üzeri Ücretsiz Kargo',null,'free_shipping',0,200000,'active',true,'{"badge":"Ücretsiz Kargo","source":"starter"}'::jsonb
where not exists (
  select 1 from public.arc_discounts
  where organization_id='f00ab7ef-e9be-467b-9e95-db8f753275c3'
    and discount_type='free_shipping'
    and minimum_subtotal=200000
    and metadata->>'source'='starter'
);
