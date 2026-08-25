
alter table public.arc_products
  add constraint arc_products_id_organization_key unique (id, organization_id);

create table public.arc_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  status text not null default 'active' check (status in ('draft','active','archived')),
  source text not null default 'native' check (source in ('native','shopify')),
  seo_title text not null default '',
  seo_description text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.arc_collection_products (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null,
  product_id uuid not null,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id),
  foreign key (collection_id, organization_id)
    references public.arc_collections(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id)
    references public.arc_products(id, organization_id) on delete cascade
);

create index arc_collections_org_status_idx on public.arc_collections(organization_id,status);
create index arc_collection_products_org_product_idx on public.arc_collection_products(organization_id,product_id);
create index arc_collection_products_collection_position_idx on public.arc_collection_products(collection_id,position);
create index arc_collection_products_collection_org_idx on public.arc_collection_products(collection_id,organization_id);
create index arc_collection_products_product_org_idx on public.arc_collection_products(product_id,organization_id);

alter table public.arc_collections enable row level security;
alter table public.arc_collection_products enable row level security;
revoke all on table public.arc_collections,public.arc_collection_products from anon,authenticated;
grant select,insert,update,delete on table public.arc_collections,public.arc_collection_products to authenticated;

create policy "arc members read collections" on public.arc_collections for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collections.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
create policy "arc managers insert collections" on public.arc_collections for insert to authenticated
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collections.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
create policy "arc managers update collections" on public.arc_collections for update to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collections.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collections.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
create policy "arc managers delete collections" on public.arc_collections for delete to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collections.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

create policy "arc members read collection products" on public.arc_collection_products for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collection_products.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
create policy "arc managers insert collection products" on public.arc_collection_products for insert to authenticated
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collection_products.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
create policy "arc managers update collection products" on public.arc_collection_products for update to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collection_products.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collection_products.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
create policy "arc managers delete collection products" on public.arc_collection_products for delete to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_collection_products.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

update public.arc_products
set metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
  'seo_title', coalesce(nullif(metadata->>'seo_title',''),name),
  'seo_description', coalesce(nullif(metadata->>'seo_description',''),left(regexp_replace(description,'<[^>]+>','','g'),180)),
  'subtitle', coalesce(nullif(metadata->>'subtitle',''),left(regexp_replace(description,'<[^>]+>','','g'),140)),
  'condition', coalesce(nullif(metadata->>'condition',''),'new')
))
where source='shopify';

insert into public.arc_collections(organization_id,title,slug,status,source,seo_title,metadata)
select distinct p.organization_id,trim(p.metadata->>'type'),
  coalesce(nullif(trim(both '-' from regexp_replace(translate(lower(trim(p.metadata->>'type')),'çğıöşü','cgiosu'),'[^a-z0-9]+','-','g')),''),'koleksiyon-'||substr(md5(trim(p.metadata->>'type')),1,10)),
  'active','shopify',trim(p.metadata->>'type'),jsonb_build_object('shopify_product_type',trim(p.metadata->>'type'))
from public.arc_products p
where p.source='shopify' and nullif(trim(p.metadata->>'type'),'') is not null
on conflict(organization_id,slug) do nothing;

insert into public.arc_collection_products(organization_id,collection_id,product_id)
select p.organization_id,c.id,p.id
from public.arc_products p join public.arc_collections c
  on c.organization_id=p.organization_id and c.metadata->>'shopify_product_type'=trim(p.metadata->>'type')
where p.source='shopify' and nullif(trim(p.metadata->>'type'),'') is not null
on conflict(collection_id,product_id) do nothing;
