-- ARVO ARC commerce module. Requires the ArvoOS tenant core tables:
-- organizations, organization_memberships and organization_modules.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.organization_memberships') is null
    or to_regclass('public.organization_modules') is null then
    raise exception 'ArvoOS tenant core must be installed before ARVO ARC commerce';
  end if;
end $$;

create table public.arc_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  slug text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','active','archived')),
  source text not null default 'native' check (source in ('native','shopify')),
  external_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (organization_id, slug),
  unique (organization_id, source, external_id)
);

create table public.arc_product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.arc_products(id) on delete cascade,
  sku text not null,
  title text,
  price bigint not null default 0 check (price >= 0),
  currency text not null default 'TRY',
  stock integer not null default 0 check (stock >= 0),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, external_id),
  unique (id, organization_id)
);

create table public.arc_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  variant_id uuid not null,
  kind text not null check (kind in ('in','out','adjustment','sale','return','sync')),
  quantity integer not null check (quantity <> 0),
  reference_type text,
  reference_id text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, organization_id)
    references public.arc_product_variants(id, organization_id) on delete cascade
);

create table public.arc_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  source text not null default 'native' check (source in ('native','shopify')),
  external_id text,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','fulfilled','cancelled','refunded')),
  payment_status text not null default 'pending' check (payment_status in ('pending','authorized','paid','partially_refunded','refunded','failed')),
  customer_email text,
  customer_name text,
  currency text not null default 'TRY',
  subtotal bigint not null default 0 check (subtotal >= 0),
  tax bigint not null default 0 check (tax >= 0),
  shipping bigint not null default 0 check (shipping >= 0),
  total bigint not null default 0 check (total >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number),
  unique (organization_id, source, external_id),
  unique (id, organization_id)
);

create table public.arc_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  variant_id uuid,
  product_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  total bigint not null check (total >= 0),
  foreign key (order_id, organization_id)
    references public.arc_orders(id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id)
    references public.arc_product_variants(id, organization_id) on delete set null (variant_id)
);

create table public.arc_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'shopify' check (source = 'shopify'),
  kind text not null check (kind in ('products','orders')),
  file_name text,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.arc_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.arc_import_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  row_key text,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index arc_products_org_status_idx on public.arc_products(organization_id, status);
create index arc_variants_product_idx on public.arc_product_variants(product_id);
create index arc_inventory_org_created_idx on public.arc_inventory_movements(organization_id, created_at desc);
create index arc_orders_org_created_idx on public.arc_orders(organization_id, created_at desc);
create index arc_import_batches_org_created_idx on public.arc_import_batches(organization_id, created_at desc);

alter table public.arc_products enable row level security;
alter table public.arc_product_variants enable row level security;
alter table public.arc_inventory_movements enable row level security;
alter table public.arc_orders enable row level security;
alter table public.arc_order_items enable row level security;
alter table public.arc_import_batches enable row level security;
alter table public.arc_import_errors enable row level security;

grant select, insert, update, delete on public.arc_products to authenticated;
grant select, insert, update, delete on public.arc_product_variants to authenticated;
grant select, insert, update, delete on public.arc_inventory_movements to authenticated;
grant select, insert, update, delete on public.arc_orders to authenticated;
grant select, insert, update, delete on public.arc_order_items to authenticated;
grant select, insert, update, delete on public.arc_import_batches to authenticated;
grant select, insert, update, delete on public.arc_import_errors to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'arc_products','arc_product_variants','arc_inventory_movements','arc_orders',
    'arc_order_items','arc_import_batches','arc_import_errors'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = %I.organization_id and m.user_id = (select auth.uid()) and m.is_active = true))',
      'arc members read ' || table_name, table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.organization_memberships m where m.organization_id = %I.organization_id and m.user_id = (select auth.uid()) and m.is_active = true and m.role::text in (''owner'',''admin'',''manager'')))',
      'arc managers insert ' || table_name, table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = %I.organization_id and m.user_id = (select auth.uid()) and m.is_active = true and m.role::text in (''owner'',''admin'',''manager''))) with check (exists (select 1 from public.organization_memberships m where m.organization_id = %I.organization_id and m.user_id = (select auth.uid()) and m.is_active = true and m.role::text in (''owner'',''admin'',''manager'')))',
      'arc managers update ' || table_name, table_name, table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = %I.organization_id and m.user_id = (select auth.uid()) and m.is_active = true and m.role::text in (''owner'',''admin'',''manager'')))',
      'arc managers delete ' || table_name, table_name, table_name
    );
  end loop;
end $$;

create or replace function public.arc_create_order(
  p_customer_name text,
  p_customer_email text,
  p_items jsonb,
  p_source text default 'native'
)
returns table(order_id uuid, order_number text, total bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_total bigint := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_variant record;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_source not in ('native','shopify') then raise exception 'Invalid order source'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id := nullif(v_item->>'variant_id','')::uuid;
    v_quantity := nullif(v_item->>'quantity','')::integer;
    if v_variant_id is null or v_quantity is null or v_quantity <= 0 then raise exception 'Invalid order item'; end if;
    select v.id, v.organization_id, v.product_id, v.sku, v.price, v.currency, v.stock,
           p.name as product_name
      into v_variant
      from public.arc_product_variants v
      join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
     where v.id = v_variant_id
     for update of v;
    if not found then raise exception 'Variant not found'; end if;
    if v_org_id is null then v_org_id := v_variant.organization_id;
    elsif v_org_id <> v_variant.organization_id then raise exception 'All order items must belong to the same organization'; end if;
    if v_variant.stock < v_quantity then raise exception 'Insufficient stock for SKU %', v_variant.sku; end if;
    v_total := v_total + (v_variant.price * v_quantity);
  end loop;

  if not exists (
    select 1 from public.organization_memberships m
     where m.organization_id = v_org_id and m.user_id = v_user_id and m.is_active = true
       and m.role::text in ('owner','admin','manager')
  ) then raise exception 'Insufficient permissions'; end if;
  if not exists (
    select 1 from public.organization_modules om
     where om.organization_id = v_org_id and om.module_code = 'commerce' and om.is_enabled = true
  ) then raise exception 'Commerce module is disabled'; end if;

  v_order_number := 'ARC-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,6));
  insert into public.arc_orders (organization_id,order_number,source,status,payment_status,customer_email,customer_name,currency,subtotal,tax,shipping,total)
  values (v_org_id,v_order_number,p_source,'pending','pending',nullif(trim(p_customer_email),''),nullif(trim(p_customer_name),''),'TRY',v_total,0,0,v_total)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select v.sku,v.price,p.name as product_name into v_variant
      from public.arc_product_variants v join public.arc_products p on p.id=v.product_id
     where v.id=v_variant_id;
    insert into public.arc_order_items(organization_id,order_id,variant_id,product_name,sku,quantity,unit_price,total)
    values(v_org_id,v_order_id,v_variant_id,v_variant.product_name,v_variant.sku,v_quantity,v_variant.price,v_variant.price*v_quantity);
    update public.arc_product_variants set stock=stock-v_quantity,updated_at=now() where id=v_variant_id;
    insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by)
    values(v_org_id,v_variant_id,'sale',-v_quantity,'order',v_order_id::text,'Sipariş '||v_order_number,v_user_id);
  end loop;
  return query select v_order_id,v_order_number,v_total;
end;
$$;

revoke all on function public.arc_create_order(text,text,jsonb,text) from public, anon;
grant execute on function public.arc_create_order(text,text,jsonb,text) to authenticated;
