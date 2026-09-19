-- Canlı şema dışa aktarımı: 2026-09-19
-- scripts/sema-disa-aktar.sql ile üretildi. Elle düzenlemeyin.
set check_function_bodies = false;
create schema if not exists private;

do $t$ begin create type public.membership_role as enum ('owner', 'admin', 'manager', 'member', 'operasyoncu'); exception when duplicate_object then null; end $t$;

do $t$ begin create type public.organization_status as enum ('trial', 'active', 'suspended', 'archived'); exception when duplicate_object then null; end $t$;

do $t$ begin create type public.plan_code as enum ('starter', 'professional', 'enterprise'); exception when duplicate_object then null; end $t$;

create table if not exists public.arc_collection_products (
  organization_id uuid not null,
  collection_id uuid not null,
  product_id uuid not null,
  "position" integer not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_collections (
  id uuid not null,
  organization_id uuid not null,
  title text not null,
  slug text not null,
  description text not null,
  status text not null,
  source text not null,
  seo_title text not null,
  seo_description text not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_customer_addresses (
  id uuid not null,
  user_id uuid not null,
  title text not null,
  full_name text not null,
  phone text not null,
  city text not null,
  district text not null,
  postal_code text,
  line text not null,
  company_name text,
  tax_office text,
  tax_number text,
  is_billing boolean not null,
  is_shipping boolean not null,
  is_default boolean not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_customer_favourites (
  id uuid not null,
  user_id uuid not null,
  product_slug text not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_discounts (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  code text,
  discount_type text not null,
  value bigint not null,
  minimum_subtotal bigint not null,
  usage_limit integer,
  usage_count integer not null,
  per_customer_limit integer,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  status text not null,
  combinable boolean not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_import_batches (
  id uuid not null,
  organization_id uuid not null,
  source text not null,
  kind text not null,
  file_name text,
  status text not null,
  total_rows integer not null,
  imported_rows integer not null,
  skipped_rows integer not null,
  error_rows integer not null,
  metadata jsonb not null,
  created_by uuid,
  created_at timestamp with time zone not null,
  completed_at timestamp with time zone
);

create table if not exists public.arc_import_errors (
  id uuid not null,
  batch_id uuid not null,
  organization_id uuid not null,
  row_key text,
  message text not null,
  payload jsonb not null,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_inventory_movements (
  id uuid not null,
  organization_id uuid not null,
  variant_id uuid not null,
  kind text not null,
  quantity integer not null,
  reference_type text,
  reference_id text,
  note text,
  created_by uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_order_events (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  event_type text not null,
  event_data jsonb not null,
  created_by uuid,
  created_at timestamp with time zone not null
);

create table if not exists public.arc_order_items (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  variant_id uuid,
  product_name text not null,
  sku text not null,
  quantity integer not null,
  unit_price bigint not null,
  total bigint not null
);

create table if not exists public.arc_orders (
  id uuid not null,
  organization_id uuid not null,
  order_number text not null,
  source text not null,
  external_id text,
  status text not null,
  payment_status text not null,
  customer_email text,
  customer_name text,
  currency text not null,
  subtotal bigint not null,
  tax bigint not null,
  shipping bigint not null,
  total bigint not null,
  metadata jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  user_id uuid
);

create table if not exists public.arc_payment_orders (
  id uuid not null,
  organization_id uuid not null,
  merchant_oid text not null,
  status text not null,
  payment_method text not null,
  currency text not null,
  expected_amount integer not null,
  paid_amount integer,
  customer_email text not null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb not null,
  basket jsonb not null,
  paytr_test_mode boolean not null,
  payment_type text,
  failure_code text,
  failure_message text,
  callback_received_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_product_variants (
  id uuid not null,
  organization_id uuid not null,
  product_id uuid not null,
  sku text not null,
  title text,
  price bigint not null,
  currency text not null,
  stock integer not null,
  attributes jsonb not null,
  external_id text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  allow_backorder boolean not null,
  compare_at_price bigint,
  supplier text,
  supplier_sku text,
  cost_price bigint
);

create table if not exists public.arc_products (
  id uuid not null,
  organization_id uuid not null,
  name text not null,
  slug text not null,
  description text not null,
  status text not null,
  source text not null,
  external_id text,
  created_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  metadata jsonb not null,
  supplier text,
  supplier_product_code text,
  supplier_synced_at timestamp with time zone,
  tax_rate numeric(5,2)
);

create table if not exists public.arc_return_requests (
  id uuid not null,
  organization_id uuid not null,
  order_id uuid not null,
  user_id uuid,
  items jsonb not null,
  reason text not null,
  note text,
  status text not null,
  status_note text,
  refund_amount bigint,
  refund_reference text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  resolved_at timestamp with time zone
);

create table if not exists public.arc_store_settings (
  organization_id uuid not null,
  store_name text not null,
  storefront_url text,
  currency text not null,
  locale text not null,
  low_stock_threshold integer not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  logo_path text,
  favicon_path text,
  primary_color text not null,
  accent_color text not null,
  custom_domain text,
  platform_subdomain text,
  domain_status text not null,
  domain_verification_token text,
  domain_verified_at timestamp with time zone,
  panel_custom_domain text,
  panel_domain_status text not null,
  panel_domain_verification_token text,
  panel_domain_verified_at timestamp with time zone,
  bank_transfer_enabled boolean not null,
  bank_name text,
  bank_account_holder text,
  bank_iban text,
  bank_transfer_instructions text,
  paytr_enabled boolean not null,
  paytr_test_mode boolean not null,
  paytr_merchant_id text,
  paytr_no_installment boolean not null,
  paytr_max_installment integer not null,
  default_tax_rate numeric(5,2) not null,
  legal_name text,
  trade_name text,
  mersis_no text,
  tax_office text,
  tax_number text,
  trade_registry_no text,
  address_line text,
  address_district text,
  address_city text,
  address_country text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  kep_address text,
  etbis_verified boolean,
  paytr_merchant_key_enc text,
  paytr_merchant_salt_enc text,
  order_prefix text not null,
  shipping_fee bigint not null,
  free_shipping_threshold bigint not null,
  bank_transfer_discount_percent numeric not null,
  email_from text,
  email_reply_to text
);

create table if not exists public.arc_store_themes (
  id uuid not null,
  organization_id uuid not null,
  mode text not null,
  version integer not null,
  config jsonb not null,
  updated_by uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.arc_suppliers (
  id uuid not null,
  organization_id uuid not null,
  code text not null,
  name text not null,
  feed_url text,
  active boolean not null,
  margin_percent integer not null,
  shipping_markup bigint not null,
  round_to_kurus integer not null,
  brand_override text,
  publish_directly boolean not null,
  last_synced_at timestamp with time zone,
  last_sync_note text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  sync_cursor integer not null,
  sync_total integer not null,
  service_fee bigint not null,
  stock_buffer integer not null
);

create table if not exists public.organization_memberships (
  organization_id uuid not null,
  user_id uuid not null,
  role membership_role not null,
  permissions jsonb not null,
  is_active boolean not null,
  joined_at timestamp with time zone not null,
  role_before_management text,
  role_from_management boolean not null
);

create table if not exists public.organization_modules (
  organization_id uuid not null,
  module_code text not null,
  is_enabled boolean not null,
  configuration jsonb not null,
  enabled_at timestamp with time zone not null
);

create table if not exists public.organization_product_licenses (
  organization_id uuid not null,
  product text not null,
  status text not null,
  plan_code plan_code,
  monthly_fee bigint,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_ends_at timestamp with time zone,
  suspended_at timestamp with time zone,
  suspension_reason text,
  updated_by uuid,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create table if not exists public.organizations (
  id uuid not null,
  name text not null,
  slug text not null,
  sector text not null,
  status organization_status not null,
  plan_code plan_code not null,
  custom_domain text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  provisioning_state text not null,
  logo_url text,
  primary_color text not null,
  document_footer text,
  contact_email text,
  contact_phone text,
  website_url text,
  signature_stamp_url text,
  custom_domain_status text,
  custom_domain_verification jsonb,
  custom_domain_updated_at timestamp with time zone,
  display_name text,
  brand_color text,
  legal_name text,
  legal_address text,
  legal_city text,
  legal_district text,
  tax_office text,
  tax_number text,
  mersis_no text,
  bank_name text,
  bank_account_holder text,
  iban text,
  kind text not null
);

CREATE OR REPLACE FUNCTION private.arc_guard_payment_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if private.arvo_is_org_admin(new.organization_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Satır yoksa manager'ın upsert'i satırı oluşturur; ödeme alanları
    -- varsayılanda (kapalı, boş) kalmalı.
    if new.bank_transfer_enabled or new.paytr_enabled
    or new.bank_iban is not null or new.bank_name is not null
    or new.bank_account_holder is not null
    or new.paytr_merchant_id is not null
    or new.paytr_merchant_key_enc is not null
    or new.paytr_merchant_salt_enc is not null then
      raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) ayarlayabilir.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.organization_id            is distinct from old.organization_id
  or new.bank_transfer_enabled      is distinct from old.bank_transfer_enabled
  or new.bank_name                  is distinct from old.bank_name
  or new.bank_account_holder        is distinct from old.bank_account_holder
  or new.bank_iban                  is distinct from old.bank_iban
  or new.bank_transfer_instructions is distinct from old.bank_transfer_instructions
  or new.paytr_enabled              is distinct from old.paytr_enabled
  or new.paytr_test_mode            is distinct from old.paytr_test_mode
  or new.paytr_merchant_id          is distinct from old.paytr_merchant_id
  or new.paytr_no_installment       is distinct from old.paytr_no_installment
  or new.paytr_max_installment      is distinct from old.paytr_max_installment
  or new.paytr_merchant_key_enc     is distinct from old.paytr_merchant_key_enc
  or new.paytr_merchant_salt_enc    is distinct from old.paytr_merchant_salt_enc
  then
    raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arc_guard_store_domains()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_domain text;
  v_owner uuid;
begin
  foreach v_domain in array array[
    nullif(lower(trim(coalesce(new.custom_domain, ''))), ''),
    nullif(lower(trim(coalesce(new.panel_custom_domain, ''))), '')
  ]
  loop
    continue when v_domain is null;

    select s.organization_id into v_owner
    from public.arc_store_settings s
    where s.organization_id <> new.organization_id
      and (lower(trim(coalesce(s.custom_domain, ''))) = v_domain
        or lower(trim(coalesce(s.panel_custom_domain, ''))) = v_domain)
    limit 1;

    if v_owner is not null then
      -- Kimin kullandığı SÖYLENMEZ: mağazalar birbirinin varlığını
      -- öğrenmemeli.
      -- Biçim metni ile "using message" birlikte verilemez
      -- ("RAISE option already specified: MESSAGE"); yalnızca using.
      raise using
        errcode = 'unique_violation',
        message = 'Bu alan adı başka bir mağazada kullanılıyor.';
    end if;
  end loop;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.arvo_is_org_admin(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.can_manage_organization_assets(organization_id_text text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner', 'admin')
      and m.organization_id::text = organization_id_text
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_address_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- user_id istemciden gelse bile her zaman oturum sahibine sabitlenir.
  new.user_id := auth.uid();
  new.updated_at := now();

  -- Aynı anda yalnızca bir varsayılan adres olabilir.
  if new.is_default then
    update public.arc_customer_addresses
       set is_default = false
     where user_id = new.user_id
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_address_line(p_addr jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    trim(
      concat_ws(
        ', ',
        public.arc_clean(p_addr ->> 'address1'),
        public.arc_clean(p_addr ->> 'address2')
      )
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS TABLE(variant_id uuid, previous_stock integer, new_stock integer, movement_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_prev integer;
  v_next integer;
  v_allow_backorder boolean;
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity = 0 then
    raise exception 'Quantity cannot be zero';
  end if;

  if p_kind not in ('in','out','adjustment','sale','return','sync') then
    raise exception 'Invalid inventory movement kind';
  end if;

  select organization_id, stock, allow_backorder
    into v_org_id, v_prev, v_allow_backorder
  from public.arc_product_variants
  where id = p_variant_id
  for update;

  if v_org_id is null then
    raise exception 'Variant not found';
  end if;

  if not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_user_id
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Insufficient permissions';
  end if;

  if not exists (
    select 1
    from public.organization_modules om
    where om.organization_id = v_org_id
      and om.module_code = 'commerce'
      and om.is_enabled = true
  ) then
    raise exception 'Commerce module is disabled';
  end if;

  v_next := v_prev + p_quantity;

  if v_next < 0 and not v_allow_backorder then
    raise exception 'Insufficient stock and backorder is disabled';
  end if;

  update public.arc_product_variants
  set stock = v_next,
      updated_at = now()
  where id = p_variant_id;

  insert into public.arc_inventory_movements (
    organization_id,
    variant_id,
    kind,
    quantity,
    reference_type,
    reference_id,
    note,
    created_by
  ) values (
    v_org_id,
    p_variant_id,
    p_kind,
    p_quantity,
    p_reference_type,
    p_reference_id,
    p_note,
    v_user_id
  ) returning id into v_movement_id;

  return query select p_variant_id, v_prev, v_next, v_movement_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_aktarim_hesap_yukle(p_kullanicilar jsonb, p_kimlikler jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sutunlar text;
  guncelle text;
  kullanici integer := 0;
  kimlik integer := 0;
begin
  if jsonb_array_length(p_kullanicilar) = 0 then
    return jsonb_build_object('kullanici', 0, 'kimlik', 0);
  end if;

  select string_agg(quote_ident(a.attname), ',' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ',' order by a.attnum) filter (where a.attname <> 'id')
    into sutunlar, guncelle
  from pg_attribute a
  where a.attrelid = 'auth.users'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname in (select jsonb_object_keys(p_kullanicilar -> 0));
  execute format(
    'insert into auth.users (%s) select %s from jsonb_populate_recordset(null::auth.users, $1) on conflict (id) do update set %s',
    sutunlar, sutunlar, guncelle)
  using p_kullanicilar;
  get diagnostics kullanici = row_count;

  delete from auth.identities
  where user_id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_kullanicilar) e);
  if jsonb_array_length(p_kimlikler) > 0 then
    select string_agg(quote_ident(a.attname), ',' order by a.attnum) into sutunlar
    from pg_attribute a
    where a.attrelid = 'auth.identities'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and a.attname in (select jsonb_object_keys(p_kimlikler -> 0));
    execute format(
      'insert into auth.identities (%s) select %s from jsonb_populate_recordset(null::auth.identities, $1)',
      sutunlar, sutunlar)
    using p_kimlikler;
    get diagnostics kimlik = row_count;
  end if;
  return jsonb_build_object('kullanici', kullanici, 'kimlik', kimlik);
end
$function$
;

CREATE OR REPLACE FUNCTION public.arc_aktarim_pk(p_tablo text)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select array_agg(a.attname::text order by array_position(i.indkey, a.attnum))
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = format('public.%I', p_tablo)::regclass and i.indisprimary
    and p_tablo like 'arc\_%';
$function$
;

CREATE OR REPLACE FUNCTION public.arc_aktarim_sil(p_tablo text, p_anahtarlar jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  hedef regclass;
  sol text;
  sag text;
  adet integer;
begin
  if p_tablo not like 'arc\_%' then
    raise exception 'Yalnızca arc_ tabloları: %', p_tablo;
  end if;
  if jsonb_typeof(p_anahtarlar) <> 'array' then
    raise exception 'Anahtar listesi dizi olmalı';
  end if;
  hedef := format('public.%I', p_tablo)::regclass;
  execute format('alter table %s disable trigger user', hedef);

  select string_agg('t.' || quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum)),
         string_agg('k.' || quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum))
    into sol, sag
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = hedef and i.indisprimary;

  execute format(
    'delete from %s t where not exists (select 1 from jsonb_populate_recordset(null::%s, $1) k where row(%s) = row(%s))',
    hedef, hedef, sol, sag)
  using p_anahtarlar;
  get diagnostics adet = row_count;
  execute format('alter table %s enable trigger user', hedef);
  return adet;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arc_aktarim_yukle(p_tablo text, p_satirlar jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  hedef regclass;
  sutunlar text;
  guncelle text;
  anahtar text;
  adet integer;
begin
  if p_tablo not like 'arc\_%' then
    raise exception 'Yalnızca arc_ tabloları aktarılır: %', p_tablo;
  end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) = 0 then
    return 0;
  end if;
  hedef := format('public.%I', p_tablo)::regclass;
  execute format('alter table %s disable trigger user', hedef);

  select string_agg(quote_ident(a.attname), ',' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ',' order by a.attnum)
    into sutunlar, guncelle
  from pg_attribute a
  where a.attrelid = hedef and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname in (select jsonb_object_keys(p_satirlar -> 0));

  select string_agg(quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum))
    into anahtar
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = hedef and i.indisprimary;

  if anahtar is null then
    raise exception '% tablosunun birincil anahtarı yok', p_tablo;
  end if;

  execute format(
    'insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1) on conflict (%s) do update set %s',
    hedef, sutunlar, sutunlar, hedef, anahtar, guncelle)
  using p_satirlar;
  get diagnostics adet = row_count;
  execute format('alter table %s enable trigger user', hedef);
  return adet;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arc_baslik(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    array_to_string(
      array(
        select
          case
            when kelime = '' then ''
            -- İlk harf Türkçe kurallarıyla büyütülür.
            when left(kelime, 1) = 'i' then 'İ' || substr(kelime, 2)
            when left(kelime, 1) = 'ı' then 'I' || substr(kelime, 2)
            else upper(left(kelime, 1)) || substr(kelime, 2)
          end
        from unnest(
          string_to_array(
            -- Türkçe küçültme: I→ı, İ→i, sonra genel lower().
            lower(translate(coalesce(p_text, ''), 'IİĞÜŞÖÇ', 'ıiğüşöç')),
            ' '
          )
        ) as kelime
      ),
      ' '
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  /*
    Gelen JSON dizisi tabloya açılıp tek UPDATE ile uygulanır.

    Beklenen biçim:
    [{"sku":"869-1395-...","stock":12,"cost":19965,"price":33990}]
  */
  with veri as (
    select
      (row ->> 'sku')::text as sku,
      (row ->> 'stock')::integer as stock,
      (row ->> 'cost')::bigint as cost,
      (row ->> 'price')::bigint as price
    from jsonb_array_elements(p_rows) as row
  )
  update public.arc_product_variants v
     set stock = d.stock,
         cost_price = d.cost,
         price = d.price,
         updated_at = now()
    from veri d
   where v.organization_id = p_organization_id
     and v.supplier = p_supplier
     and v.supplier_sku = d.sku
     -- Değişmemiş satırı yazmamak gereksiz WAL trafiğini önler.
     and (v.stock is distinct from d.stock
          or v.price is distinct from d.price
          or v.cost_price is distinct from d.cost);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_categorize_supplier_products(p_supplier text DEFAULT 'tarzyeri'::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_links integer := 0;
  v_added integer;
begin
  /*
    Kurum artık çağırandan gelir. Parametre verilmezse eski davranış korunur
    (arvoculture): bu fonksiyonu elle çağıran eski kayıtlar ve alışkanlıklar
    bozulmasın. Yeni çağrılar kurumu açıkça geçiyor.
  */
  v_org_id := p_organization_id;
  if v_org_id is null then
    select id into v_org_id
    from public.organizations where slug = 'arvoculture' limit 1;
  end if;

  if v_org_id is null then
    raise exception 'Organizasyon bulunamadı';
  end if;

  create temporary table if not exists arc_kategori_gecici (
    product_id uuid,
    ana text,      -- Erkek, Kadın, Çocuk, Aksesuar
    grup text,     -- Üst Giyim, Alt Giyim, Dış Giyim…
    tur text       -- T-Shirt, Ceket, Kol Saati…
  ) on commit drop;

  -- pg_safeupdate: where'süz delete reddedilir; truncate korumaya takılmaz.
  truncate table arc_kategori_gecici;

  insert into arc_kategori_gecici
  select
    p.id,
    public.arc_baslik(trim(split_part(k, '>', 1))),
    /*
      Menü grubu normalleştirmesi.

      - "ERKEK ALT GİYİM" → "Alt Giyim" (cinsiyet öneki atılır)
      - "UNİSEX ÇOCUK"    → "Çocuk"
      - Aksesuarda ikinci seviye cinsiyettir; grup "Aksesuar"
        olarak sabitlenir.
    */
    case
      when upper(trim(split_part(k, '>', 1))) = 'AKSESUAR'
        then 'Aksesuar'
      else public.arc_baslik(
        trim(
          regexp_replace(
            trim(split_part(k, '>', 2)),
            '^(ERKEK|KADIN|UNİSEX|UNISEX)\s+', '', 'i'
          )
        )
      )
    end,
    public.arc_baslik(trim(split_part(k, '>', 3)))
  from public.arc_products p
  cross join lateral (
    select p.metadata ->> 'supplier_category' as k
  ) x
  where p.organization_id = v_org_id
    and p.supplier = p_supplier
    and p.status = 'active'
    and coalesce(x.k, '') <> '';

  -- Ana koleksiyonlar: Erkek, Kadın, Çocuk, Aksesuar
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id, t.ana, public.arc_slugify(t.ana), '', 'active',
    jsonb_build_object('menu_group', 'Kime Göre', 'auto', true)
  from arc_kategori_gecici t
  where coalesce(t.ana, '') <> ''
  on conflict (organization_id, slug) do nothing;

  -- Tür koleksiyonları: "Erkek T-Shirt", "Kadın Ceket"…
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id,
    t.ana || ' ' || t.tur,
    public.arc_slugify(t.ana || '-' || t.tur),
    '', 'active',
    jsonb_build_object(
      'menu_group', coalesce(nullif(t.grup, ''), t.ana),
      'parent', t.ana,
      'auto', true
    )
  from arc_kategori_gecici t
  where coalesce(t.tur, '') <> ''
  on conflict (organization_id, slug) do nothing;

  /*
    Var olan otomatik koleksiyonların başlığını ve menü grubunu
    da tazele — önceki sürüm bozuk Türkçe üretmişti.
  */
  update public.arc_collections c
     set title = t.ana,
         metadata = c.metadata || jsonb_build_object('menu_group', 'Kime Göre'),
         updated_at = now()
  from (select distinct ana from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana);

  update public.arc_collections c
     set title = t.ana || ' ' || t.tur,
         metadata = c.metadata || jsonb_build_object(
           'menu_group', coalesce(nullif(t.grup, ''), t.ana),
           'parent', t.ana
         ),
         updated_at = now()
  from (select distinct ana, grup, tur from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana || '-' || t.tur);

  -- Bağlantılar
  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana)
  where coalesce(t.ana, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana || '-' || t.tur)
  where coalesce(t.tur, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  return v_links;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint DEFAULT NULL::bigint, p_email text DEFAULT NULL::text)
 RETURNS TABLE(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d public.arc_discounts%rowtype;
  v_used integer := 0;
  v_amount bigint := 0;
begin
  if p_organization_id is null then
    return query select false, 'Mağaza bulunamadı.'::text, null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, 'Kupon kodu girin.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  select * into v_d
  from public.arc_discounts d
  where d.organization_id = p_organization_id
    and upper(d.code) = upper(trim(p_code))
  limit 1;

  if v_d.id is null then
    return query select false, 'Bu kod geçerli değil.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.status <> 'active' then
    return query select false, 'Bu kampanya artık geçerli değil.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.starts_at is not null and v_d.starts_at > now() then
    return query select false, 'Bu kampanya henüz başlamadı.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.ends_at is not null and v_d.ends_at < now() then
    return query select false, 'Bu kampanyanın süresi dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /* Toplam kullanım hakkı. */
  if v_d.usage_limit is not null
     and coalesce(v_d.usage_count, 0) >= v_d.usage_limit then
    return query select false, 'Bu kampanyanın kullanım hakkı dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /*
    Müşteri başına kullanım. "İlk alışverişe özel" kodlarda kritik:
    aynı müşteri ikinci kez kullanamamalı.
  */
  if v_d.per_customer_limit is not null and p_email is not null then
    select count(*) into v_used
    from public.arc_orders o
    where o.organization_id = p_organization_id
      and lower(o.customer_email) = lower(trim(p_email))
      and upper(coalesce(o.metadata ->> 'coupon_code', '')) = upper(trim(p_code))
      and o.status not in ('cancelled', 'refunded')
      /*
        Ödenmemiş sipariş hakkı YAKMAZ. Sipariş satırı ödemeden ÖNCE
        'pending' olarak yazılıyor; müşteri PayTR ekranını kapatıp tekrar
        denediğinde kendi kodunu kullanamaz hale geliyordu.

        Sayılanlar: ödenmiş siparişler (kısmi iade dahil, para geçmiş) ve
        hâlâ akıştaki taze denemeler. 30 dakikalık pencere, aynı anda iki
        sekmeden kupon yakmayı engellerken terk edilmiş ödemeyi serbest
        bırakıyor. Havale siparişi onaylanınca 'paid' oluyor, zaten sayılır.
      */
      and (
        o.payment_status in ('paid', 'partially_refunded')
        or o.created_at > now() - interval '30 minutes'
      );

    if v_used >= v_d.per_customer_limit then
      return query select false,
        'Bu indirim kodunu daha önce kullandınız.'::text,
        null::text, null::numeric, null::bigint, 0::bigint;
      return;
    end if;
  end if;

  /*
    Alt limit yalnızca ara toplam BİLİNİYORSA kontrol edilir. Bilinmiyorsa
    (p_subtotal null) bu kural atlanır; sipariş oluşturulurken gerçek ara
    toplamla zaten uygulanıyor.
  */
  if p_subtotal is not null
     and v_d.minimum_subtotal is not null
     and p_subtotal < v_d.minimum_subtotal then
    return query select false,
      format('Bu kod %s TL ve üzeri siparişlerde geçerli.',
             to_char(v_d.minimum_subtotal / 100.0, 'FM999G999D00'))::text,
      null::text, null::numeric, v_d.minimum_subtotal, 0::bigint;
    return;
  end if;

  /*
    İndirim tutarı. Sabit indirimde value zaten kuruş (panel
    Math.round(tutar*100) ile yazıyor). Ara toplam bilinmiyorsa tutar
    hesaplanamaz; 0 dönülür, kodun geçerliliği yine bildirilir.
  */
  if p_subtotal is null then
    v_amount := 0;
  elsif v_d.discount_type = 'percentage' then
    v_amount := round(p_subtotal * v_d.value / 100);
  else
    v_amount := least(v_d.value::bigint, p_subtotal);
  end if;

  return query select true, 'Kod uygulandı.'::text, v_d.discount_type,
    v_d.value, v_d.minimum_subtotal, v_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_check_supplier_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_available boolean;
  v_stock integer;
begin
  select
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier),
    v.stock
  into v_available, v_stock
  from public.arc_product_variants v
  where v.organization_id = new.organization_id
    and v.sku = new.sku
  limit 1;

  -- Varyant bulunamazsa engelleme: manuel siparişlerde SKU
  -- katalogda olmayabilir.
  if v_available is null then
    return new;
  end if;

  if not v_available then
    raise exception 'Bu ürün şu anda satışa kapalı (stok: %).', v_stock
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_clean(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(trim(both from regexp_replace(coalesce(p_value, ''), '^''+', '')), '');
$function$
;

CREATE OR REPLACE FUNCTION public.arc_count_coupon_use()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text := nullif(upper(trim(coalesce(new.metadata ->> 'coupon_code', ''))), '');
begin
  if v_code is not null
     and new.payment_status = 'paid'
     and coalesce(old.payment_status, '') not in ('paid', 'partially_refunded', 'refunded') then
    update public.arc_discounts d
       set usage_count = d.usage_count + 1,
           updated_at = now()
     where d.organization_id = new.organization_id
       and upper(d.code) = v_code;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text DEFAULT 'native'::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_source not in ('native','shopify') then
    raise exception 'Invalid order source';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := nullif(v_item->>'variant_id','')::uuid;
    v_quantity := nullif(v_item->>'quantity','')::integer;

    if v_variant_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid order item';
    end if;

    select v.id, v.organization_id, v.product_id, v.sku, v.price, v.currency, v.stock, v.allow_backorder, p.name as product_name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
    where v.id = v_variant_id
    for update of v;

    if not found then
      raise exception 'Variant not found';
    end if;

    if v_org_id is null then
      v_org_id := v_variant.organization_id;
    elsif v_org_id <> v_variant.organization_id then
      raise exception 'All order items must belong to the same organization';
    end if;

    if (v_variant.stock - v_quantity) < 0 and not v_variant.allow_backorder then
      raise exception 'Insufficient stock for SKU %', v_variant.sku;
    end if;

    v_total := v_total + (v_variant.price * v_quantity);
  end loop;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_user_id
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Insufficient permissions';
  end if;

  if not exists (
    select 1 from public.organization_modules om
    where om.organization_id = v_org_id
      and om.module_code = 'commerce'
      and om.is_enabled = true
  ) then
    raise exception 'Commerce module is disabled';
  end if;

  v_order_number := 'ARC-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.arc_orders (
    organization_id, order_number, source, status, payment_status,
    customer_email, customer_name, currency, subtotal, tax, shipping, total, metadata
  ) values (
    v_org_id, v_order_number, p_source, 'pending', 'pending',
    nullif(trim(p_customer_email), ''), nullif(trim(p_customer_name), ''), 'TRY', v_total, 0, 0, v_total, '{}'::jsonb
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select v.id, v.organization_id, v.product_id, v.sku, v.price, v.currency, v.stock, v.allow_backorder, p.name as product_name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
    where v.id = v_variant_id;

    insert into public.arc_order_items (
      organization_id, order_id, variant_id, product_name, sku, quantity, unit_price, total
    ) values (
      v_org_id, v_order_id, v_variant_id, v_variant.product_name, v_variant.sku,
      v_quantity, v_variant.price, v_variant.price * v_quantity
    );

    perform public.arc_adjust_inventory(
      v_variant_id,
      -v_quantity,
      'sale',
      'order',
      v_order_id::text,
      'Sipariş ' || v_order_number
    );
  end loop;

  return query select v_order_id, v_order_number, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid;
  v_order_number text;
  v_prefix text;
  v_shipping_fee bigint;
  v_free_threshold bigint;
  v_subtotal bigint := 0;
  v_shipping bigint := 0;
  v_discount bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_key text;
  v_qty integer;
  v_variant record;
  v_count integer := 0;
  v_addr jsonb;
  v_free_shipping_coupon boolean := false;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  -- Satış ayarları mağazadan; satır yoksa bugünkü ArvoCulture değerleri.
  select coalesce(s.order_prefix, 'AC'),
         coalesce(s.shipping_fee, 12000),
         coalesce(s.free_shipping_threshold, 200000)
    into v_prefix, v_shipping_fee, v_free_threshold
  from public.arc_store_settings s
  where s.organization_id = p_organization_id;

  v_prefix := coalesce(v_prefix, 'AC');
  v_shipping_fee := coalesce(v_shipping_fee, 12000);
  v_free_threshold := coalesce(v_free_threshold, 200000);

  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Geçersiz e-posta';
  end if;

  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'Geçersiz ad soyad';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Sepette çok fazla kalem var';
  end if;

  /*
    Panelin okuduğu adres yapısı. Alan adları Shopify aktarımıyla aynı
    tutulur ki panelde tek bir gösterim kodu yeterli olsun.
  */
  v_addr := jsonb_build_object(
    'name', trim(p_name),
    'phone', nullif(trim(coalesce(p_phone, '')), ''),
    'address1', nullif(trim(coalesce(p_address ->> 'line', '')), ''),
    'address2', null,
    'city', nullif(trim(coalesce(p_address ->> 'city', '')), ''),
    'province', nullif(trim(coalesce(p_address ->> 'district', '')), ''),
    'zip', nullif(trim(coalesce(p_address ->> 'postal', '')), ''),
    'country', coalesce(nullif(trim(coalesce(p_address ->> 'country', '')), ''), 'TR')
  );

  v_order_number := v_prefix || to_char(now(), 'YYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.arc_orders (
    organization_id, order_number, source, status, payment_status,
    customer_email, customer_name, currency, metadata
  )
  values (
    p_organization_id, v_order_number, 'native', 'pending', 'pending',
    lower(trim(p_email)), trim(p_name), 'TRY',
    jsonb_build_object(
      'phone', p_phone,
      'shipping_address', v_addr,
      'billing', v_addr,
      'address', p_address,
      'coupon_code', p_coupon_code,
      'channel', 'storefront'
    )
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_key := v_item ->> 'sku';
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_key is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Geçersiz sepet kalemi';
    end if;

    -- Önce SKU, bulunamazsa ürün slug'ı.
    select v.id, v.price, v.stock, v.allow_backorder, p.name
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    where v.organization_id = p_organization_id
      and p.status = 'active'
      and (v.sku = v_key or p.slug = v_key)
    order by
      (v.sku = v_key) desc,
      (v.stock > 0) desc,
      v.price asc
    limit 1;

    if not found then
      raise exception 'Ürün bulunamadı: %', v_key;
    end if;

    if v_variant.stock < v_qty
       and not coalesce(v_variant.allow_backorder, false) then
      raise exception 'Yetersiz stok: %', v_variant.name;
    end if;

    insert into public.arc_order_items (
      organization_id, order_id, variant_id,
      product_name, sku, quantity, unit_price, total
    )
    values (
      p_organization_id, v_order_id, v_variant.id,
      v_variant.name, v_key, v_qty,
      v_variant.price, v_variant.price * v_qty
    );

    v_subtotal := v_subtotal + (v_variant.price * v_qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Sepet boş';
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select case
             when d.discount_type = 'percentage'
               then (v_subtotal * d.value) / 100
             when d.discount_type = 'fixed_amount'
               then least(d.value, v_subtotal)
             else 0
           end,
           d.discount_type = 'free_shipping'
      into v_discount, v_free_shipping_coupon
    from public.arc_discounts d
    where d.organization_id = p_organization_id
      and upper(d.code) = upper(trim(p_coupon_code))
      and d.status = 'active'
      and (d.starts_at is null or d.starts_at <= now())
      and (d.ends_at is null or d.ends_at > now())
      and (d.usage_limit is null or d.usage_count < d.usage_limit)
      and v_subtotal >= coalesce(d.minimum_subtotal, 0)
    limit 1;

    v_discount := coalesce(v_discount, 0);
    v_free_shipping_coupon := coalesce(v_free_shipping_coupon, false);
  end if;

  /*
    Ücretsiz kargo iki yoldan gelir:
      - "Ücretsiz Kargo" tipli kupon (eskiden hiçbir şey yapmıyordu),
      - eşiği geçen sepet.
    Eşik indirim ÖNCESİ ara toplamla karşılaştırılır: eskiden indirim
    sonrası tutarla bakılıyordu, yani kupon kullanan müşteri ücretsiz
    kargoyu kaybediyordu.
  */
  if v_free_shipping_coupon or v_subtotal >= v_free_threshold then
    v_shipping := 0;
  else
    v_shipping := v_shipping_fee;
  end if;

  v_total := greatest(v_subtotal - v_discount, 0) + v_shipping;

  update public.arc_orders
     set subtotal = v_subtotal,
         shipping = v_shipping,
         total = v_total,
         metadata = metadata || jsonb_build_object('discount', v_discount),
         updated_at = now()
   where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_decode_entities(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(replace(replace(replace(replace(replace(replace(
         replace(replace(coalesce(t,''),
         '&Uuml;','Ü'),'&uuml;','ü'),
         '&Ouml;','Ö'),'&ouml;','ö'),
         '&Ccedil;','Ç'),'&ccedil;','ç'),
         '&Scedil;','Ş'),'&scedil;','ş'),
         '&Gbreve;','Ğ'),'&gbreve;','ğ'),
         '&Idot;','İ'),'&inodot;','ı'),
         '&ndash;','–'),'&mdash;','—'),
         '&rsquo;','’'),'&lsquo;','‘'),
         '&ldquo;','“'),'&rdquo;','”'),
         '&bull;','•'),'&hellip;','…'),
         '&rarr;','→'),'&eacute;','é'),
         '&acirc;','â'),'&nbsp;',' '),
         '&gt;','>'),'&lt;','<')
$function$
;

CREATE OR REPLACE FUNCTION public.arc_extract_vat(p_gross bigint, p_rate numeric)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  /*
    KDV dâhil tutardan vergi payını çıkarır.

    Örnek: 366,90 TL, %10 → 366,90 - (366,90 / 1,10) = 33,35 TL

    Kuruş bazında yuvarlanır; toplamda kuruş farkı oluşmaması
    için her kalem ayrı hesaplanıp toplanır.
  */
  select case
    when p_gross is null or p_rate is null or p_rate <= 0 then 0
    else round(p_gross - (p_gross / (1 + p_rate / 100)))::bigint
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_fill_order_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rate numeric;
  v_tax bigint := 0;
  v_discount bigint := 0;
  v_gross bigint := 0;
begin
  -- Yalnızca yeni siparişte ve vergi girilmemişse hesapla.
  if coalesce(new.tax, 0) <> 0 then
    return new;
  end if;

  select coalesce(s.default_tax_rate, 20) into v_rate
  from public.arc_store_settings s
  where s.organization_id = new.organization_id;

  /*
    Her kalem kendi ürününün oranıyla hesaplanır. Ürün
    bulunamazsa mağaza varsayılanı kullanılır.
  */
  select coalesce(sum(
    public.arc_extract_vat(i.total, coalesce(p.tax_rate, v_rate, 20))
  ), 0)
  into v_tax
  from public.arc_order_items i
  left join public.arc_product_variants v
    on v.organization_id = i.organization_id
   and v.sku = i.sku
  left join public.arc_products p
    on p.id = v.product_id
  where i.order_id = new.id;

  -- Kargo da KDV'ye tabidir; genel oranla hesaplanır.
  v_tax := v_tax + public.arc_extract_vat(
    coalesce(new.shipping, 0),
    coalesce(v_rate, 20)
  );

  /*
    İndirim payı düşülür.

    Vergi kalem tutarları üzerinden hesaplanıyor ama müşteri
    indirimli tutarı ödüyor. İndirim düşülmezse devlete fazla
    vergi beyan edilir.

    İndirim toplam üzerinden orantılı dağıtılıyor: hangi kaleme
    ait olduğu bilinmiyor.
  */
  v_discount := coalesce((new.metadata ->> 'discount')::bigint, 0);
  v_gross := coalesce(new.subtotal, 0) + coalesce(new.shipping, 0);

  if v_discount > 0 and v_gross > 0 then
    v_tax := round(v_tax * (1 - v_discount::numeric / v_gross))::bigint;
  end if;

  update public.arc_orders
  set tax = v_tax
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_find_address(p_meta jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    case when jsonb_typeof(p_meta -> 'shipping_address') = 'object'
         then p_meta -> 'shipping_address' end,
    case when jsonb_typeof(p_meta -> 'billing') = 'object'
         then p_meta -> 'billing' end,
    case when jsonb_typeof(p_meta -> 'billing_address') = 'object'
         then p_meta -> 'billing_address' end,
    case when jsonb_typeof(p_meta -> 'address') = 'object'
         then p_meta -> 'address' end,
    '{}'::jsonb
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_first_text(p_source jsonb, VARIADIC p_keys text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select nullif(trim(p_source ->> k), '')
      from unnest(p_keys) as k
      where nullif(trim(p_source ->> k), '') is not null
      limit 1
    ),
    null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_log_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
if old.status is distinct from new.status or old.payment_status is distinct from new.payment_status then insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by) values(new.organization_id,new.id,'status_updated',jsonb_build_object('old_status',old.status,'new_status',new.status,'old_payment_status',old.payment_status,'new_payment_status',new.payment_status),auth.uid());
elsif (old.metadata->>'shipping_carrier') is distinct from (new.metadata->>'shipping_carrier') or (old.metadata->>'tracking_number') is distinct from (new.metadata->>'tracking_number') or (old.metadata->>'tracking_url') is distinct from (new.metadata->>'tracking_url') or (old.metadata->>'internal_note') is distinct from (new.metadata->>'internal_note') then insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by) values(new.organization_id,new.id,'fulfillment_updated',jsonb_build_object('shipping_carrier',new.metadata->>'shipping_carrier','tracking_number',new.metadata->>'tracking_number'),auth.uid());
end if;return new;end;$function$
;

CREATE OR REPLACE FUNCTION public.arc_normalize_address(p_addr jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when jsonb_typeof(p_addr) is distinct from 'object' then null
    when public.arc_clean(coalesce(p_addr ->> 'line', p_addr ->> 'address1')) is null
      then null
    else jsonb_strip_nulls(
      jsonb_build_object(
        'line',
        nullif(
          trim(
            concat_ws(
              ', ',
              public.arc_clean(coalesce(p_addr ->> 'line', p_addr ->> 'address1')),
              public.arc_clean(p_addr ->> 'address2')
            )
          ),
          ''
        ),
        'district',
        public.arc_clean(coalesce(p_addr ->> 'district', p_addr ->> 'province')),
        'city', public.arc_clean(p_addr ->> 'city'),
        'postal',
        public.arc_clean(coalesce(p_addr ->> 'postal', p_addr ->> 'zip')),
        'name',
        public.arc_clean(coalesce(p_addr ->> 'name', p_addr ->> 'full_name')),
        'phone', public.arc_clean(p_addr ->> 'phone'),
        'company', public.arc_clean(p_addr ->> 'company_name'),
        'tax_office', public.arc_clean(p_addr ->> 'tax_office'),
        'tax_number', public.arc_clean(p_addr ->> 'tax_number')
      )
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_reprice_supplier(p_supplier text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rule record;
  v_count integer;
begin
  select s.* into v_rule
  from public.arc_suppliers s
  join public.organizations o on o.id = s.organization_id
  where o.slug = 'arvoculture'
    and s.code = p_supplier
  limit 1;

  if not found then
    raise exception 'Tedarikçi bulunamadı: %', p_supplier;
  end if;

  update public.arc_product_variants v
     set price = public.arc_sale_price(
           v.cost_price,
           v_rule.margin_percent,
           v_rule.shipping_markup,
           v_rule.round_to_kurus
         ),
         updated_at = now()
   where v.organization_id = v_rule.organization_id
     and v.supplier = p_supplier
     and v.cost_price is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_resolve_commerce_tenant()
 RETURNS TABLE(organization_id uuid, membership_role text, organization_name text, organization_slug text, plan_code text, organization_status text, commerce_enabled boolean, arc_license_status text, arc_period_end timestamp with time zone, arc_stage text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select organization.id,
         membership.role::text,
         organization.name,
         organization.slug,
         organization.plan_code::text,
         organization.status::text,
         coalesce(module.is_enabled, false),
         coalesce(arc.status, 'inactive'),
         arc.current_period_end,
         public.arc_store_stage(organization.id)
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  left join public.organization_modules module
    on module.organization_id = organization.id and module.module_code = 'commerce'
  left join public.organization_product_licenses arc
    on arc.organization_id = organization.id and arc.product = 'arc'
  where membership.user_id = auth.uid() and membership.is_active = true
  order by (organization.slug = 'arvoculture') desc, membership.joined_at
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer DEFAULT 90)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_cost is null or p_cost <= 0 then null
    when coalesce(p_round, 0) <= 0 then
      (p_cost * (100 + coalesce(p_margin, 0))) / 100 + coalesce(p_shipping, 0)
    else
      -- Lira tabanına yuvarla, sonra istenen kuruş sonunu ekle.
      (
        ceil(
          (
            (p_cost * (100 + coalesce(p_margin, 0))) / 100.0
            + coalesce(p_shipping, 0)
            - p_round
          ) / 100.0
        )::bigint * 100
      ) + p_round
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint DEFAULT 0)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with hesap as (
    select ((coalesce(p_cost, 0) + coalesce(p_service, 0))
            * (100 + coalesce(p_margin, 0)) / 100
            + coalesce(p_shipping, 0))::numeric as ham
  )
  select case
    when coalesce(p_round, 0) <= 0 then round(ham)::bigint
    -- ,90 gibi bir kuruş değerine yuvarla
    else (ceil((ham - p_round) / 100) * 100 + p_round)::bigint
  end
  from hesap;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_current text;
  v_item record;
  v_prev integer;
  v_short jsonb := '[]'::jsonb;
begin
  -- Kurum siparişten türetilir; slug kontrolü YOK.
  select o.organization_id, o.payment_status
    into v_org_id, v_current
  from public.arc_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  -- Tekrarlanan bildirim: sessizce çık.
  if v_current in ('paid', 'refunded', 'partially_refunded') then
    return v_current;
  end if;

  if not p_paid then
    update public.arc_orders
       set payment_status = 'failed',
           status = 'cancelled',
           metadata = metadata || jsonb_build_object(
             'payment_failure_reason', p_failure_reason
           ),
           updated_at = now()
     where id = p_order_id;
    return 'failed';
  end if;

  /*
    Stok düşümü. Yetersizse sipariş ödendi kalır — müşterinin parası
    alınmışken siparişi sessizce iptal etmek yanlış olur — ama aşım artık
    kayda geçiyor.
  */
  for v_item in
    select oi.variant_id, oi.quantity, oi.sku
    from public.arc_order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
  loop
    /*
      Önceki stok kilitlenerek okunur. "returning stock + miktar" işe
      yaramaz: kırpma olduğunda yanlış sonuç verir (1 stoktan 3 düşünce
      0 + 3 = 3 çıkar ve aşım görünmez). FOR UPDATE ayrıca aynı varyanta
      eşzamanlı gelen iki sonuçlandırmayı sıraya sokar.
    */
    select stock into v_prev
    from public.arc_product_variants
    where id = v_item.variant_id
      and organization_id = v_org_id
    for update;

    continue when v_prev is null;

    update public.arc_product_variants
       set stock = greatest(v_prev - v_item.quantity, 0),
           updated_at = now()
     where id = v_item.variant_id
       and organization_id = v_org_id;

    if v_prev < v_item.quantity then
      v_short := v_short || jsonb_build_object(
        'sku', v_item.sku,
        'istenen', v_item.quantity,
        'mevcut', v_prev
      );
    end if;
  end loop;

  if jsonb_array_length(v_short) > 0 then
    insert into public.arc_order_events (organization_id, order_id, event_type, event_data)
    values (v_org_id, p_order_id, 'stock_shortfall',
            jsonb_build_object('items', v_short));
  end if;

  update public.arc_orders
     set payment_status = 'paid',
         status = 'confirmed',
         metadata = metadata || jsonb_build_object(
           'payment_reference', p_payment_reference,
           'paid_at', now()
         ),
         updated_at = now()
   where id = p_order_id;

  return 'paid';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_slugify(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(p_text, ''),
          'ÇĞİIÖŞÜçğıiöşü',
          'cgiiosucgiiosu'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_store_stage(p_organization_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (
      select case
        -- Kurucu iptal ettiyse kademe işletilmez.
        when l.status = 'canceled' then 'closed'
        -- Süresi dolmamış aktif ya da deneme lisansı: her şey açık.
        when l.status in ('active','trialing')
             and (l.current_period_end is null or l.current_period_end > now())
          then 'open'
        -- Kurucu elle askıya aldıysa satış da durur; vitrin görünür kalır.
        when l.status = 'suspended' then 'sales_closed'
        -- Dönem sonu yoksa kademe sayılamaz; en hafif yaptırım uygulanır.
        when l.current_period_end is null then 'panel_closed'
        when now() < l.current_period_end + interval '1 month' then 'panel_closed'
        when now() < l.current_period_end + interval '2 months' then 'sales_closed'
        else 'closed'
      end
      from public.organization_product_licenses l
      where l.organization_id = p_organization_id and l.product = 'arc'
    ),
    -- Lisans satırı hiç yok: abonelik henüz başlamamış demektir, gecikmiş
    -- değil. Kurum meşruysa mağaza açık kalır; değilse kapalı.
    (
      select case when o.status in ('active','trial') then 'open' else 'closed' end
      from public.organizations o
      where o.id = p_organization_id
    ),
    'closed'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.arc_total_stock_units()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(v.stock), 0)::bigint
  from public.arc_product_variants v
  where v.organization_id = (
    select t.organization_id from public.arc_resolve_commerce_tenant() t limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=auth.uid();v_order record;v_item record;v_variant record;v_old_terminal boolean;v_new_terminal boolean;
begin
if v_user_id is null then raise exception 'Authentication required';end if;
if p_status not in ('pending','confirmed','processing','fulfilled','cancelled','refunded') then raise exception 'Invalid order status';end if;
if p_payment_status not in ('pending','authorized','paid','partially_refunded','refunded','failed') then raise exception 'Invalid payment status';end if;
select id,organization_id,order_number,source,status into v_order from public.arc_orders where id=p_order_id for update;
if not found then raise exception 'Order not found';end if;
if not exists(select 1 from public.organization_memberships membership where membership.organization_id=v_order.organization_id and membership.user_id=v_user_id and membership.is_active=true and membership.role::text in ('owner','admin','manager')) then raise exception 'Insufficient permissions';end if;
v_old_terminal:=v_order.status in ('cancelled','refunded');v_new_terminal:=p_status in ('cancelled','refunded');
if v_order.source='native' and v_old_terminal<>v_new_terminal then
for v_item in select variant_id,quantity from public.arc_order_items where organization_id=v_order.organization_id and order_id=v_order.id and variant_id is not null loop
select id,stock,allow_backorder into v_variant from public.arc_product_variants where id=v_item.variant_id and organization_id=v_order.organization_id for update;
if not found then raise exception 'Order variant not found';end if;
if v_new_terminal then
update public.arc_product_variants set stock=stock+v_item.quantity,updated_at=now() where id=v_variant.id;
insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by) values(v_order.organization_id,v_variant.id,'return',v_item.quantity,'order_status',v_order.id::text,'Sipariş iptal/iade: '||v_order.order_number,v_user_id);
else
if v_variant.stock<v_item.quantity and not v_variant.allow_backorder then raise exception 'Insufficient stock to reopen order %',v_order.order_number;end if;
update public.arc_product_variants set stock=stock-v_item.quantity,updated_at=now() where id=v_variant.id;
insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by) values(v_order.organization_id,v_variant.id,'sale',-v_item.quantity,'order_status',v_order.id::text,'Sipariş yeniden açıldı: '||v_order.order_number,v_user_id);
end if;end loop;end if;
update public.arc_orders set status=p_status,payment_status=p_payment_status,updated_at=now() where id=v_order.id and organization_id=v_order.organization_id;
end;$function$
;

CREATE OR REPLACE FUNCTION public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    -- Tedarikçi ürünü: tampon kuralı
    when p_supplier is not null then
      coalesce(p_stock, 0) > coalesce(
        (select stock_buffer from public.arc_suppliers
         where code = p_supplier limit 1),
        5
      )
    -- Kendi ürünümüz
    else coalesce(p_stock, 0) > 0 or coalesce(p_allow_backorder, false)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.attach_arvoculture_order_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null and auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_arvoculture_coupon(p_code text, p_subtotal bigint DEFAULT 0, p_email text DEFAULT NULL::text)
 RETURNS TABLE(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_check_coupon(
    (select id from public.organizations where slug = 'arvoculture' limit 1),
    p_code, p_subtotal, p_email)
$function$
;

CREATE OR REPLACE FUNCTION public.claim_arvoculture_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_verified boolean :=
    coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
    or coalesce((auth.jwt() ->> 'email_verified')::boolean, false);
  v_imported boolean;
  v_count integer;
  v_name text;
  v_phone text;
  v_meta jsonb;
  v_addr jsonb;
  v_line text;
  v_city text;
  v_district text;
  v_postal text;
  v_row record;
  v_seq integer := 0;
begin
  if v_user_id is null or v_email = '' or not v_verified then
    return 0;
  end if;

  -- --- 1. Siparişleri hesaba bağla -------------------------
  update public.arc_orders
     set user_id = v_user_id, updated_at = now()
   where user_id is null
     and lower(customer_email) = v_email;

  get diagnostics v_count = row_count;

  -- --- 2. Ad ve telefon ------------------------------------
  select o.customer_name, o.metadata
    into v_name, v_meta
  from public.arc_orders o
  where o.user_id = v_user_id
  order by o.created_at desc
  limit 1;

  v_addr := public.arc_find_address(coalesce(v_meta, '{}'::jsonb));

  v_phone := coalesce(
    public.arc_clean(v_addr ->> 'phone'),
    public.arc_clean(v_meta ->> 'phone')
  );

  v_name := coalesce(
    public.arc_clean(v_name),
    public.arc_clean(v_addr ->> 'name')
  );

  update auth.users u
     set raw_user_meta_data =
           coalesce(u.raw_user_meta_data, '{}'::jsonb)
           || jsonb_strip_nulls(
                jsonb_build_object(
                  'full_name',
                  case when coalesce(u.raw_user_meta_data ->> 'full_name', '') = ''
                       then v_name end,
                  'phone',
                  case when coalesce(u.raw_user_meta_data ->> 'phone', '') = ''
                       then v_phone end
                )
              )
   where u.id = v_user_id;

  -- --- 3. Adresler: yalnızca bir kez ------------------------
  select coalesce(
           (raw_user_meta_data ->> 'addresses_imported')::boolean,
           false
         )
    into v_imported
  from auth.users
  where id = v_user_id;

  if v_imported then
    -- Aktarım daha önce yapıldı. Müşterinin sildiği adresleri
    -- geri getirmiyoruz.
    return v_count;
  end if;

  for v_row in
    select o.customer_name, o.metadata as meta, o.created_at
    from public.arc_orders o
    where o.user_id = v_user_id
    order by o.created_at desc
  loop
    v_addr := public.arc_find_address(coalesce(v_row.meta, '{}'::jsonb));

    v_line := coalesce(
      public.arc_clean(v_addr ->> 'line'),
      public.arc_address_line(v_addr)
    );

    if v_line is null then
      continue;
    end if;

    v_city := coalesce(public.arc_clean(v_addr ->> 'city'), '-');
    v_district := coalesce(
      public.arc_clean(v_addr ->> 'district'),
      public.arc_clean(v_addr ->> 'province'),
      '-'
    );
    v_postal := coalesce(
      public.arc_clean(v_addr ->> 'postal'),
      public.arc_clean(v_addr ->> 'zip')
    );

    if exists (
      select 1 from public.arc_customer_addresses a
      where a.user_id = v_user_id
        and lower(trim(a.line)) = lower(v_line)
        and lower(trim(a.city)) = lower(v_city)
    ) then
      continue;
    end if;

    v_seq := v_seq + 1;

    insert into public.arc_customer_addresses (
      user_id, title, full_name, phone,
      city, district, postal_code, line,
      is_billing, is_shipping, is_default
    )
    values (
      v_user_id,
      case when v_seq = 1 then 'Ev' else 'Kayıtlı adres ' || v_seq end,
      coalesce(
        public.arc_clean(v_row.customer_name),
        public.arc_clean(v_addr ->> 'name'),
        'Ad Soyad'
      ),
      coalesce(
        public.arc_clean(v_addr ->> 'phone'),
        public.arc_clean(v_row.meta ->> 'phone'),
        '-'
      ),
      v_city,
      v_district,
      v_postal,
      v_line,
      true,
      true,
      v_seq = 1 and not exists (
        select 1 from public.arc_customer_addresses a2
        where a2.user_id = v_user_id and a2.is_default
      )
    );
  end loop;

  -- Aktarım tamamlandı; bir daha çalışmayacak.
  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('addresses_imported', true)
   where id = v_user_id;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.arc_orders%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days integer;
begin
  if v_uid is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  select * into v_order
  from public.arc_orders o
  join public.organizations org
    on org.id = o.organization_id and org.slug = 'arvoculture'
  where o.order_number = p_order_number
    and o.user_id = v_uid
  limit 1;

  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Ödemesi tamamlanmamış sipariş için iade talebi açılamaz.';
  end if;

  /*
    Cayma süresi. Teslim tarihi kayıtlı değilse sipariş
    tarihinden sayılıyor; müşteri lehine geniş yorum.
  */
  v_days := extract(day from now() - v_order.created_at);

  if v_days > 30 then
    raise exception 'İade süresi dolmuş.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'İade sebebi belirtilmeli.';
  end if;

  insert into public.arc_return_requests
    (organization_id, order_id, user_id, items, reason, note)
  values
    (v_order.organization_id, v_order.id, v_uid,
     coalesce(p_items, '[]'::jsonb), trim(p_reason), nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Bu sipariş için zaten açık bir iade talebiniz var.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
begin
  select id into v_org_id from public.organizations where slug = 'arvoculture' limit 1;
  if v_org_id is null then
    raise exception 'Organizasyon bulunamadı';
  end if;
  return query select * from public.arc_create_storefront_order(
    v_org_id, p_email, p_name, p_phone, p_address, p_items, p_coupon_code);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_my_orders()
 RETURNS TABLE(order_number text, status text, payment_status text, subtotal bigint, discount bigint, shipping bigint, total bigint, currency text, coupon_code text, address jsonb, billing_address jsonb, note text, created_at timestamp with time zone, items jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    o.order_number,
    o.status,
    o.payment_status,
    coalesce(o.subtotal, 0) as subtotal,
    coalesce((o.metadata ->> 'discount')::bigint, 0) as discount,
    coalesce(o.shipping, 0) as shipping,
    coalesce(o.total, 0) as total,
    o.currency,
    o.metadata ->> 'coupon_code' as coupon_code,

    -- Teslimat adresi: hangi yapıda gelirse gelsin normalleştirilir.
    coalesce(
      public.arc_normalize_address(o.metadata -> 'shipping_address'),
      public.arc_normalize_address(o.metadata -> 'address'),
      public.arc_normalize_address(o.metadata -> 'billing')
    ) as address,

    -- Fatura adresi. Ayrı tanımlı değilse teslimat adresi kullanılır.
    coalesce(
      public.arc_normalize_address(o.metadata -> 'billing'),
      public.arc_normalize_address(o.metadata -> 'billing_address'),
      public.arc_normalize_address(o.metadata -> 'shipping_address'),
      public.arc_normalize_address(o.metadata -> 'address')
    ) as billing_address,

    public.arc_clean(o.metadata ->> 'note') as note,
    o.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', i.product_name,
            'sku', i.sku,
            'quantity', i.quantity,
            'unit_price', i.unit_price,
            'total', i.total,
            'slug', p.slug,
            'image', p.metadata -> 'image_paths' ->> 0
          )
          order by i.id
        )
        from public.arc_order_items i
        left join lateral (
          select v.*
          from public.arc_product_variants v
          where (i.variant_id is not null and v.id = i.variant_id)
             or (
               i.variant_id is null
               and i.sku is not null
               and v.organization_id = i.organization_id
               and v.sku = i.sku
             )
          limit 1
        ) v on true
        left join public.arc_products p
          on p.id = v.product_id
        where i.order_id = o.id
      ),
      '[]'::jsonb
    ) as items
  from public.arc_orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_my_returns()
 RETURNS TABLE(id uuid, order_number text, items jsonb, reason text, status text, status_note text, refund_amount bigint, created_at timestamp with time zone, resolved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    r.id, o.order_number, r.items, r.reason,
    r.status, r.status_note, r.refund_amount,
    r.created_at, r.resolved_at
  from public.arc_return_requests r
  join public.arc_orders o on o.id = r.order_id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 50;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products(p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and o.slug = 'arvoculture'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collections()
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and o.slug = 'arvoculture'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_deals(p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_discounts()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.id,d.name,d.code,d.discount_type,d.value,d.minimum_subtotal,d.combinable,
    coalesce(nullif(d.metadata ->> 'badge', ''), d.name) as badge
  from public.arc_discounts d
  join public.organizations o on o.id=d.organization_id
  where o.slug='arvoculture' and d.status='active'
    and (d.starts_at is null or d.starts_at<=now())
    and (d.ends_at is null or d.ends_at>now())
    and (d.usage_limit is null or d.usage_count<d.usage_limit)
  order by d.code nulls first,d.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_facets()
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    on o.id = p.organization_id and o.slug = 'arvoculture'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product(p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_badges()
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   and o.slug = 'arvoculture'
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct p.id)::integer
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_slugs(p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products_page(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_search_index(p_limit integer DEFAULT 20000)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    on o.id = p.organization_id and o.slug = 'arvoculture'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_settings()
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3)
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.slug = 'arvoculture'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_variants(p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    v.sku,
    coalesce(nullif(trim(v.title), ''), v.sku) as title,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 1)), '') as color,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 2)), '') as size,
    v.price,
    v.compare_at_price,
    v.stock,
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
      as available
  from public.arc_product_variants v
  join public.arc_products p
    on p.id = v.product_id
   and p.organization_id = v.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  order by
    case upper(trim(split_part(coalesce(v.title, ''), '/', 2)))
      when 'XXS' then 1 when 'XS' then 2 when 'S' then 3
      when 'M' then 4 when 'L' then 5 when 'XL' then 6
      when '2XL' then 7 when 'XXL' then 7
      when '3XL' then 8 when '4XL' then 9
      else 50
    end,
    v.price,
    v.sku
  limit 60;
$function$
;

CREATE OR REPLACE FUNCTION public.get_storefront_seller(p_tenant text DEFAULT 'arvoculture'::text)
 RETURNS TABLE(legal_name text, trade_name text, mersis_no text, tax_office text, tax_number text, trade_registry_no text, address_line text, address_district text, address_city text, address_country text, contact_email text, contact_phone text, whatsapp_number text, kep_address text, etbis_verified boolean, storefront_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.legal_name,
    coalesce(s.trade_name, o.name) as trade_name,
    s.mersis_no,
    s.tax_office,
    s.tax_number,
    s.trade_registry_no,
    s.address_line,
    s.address_district,
    s.address_city,
    coalesce(s.address_country, 'Türkiye') as address_country,
    s.contact_email,
    s.contact_phone,
    s.whatsapp_number,
    s.kep_address,
    coalesce(s.etbis_verified, false) as etbis_verified,
    s.storefront_url
  from public.arc_store_settings s
  join public.organizations o
    on o.id = s.organization_id
  where o.slug = p_tenant
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_settle_storefront_order(p_order_id, p_paid, p_payment_reference, p_failure_reason);
$function$
;

CREATE OR REPLACE FUNCTION public.update_arvoculture_profile(p_full_name text, p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadı';
  end if;

  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object(
                'full_name', nullif(trim(p_full_name), ''),
                'phone', nullif(trim(p_phone), '')
              )
   where id = auth.uid();
end;
$function$
;

alter table public.arc_collection_products alter column "position" set default 0;

alter table public.arc_collection_products alter column created_at set default now();

alter table public.arc_collections alter column created_at set default now();

alter table public.arc_collections alter column description set default ''::text;

alter table public.arc_collections alter column id set default gen_random_uuid();

alter table public.arc_collections alter column metadata set default '{}'::jsonb;

alter table public.arc_collections alter column seo_description set default ''::text;

alter table public.arc_collections alter column seo_title set default ''::text;

alter table public.arc_collections alter column source set default 'native'::text;

alter table public.arc_collections alter column status set default 'active'::text;

alter table public.arc_collections alter column updated_at set default now();

alter table public.arc_customer_addresses alter column created_at set default now();

alter table public.arc_customer_addresses alter column id set default gen_random_uuid();

alter table public.arc_customer_addresses alter column is_billing set default true;

alter table public.arc_customer_addresses alter column is_default set default false;

alter table public.arc_customer_addresses alter column is_shipping set default true;

alter table public.arc_customer_addresses alter column updated_at set default now();

alter table public.arc_customer_favourites alter column created_at set default now();

alter table public.arc_customer_favourites alter column id set default gen_random_uuid();

alter table public.arc_customer_favourites alter column user_id set default auth.uid();

alter table public.arc_discounts alter column combinable set default false;

alter table public.arc_discounts alter column created_at set default now();

alter table public.arc_discounts alter column id set default gen_random_uuid();

alter table public.arc_discounts alter column metadata set default '{}'::jsonb;

alter table public.arc_discounts alter column minimum_subtotal set default 0;

alter table public.arc_discounts alter column status set default 'draft'::text;

alter table public.arc_discounts alter column updated_at set default now();

alter table public.arc_discounts alter column usage_count set default 0;

alter table public.arc_discounts alter column value set default 0;

alter table public.arc_import_batches alter column created_at set default now();

alter table public.arc_import_batches alter column error_rows set default 0;

alter table public.arc_import_batches alter column id set default gen_random_uuid();

alter table public.arc_import_batches alter column imported_rows set default 0;

alter table public.arc_import_batches alter column metadata set default '{}'::jsonb;

alter table public.arc_import_batches alter column skipped_rows set default 0;

alter table public.arc_import_batches alter column source set default 'shopify'::text;

alter table public.arc_import_batches alter column status set default 'processing'::text;

alter table public.arc_import_batches alter column total_rows set default 0;

alter table public.arc_import_errors alter column created_at set default now();

alter table public.arc_import_errors alter column id set default gen_random_uuid();

alter table public.arc_import_errors alter column payload set default '{}'::jsonb;

alter table public.arc_inventory_movements alter column created_at set default now();

alter table public.arc_inventory_movements alter column id set default gen_random_uuid();

alter table public.arc_order_events alter column created_at set default now();

alter table public.arc_order_events alter column event_data set default '{}'::jsonb;

alter table public.arc_order_events alter column id set default gen_random_uuid();

alter table public.arc_order_items alter column id set default gen_random_uuid();

alter table public.arc_orders alter column created_at set default now();

alter table public.arc_orders alter column currency set default 'TRY'::text;

alter table public.arc_orders alter column id set default gen_random_uuid();

alter table public.arc_orders alter column metadata set default '{}'::jsonb;

alter table public.arc_orders alter column payment_status set default 'pending'::text;

alter table public.arc_orders alter column shipping set default 0;

alter table public.arc_orders alter column source set default 'native'::text;

alter table public.arc_orders alter column status set default 'pending'::text;

alter table public.arc_orders alter column subtotal set default 0;

alter table public.arc_orders alter column tax set default 0;

alter table public.arc_orders alter column total set default 0;

alter table public.arc_orders alter column updated_at set default now();

alter table public.arc_payment_orders alter column created_at set default now();

alter table public.arc_payment_orders alter column currency set default 'TL'::text;

alter table public.arc_payment_orders alter column id set default gen_random_uuid();

alter table public.arc_payment_orders alter column payment_method set default 'card'::text;

alter table public.arc_payment_orders alter column paytr_test_mode set default false;

alter table public.arc_payment_orders alter column status set default 'awaiting_payment'::text;

alter table public.arc_payment_orders alter column updated_at set default now();

alter table public.arc_product_variants alter column allow_backorder set default true;

alter table public.arc_product_variants alter column attributes set default '{}'::jsonb;

alter table public.arc_product_variants alter column created_at set default now();

alter table public.arc_product_variants alter column currency set default 'TRY'::text;

alter table public.arc_product_variants alter column id set default gen_random_uuid();

alter table public.arc_product_variants alter column price set default 0;

alter table public.arc_product_variants alter column stock set default 0;

alter table public.arc_product_variants alter column updated_at set default now();

alter table public.arc_products alter column created_at set default now();

alter table public.arc_products alter column description set default ''::text;

alter table public.arc_products alter column id set default gen_random_uuid();

alter table public.arc_products alter column metadata set default '{}'::jsonb;

alter table public.arc_products alter column source set default 'native'::text;

alter table public.arc_products alter column status set default 'draft'::text;

alter table public.arc_products alter column updated_at set default now();

alter table public.arc_return_requests alter column created_at set default now();

alter table public.arc_return_requests alter column id set default gen_random_uuid();

alter table public.arc_return_requests alter column items set default '[]'::jsonb;

alter table public.arc_return_requests alter column status set default 'beklemede'::text;

alter table public.arc_return_requests alter column updated_at set default now();

alter table public.arc_store_settings alter column accent_color set default '#6f9548'::text;

alter table public.arc_store_settings alter column address_country set default 'Türkiye'::text;

alter table public.arc_store_settings alter column bank_transfer_discount_percent set default 3;

alter table public.arc_store_settings alter column bank_transfer_enabled set default false;

alter table public.arc_store_settings alter column created_at set default now();

alter table public.arc_store_settings alter column currency set default 'TRY'::text;

alter table public.arc_store_settings alter column default_tax_rate set default 20;

alter table public.arc_store_settings alter column domain_status set default 'not_configured'::text;

alter table public.arc_store_settings alter column etbis_verified set default false;

alter table public.arc_store_settings alter column free_shipping_threshold set default 200000;

alter table public.arc_store_settings alter column locale set default 'tr-TR'::text;

alter table public.arc_store_settings alter column low_stock_threshold set default 5;

alter table public.arc_store_settings alter column order_prefix set default 'AC'::text;

alter table public.arc_store_settings alter column panel_domain_status set default 'not_configured'::text;

alter table public.arc_store_settings alter column paytr_enabled set default false;

alter table public.arc_store_settings alter column paytr_max_installment set default 0;

alter table public.arc_store_settings alter column paytr_no_installment set default false;

alter table public.arc_store_settings alter column paytr_test_mode set default true;

alter table public.arc_store_settings alter column primary_color set default '#002045'::text;

alter table public.arc_store_settings alter column shipping_fee set default 12000;

alter table public.arc_store_settings alter column updated_at set default now();

alter table public.arc_store_themes alter column config set default '{}'::jsonb;

alter table public.arc_store_themes alter column created_at set default now();

alter table public.arc_store_themes alter column id set default gen_random_uuid();

alter table public.arc_store_themes alter column updated_at set default now();

alter table public.arc_store_themes alter column version set default 1;

alter table public.arc_suppliers alter column active set default true;

alter table public.arc_suppliers alter column brand_override set default 'ArvoCulture'::text;

alter table public.arc_suppliers alter column created_at set default now();

alter table public.arc_suppliers alter column id set default gen_random_uuid();

alter table public.arc_suppliers alter column margin_percent set default 40;

alter table public.arc_suppliers alter column publish_directly set default false;

alter table public.arc_suppliers alter column round_to_kurus set default 90;

alter table public.arc_suppliers alter column service_fee set default 0;

alter table public.arc_suppliers alter column shipping_markup set default 6000;

alter table public.arc_suppliers alter column stock_buffer set default 5;

alter table public.arc_suppliers alter column sync_cursor set default 0;

alter table public.arc_suppliers alter column sync_total set default 0;

alter table public.arc_suppliers alter column updated_at set default now();

alter table public.organization_memberships alter column is_active set default true;

alter table public.organization_memberships alter column joined_at set default now();

alter table public.organization_memberships alter column permissions set default '{}'::jsonb;

alter table public.organization_memberships alter column role set default 'member'::membership_role;

alter table public.organization_memberships alter column role_from_management set default false;

alter table public.organization_modules alter column configuration set default '{}'::jsonb;

alter table public.organization_modules alter column enabled_at set default now();

alter table public.organization_modules alter column is_enabled set default true;

alter table public.organization_product_licenses alter column created_at set default now();

alter table public.organization_product_licenses alter column status set default 'inactive'::text;

alter table public.organization_product_licenses alter column updated_at set default now();

alter table public.organizations alter column created_at set default now();

alter table public.organizations alter column id set default gen_random_uuid();

alter table public.organizations alter column kind set default 'customer'::text;

alter table public.organizations alter column primary_color set default '#183f31'::text;

alter table public.organizations alter column provisioning_state set default 'creating'::text;

alter table public.organizations alter column sector set default 'general'::text;

alter table public.organizations alter column status set default 'trial'::organization_status;

alter table public.organizations alter column updated_at set default now();

alter table public.arc_collection_products add constraint arc_collection_products_pkey PRIMARY KEY (collection_id, product_id);

alter table public.arc_collection_products add constraint arc_collection_products_position_check CHECK (("position" >= 0));

alter table public.arc_collections add constraint arc_collections_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_collections add constraint arc_collections_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_collections add constraint arc_collections_organization_id_slug_key UNIQUE (organization_id, slug);

alter table public.arc_collections add constraint arc_collections_pkey PRIMARY KEY (id);

alter table public.arc_collections add constraint arc_collections_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));

alter table public.arc_collections add constraint arc_collections_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_collections add constraint arc_collections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));

alter table public.arc_collections add constraint arc_collections_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)));

alter table public.arc_customer_addresses add constraint arc_customer_addresses_pkey PRIMARY KEY (id);

alter table public.arc_customer_favourites add constraint arc_customer_favourites_pkey PRIMARY KEY (id);

alter table public.arc_customer_favourites add constraint arc_customer_favourites_slug_format CHECK ((product_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'::text));

alter table public.arc_customer_favourites add constraint arc_customer_favourites_unique UNIQUE (user_id, product_slug);

alter table public.arc_discounts add constraint arc_discounts_check CHECK ((((discount_type = 'percentage'::text) AND ((value >= 1) AND (value <= 100))) OR ((discount_type = 'fixed_amount'::text) AND (value > 0)) OR ((discount_type = 'free_shipping'::text) AND (value = 0))));

alter table public.arc_discounts add constraint arc_discounts_check1 CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at)));

alter table public.arc_discounts add constraint arc_discounts_code_check CHECK (((code IS NULL) OR (code ~ '^[A-Z0-9_-]{2,40}$'::text)));

alter table public.arc_discounts add constraint arc_discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text, 'free_shipping'::text])));

alter table public.arc_discounts add constraint arc_discounts_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_discounts add constraint arc_discounts_minimum_subtotal_check CHECK ((minimum_subtotal >= 0));

alter table public.arc_discounts add constraint arc_discounts_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 160)));

alter table public.arc_discounts add constraint arc_discounts_organization_id_code_key UNIQUE (organization_id, code);

alter table public.arc_discounts add constraint arc_discounts_per_customer_limit_check CHECK (((per_customer_limit IS NULL) OR (per_customer_limit > 0)));

alter table public.arc_discounts add constraint arc_discounts_pkey PRIMARY KEY (id);

alter table public.arc_discounts add constraint arc_discounts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'expired'::text])));

alter table public.arc_discounts add constraint arc_discounts_usage_count_check CHECK ((usage_count >= 0));

alter table public.arc_discounts add constraint arc_discounts_usage_limit_check CHECK (((usage_limit IS NULL) OR (usage_limit > 0)));

alter table public.arc_discounts add constraint arc_discounts_value_check CHECK ((value >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_error_rows_check CHECK ((error_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_imported_rows_check CHECK ((imported_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_kind_check CHECK ((kind = ANY (ARRAY['products'::text, 'orders'::text])));

alter table public.arc_import_batches add constraint arc_import_batches_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_import_batches add constraint arc_import_batches_pkey PRIMARY KEY (id);

alter table public.arc_import_batches add constraint arc_import_batches_skipped_rows_check CHECK ((skipped_rows >= 0));

alter table public.arc_import_batches add constraint arc_import_batches_source_check CHECK ((source = 'shopify'::text));

alter table public.arc_import_batches add constraint arc_import_batches_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));

alter table public.arc_import_batches add constraint arc_import_batches_total_rows_check CHECK ((total_rows >= 0));

alter table public.arc_import_errors add constraint arc_import_errors_pkey PRIMARY KEY (id);

alter table public.arc_inventory_movements add constraint arc_inventory_movements_kind_check CHECK ((kind = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text, 'sale'::text, 'return'::text, 'sync'::text])));

alter table public.arc_inventory_movements add constraint arc_inventory_movements_pkey PRIMARY KEY (id);

alter table public.arc_order_events add constraint arc_order_events_event_data_check CHECK ((jsonb_typeof(event_data) = 'object'::text));

alter table public.arc_order_events add constraint arc_order_events_event_type_check CHECK ((event_type = ANY (ARRAY['status_updated'::text, 'fulfillment_updated'::text])));

alter table public.arc_order_events add constraint arc_order_events_pkey PRIMARY KEY (id);

alter table public.arc_order_items add constraint arc_order_items_pkey PRIMARY KEY (id);

alter table public.arc_order_items add constraint arc_order_items_quantity_check CHECK ((quantity > 0));

alter table public.arc_order_items add constraint arc_order_items_total_check CHECK ((total >= 0));

alter table public.arc_order_items add constraint arc_order_items_unit_price_check CHECK ((unit_price >= 0));

alter table public.arc_orders add constraint arc_orders_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_orders add constraint arc_orders_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_orders add constraint arc_orders_organization_id_order_number_key UNIQUE (organization_id, order_number);

alter table public.arc_orders add constraint arc_orders_organization_id_source_external_id_key UNIQUE (organization_id, source, external_id);

alter table public.arc_orders add constraint arc_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'authorized'::text, 'paid'::text, 'partially_refunded'::text, 'refunded'::text, 'failed'::text])));

alter table public.arc_orders add constraint arc_orders_pkey PRIMARY KEY (id);

alter table public.arc_orders add constraint arc_orders_shipping_check CHECK ((shipping >= 0));

alter table public.arc_orders add constraint arc_orders_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_orders add constraint arc_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'fulfilled'::text, 'cancelled'::text, 'refunded'::text])));

alter table public.arc_orders add constraint arc_orders_subtotal_check CHECK ((subtotal >= 0));

alter table public.arc_orders add constraint arc_orders_tax_check CHECK ((tax >= 0));

alter table public.arc_orders add constraint arc_orders_total_check CHECK ((total >= 0));

alter table public.arc_payment_orders add constraint arc_payment_orders_expected_amount_check CHECK ((expected_amount > 0));

alter table public.arc_payment_orders add constraint arc_payment_orders_merchant_oid_key UNIQUE (merchant_oid);

alter table public.arc_payment_orders add constraint arc_payment_orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['card'::text, 'eft'::text])));

alter table public.arc_payment_orders add constraint arc_payment_orders_pkey PRIMARY KEY (id);

alter table public.arc_payment_orders add constraint arc_payment_orders_status_check CHECK ((status = ANY (ARRAY['awaiting_payment'::text, 'paid'::text, 'failed'::text, 'cancelled'::text])));

alter table public.arc_product_variants add constraint arc_product_variants_attributes_check CHECK ((jsonb_typeof(attributes) = 'object'::text));

alter table public.arc_product_variants add constraint arc_product_variants_compare_at_price_check CHECK (((compare_at_price IS NULL) OR (compare_at_price >= 0)));

alter table public.arc_product_variants add constraint arc_product_variants_id_organization_id_key UNIQUE (id, organization_id);

alter table public.arc_product_variants add constraint arc_product_variants_organization_id_external_id_key UNIQUE (organization_id, external_id);

alter table public.arc_product_variants add constraint arc_product_variants_pkey PRIMARY KEY (id);

alter table public.arc_product_variants add constraint arc_product_variants_price_check CHECK ((price >= 0));

alter table public.arc_products add constraint arc_products_id_organization_key UNIQUE (id, organization_id);

alter table public.arc_products add constraint arc_products_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text));

alter table public.arc_products add constraint arc_products_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200)));

alter table public.arc_products add constraint arc_products_organization_id_slug_key UNIQUE (organization_id, slug);

alter table public.arc_products add constraint arc_products_organization_id_source_external_id_key UNIQUE (organization_id, source, external_id);

alter table public.arc_products add constraint arc_products_pkey PRIMARY KEY (id);

alter table public.arc_products add constraint arc_products_source_check CHECK ((source = ANY (ARRAY['native'::text, 'shopify'::text])));

alter table public.arc_products add constraint arc_products_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])));

alter table public.arc_return_requests add constraint arc_return_requests_pkey PRIMARY KEY (id);

alter table public.arc_return_requests add constraint arc_return_status_check CHECK ((status = ANY (ARRAY['beklemede'::text, 'onaylandi'::text, 'reddedildi'::text, 'tamamlandi'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_accent_color_check CHECK ((accent_color ~ '^#[0-9A-Fa-f]{6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_bank_iban_check CHECK (((bank_iban IS NULL) OR (bank_iban ~ '^TR[0-9]{24}$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_custom_domain_check CHECK (((custom_domain IS NULL) OR (custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_domain_status_check CHECK ((domain_status = ANY (ARRAY['not_configured'::text, 'pending_dns'::text, 'verifying'::text, 'active'::text, 'failed'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_locale_check CHECK (((char_length(locale) >= 2) AND (char_length(locale) <= 20)));

alter table public.arc_store_settings add constraint arc_store_settings_low_stock_threshold_check CHECK (((low_stock_threshold >= 0) AND (low_stock_threshold <= 10000)));

alter table public.arc_store_settings add constraint arc_store_settings_order_prefix_check CHECK ((order_prefix ~ '^[A-Z]{1,6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_panel_custom_domain_check CHECK (((panel_custom_domain IS NULL) OR (panel_custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_panel_domain_status_check CHECK ((panel_domain_status = ANY (ARRAY['not_configured'::text, 'pending_dns'::text, 'verifying'::text, 'active'::text, 'failed'::text])));

alter table public.arc_store_settings add constraint arc_store_settings_paytr_installment_check CHECK (((paytr_max_installment >= 0) AND (paytr_max_installment <= 12)));

alter table public.arc_store_settings add constraint arc_store_settings_pkey PRIMARY KEY (organization_id);

alter table public.arc_store_settings add constraint arc_store_settings_platform_subdomain_check CHECK (((platform_subdomain IS NULL) OR (platform_subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_primary_color_check CHECK ((primary_color ~ '^#[0-9A-Fa-f]{6}$'::text));

alter table public.arc_store_settings add constraint arc_store_settings_shipping_check CHECK (((shipping_fee >= 0) AND (free_shipping_threshold >= 0)));

alter table public.arc_store_settings add constraint arc_store_settings_store_name_check CHECK (((char_length(store_name) >= 1) AND (char_length(store_name) <= 160)));

alter table public.arc_store_settings add constraint arc_store_settings_storefront_url_check CHECK (((storefront_url IS NULL) OR (storefront_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?(?:/.*)?$'::text)));

alter table public.arc_store_settings add constraint arc_store_settings_transfer_discount_check CHECK (((bank_transfer_discount_percent >= (0)::numeric) AND (bank_transfer_discount_percent <= (100)::numeric)));

alter table public.arc_store_themes add constraint arc_store_themes_config_check CHECK ((jsonb_typeof(config) = 'object'::text));

alter table public.arc_store_themes add constraint arc_store_themes_mode_check CHECK ((mode = ANY (ARRAY['draft'::text, 'published'::text])));

alter table public.arc_store_themes add constraint arc_store_themes_organization_id_mode_key UNIQUE (organization_id, mode);

alter table public.arc_store_themes add constraint arc_store_themes_pkey PRIMARY KEY (id);

alter table public.arc_store_themes add constraint arc_store_themes_version_check CHECK ((version > 0));

alter table public.arc_suppliers add constraint arc_suppliers_organization_id_code_key UNIQUE (organization_id, code);

alter table public.arc_suppliers add constraint arc_suppliers_pkey PRIMARY KEY (id);

alter table public.organization_memberships add constraint organization_memberships_permissions_check CHECK ((jsonb_typeof(permissions) = 'object'::text));

alter table public.organization_memberships add constraint organization_memberships_pkey PRIMARY KEY (organization_id, user_id);

alter table public.organization_modules add constraint organization_modules_configuration_check CHECK ((jsonb_typeof(configuration) = 'object'::text));

alter table public.organization_modules add constraint organization_modules_pkey PRIMARY KEY (organization_id, module_code);

alter table public.organization_product_licenses add constraint organization_product_licenses_monthly_fee_check CHECK (((monthly_fee IS NULL) OR (monthly_fee > 0)));

alter table public.organization_product_licenses add constraint organization_product_licenses_pkey PRIMARY KEY (organization_id, product);

alter table public.organization_product_licenses add constraint organization_product_licenses_product_check CHECK ((product = ANY (ARRAY['arvolab'::text, 'arc'::text])));

alter table public.organization_product_licenses add constraint organization_product_licenses_status_check CHECK ((status = ANY (ARRAY['inactive'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text])));

alter table public.organizations add constraint organizations_bank_account_holder_len CHECK (((bank_account_holder IS NULL) OR ((char_length(bank_account_holder) >= 1) AND (char_length(bank_account_holder) <= 200)))) NOT VALID;

alter table public.organizations add constraint organizations_bank_name_len CHECK (((bank_name IS NULL) OR ((char_length(bank_name) >= 1) AND (char_length(bank_name) <= 120)))) NOT VALID;

alter table public.organizations add constraint organizations_brand_color_format CHECK (((brand_color IS NULL) OR (brand_color ~* '^#[0-9a-f]{6}$'::text)));

alter table public.organizations add constraint organizations_custom_domain_key UNIQUE (custom_domain);

alter table public.organizations add constraint organizations_custom_domain_status_check CHECK ((custom_domain_status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])));

alter table public.organizations add constraint organizations_iban_format CHECK (((iban IS NULL) OR ((iban ~ '^TR[0-9]{24}$'::text) AND (((((substr(iban, 5) || '2927'::text) || substr(iban, 3, 2)))::numeric % (97)::numeric) = (1)::numeric)))) NOT VALID;

alter table public.organizations add constraint organizations_kind_check CHECK ((kind = ANY (ARRAY['customer'::text, 'internal'::text])));

alter table public.organizations add constraint organizations_legal_address_len CHECK (((legal_address IS NULL) OR ((char_length(legal_address) >= 1) AND (char_length(legal_address) <= 500)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_city_len CHECK (((legal_city IS NULL) OR ((char_length(legal_city) >= 1) AND (char_length(legal_city) <= 60)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_district_len CHECK (((legal_district IS NULL) OR ((char_length(legal_district) >= 1) AND (char_length(legal_district) <= 60)))) NOT VALID;

alter table public.organizations add constraint organizations_legal_name_len CHECK (((legal_name IS NULL) OR ((char_length(legal_name) >= 1) AND (char_length(legal_name) <= 200)))) NOT VALID;

alter table public.organizations add constraint organizations_mersis_no_format CHECK (((mersis_no IS NULL) OR (mersis_no ~ '^[0-9]{16}$'::text))) NOT VALID;

alter table public.organizations add constraint organizations_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 160)));

alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);

alter table public.organizations add constraint organizations_provisioning_state_check CHECK ((provisioning_state = ANY (ARRAY['creating'::text, 'inviting_owner'::text, 'waiting_owner'::text, 'active'::text, 'suspended'::text, 'archived'::text, 'failed'::text])));

alter table public.organizations add constraint organizations_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text));

alter table public.organizations add constraint organizations_slug_key UNIQUE (slug);

alter table public.organizations add constraint organizations_tax_number_format CHECK (((tax_number IS NULL) OR (tax_number ~ '^[0-9]{10,11}$'::text))) NOT VALID;

alter table public.organizations add constraint organizations_tax_office_len CHECK (((tax_office IS NULL) OR ((char_length(tax_office) >= 1) AND (char_length(tax_office) <= 120)))) NOT VALID;

CREATE INDEX arc_collection_products_collection_org_idx ON public.arc_collection_products USING btree (collection_id, organization_id);

CREATE INDEX arc_collection_products_collection_position_idx ON public.arc_collection_products USING btree (collection_id, "position");

CREATE INDEX arc_collection_products_org_product_idx ON public.arc_collection_products USING btree (organization_id, product_id);

CREATE INDEX arc_collection_products_product_org_idx ON public.arc_collection_products USING btree (product_id, organization_id);

CREATE INDEX arc_collections_org_status_idx ON public.arc_collections USING btree (organization_id, status);

CREATE INDEX arc_customer_addresses_user_idx ON public.arc_customer_addresses USING btree (user_id, created_at DESC);

CREATE INDEX arc_customer_favourites_user_created_idx ON public.arc_customer_favourites USING btree (user_id, created_at DESC);

CREATE INDEX arc_discounts_org_status_idx ON public.arc_discounts USING btree (organization_id, status);

CREATE INDEX arc_discounts_org_type_idx ON public.arc_discounts USING btree (organization_id, discount_type);

CREATE INDEX arc_import_batches_org_created_idx ON public.arc_import_batches USING btree (organization_id, created_at DESC);

CREATE INDEX arc_import_errors_batch_idx ON public.arc_import_errors USING btree (batch_id, created_at);

CREATE INDEX arc_inventory_org_created_idx ON public.arc_inventory_movements USING btree (organization_id, created_at DESC);

CREATE INDEX arc_inventory_org_variant_idx ON public.arc_inventory_movements USING btree (organization_id, variant_id, created_at DESC);

CREATE INDEX arc_order_events_order_created_idx ON public.arc_order_events USING btree (order_id, created_at DESC);

CREATE INDEX arc_order_items_org_order_idx ON public.arc_order_items USING btree (organization_id, order_id);

CREATE INDEX arc_orders_customer_email_idx ON public.arc_orders USING btree (lower(customer_email));

CREATE INDEX arc_orders_org_created_idx ON public.arc_orders USING btree (organization_id, created_at DESC);

CREATE INDEX arc_orders_org_payment_created_idx ON public.arc_orders USING btree (organization_id, payment_status, created_at DESC);

CREATE INDEX arc_orders_org_status_created_idx ON public.arc_orders USING btree (organization_id, status, created_at DESC);

CREATE INDEX arc_orders_user_id_idx ON public.arc_orders USING btree (user_id);

CREATE INDEX arc_payment_orders_org_created_idx ON public.arc_payment_orders USING btree (organization_id, created_at DESC);

CREATE INDEX arc_payment_orders_status_idx ON public.arc_payment_orders USING btree (status, created_at DESC);

CREATE INDEX arc_variants_org_product_idx ON public.arc_product_variants USING btree (organization_id, product_id);

CREATE INDEX arc_variants_org_stock_idx ON public.arc_product_variants USING btree (organization_id, stock);

CREATE INDEX arc_variants_product_idx ON public.arc_product_variants USING btree (product_id);

CREATE INDEX arc_variants_supplier_sku_idx ON public.arc_product_variants USING btree (organization_id, supplier, supplier_sku);

CREATE UNIQUE INDEX arc_variants_supplier_sku_uniq ON public.arc_product_variants USING btree (organization_id, supplier_sku) WHERE (supplier_sku IS NOT NULL);

CREATE INDEX arc_products_org_status_idx ON public.arc_products USING btree (organization_id, status);

CREATE INDEX arc_products_supplier_idx ON public.arc_products USING btree (organization_id, supplier, supplier_product_code);

CREATE INDEX arc_return_requests_order_idx ON public.arc_return_requests USING btree (order_id);

CREATE INDEX arc_return_requests_org_status_idx ON public.arc_return_requests USING btree (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX arc_return_requests_open_unique ON public.arc_return_requests USING btree (order_id) WHERE (status = 'beklemede'::text);

CREATE UNIQUE INDEX arc_store_settings_custom_domain_uidx ON public.arc_store_settings USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_custom_domain_unique_idx ON public.arc_store_settings USING btree (lower(custom_domain)) WHERE ((custom_domain IS NOT NULL) AND (TRIM(BOTH FROM custom_domain) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_order_prefix_unique_idx ON public.arc_store_settings USING btree (upper(order_prefix)) WHERE ((order_prefix IS NOT NULL) AND (TRIM(BOTH FROM order_prefix) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_panel_custom_domain_uidx ON public.arc_store_settings USING btree (panel_custom_domain) WHERE (panel_custom_domain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_panel_domain_unique_idx ON public.arc_store_settings USING btree (lower(panel_custom_domain)) WHERE ((panel_custom_domain IS NOT NULL) AND (TRIM(BOTH FROM panel_custom_domain) <> ''::text));

CREATE UNIQUE INDEX arc_store_settings_platform_subdomain_uidx ON public.arc_store_settings USING btree (platform_subdomain) WHERE (platform_subdomain IS NOT NULL);

CREATE UNIQUE INDEX arc_store_settings_platform_subdomain_unique_idx ON public.arc_store_settings USING btree (lower(platform_subdomain)) WHERE ((platform_subdomain IS NOT NULL) AND (TRIM(BOTH FROM platform_subdomain) <> ''::text));

CREATE INDEX arc_store_themes_org_mode_idx ON public.arc_store_themes USING btree (organization_id, mode);

CREATE INDEX organization_memberships_user_active_idx ON public.organization_memberships USING btree (user_id, is_active);

CREATE INDEX organization_memberships_user_idx ON public.organization_memberships USING btree (user_id, organization_id) WHERE (is_active = true);

CREATE INDEX organization_modules_module_code_idx ON public.organization_modules USING btree (module_code);

CREATE INDEX organization_modules_org_enabled_idx ON public.organization_modules USING btree (organization_id, is_enabled);

CREATE INDEX organization_modules_org_idx ON public.organization_modules USING btree (organization_id) WHERE (is_enabled = true);

CREATE INDEX organization_product_licenses_product_status_idx ON public.organization_product_licenses USING btree (product, status);

CREATE INDEX organizations_kind_idx ON public.organizations USING btree (kind);

CREATE INDEX organizations_plan_code_idx ON public.organizations USING btree (plan_code);

CREATE UNIQUE INDEX organizations_custom_domain_unique_idx ON public.organizations USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);

alter table public.arc_collection_products add constraint arc_collection_products_collection_id_organization_id_fkey FOREIGN KEY (collection_id, organization_id) REFERENCES arc_collections(id, organization_id) ON DELETE CASCADE;

alter table public.arc_collection_products add constraint arc_collection_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_collection_products add constraint arc_collection_products_product_id_organization_id_fkey FOREIGN KEY (product_id, organization_id) REFERENCES arc_products(id, organization_id) ON DELETE CASCADE;

alter table public.arc_collections add constraint arc_collections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_customer_addresses add constraint arc_customer_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.arc_customer_favourites add constraint arc_customer_favourites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.arc_discounts add constraint arc_discounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_import_batches add constraint arc_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_import_batches add constraint arc_import_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_import_errors add constraint arc_import_errors_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES arc_import_batches(id) ON DELETE CASCADE;

alter table public.arc_import_errors add constraint arc_import_errors_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_inventory_movements add constraint arc_inventory_movements_variant_id_organization_id_fkey FOREIGN KEY (variant_id, organization_id) REFERENCES arc_product_variants(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_events add constraint arc_order_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_order_events add constraint arc_order_events_order_id_organization_id_fkey FOREIGN KEY (order_id, organization_id) REFERENCES arc_orders(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_events add constraint arc_order_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_order_id_organization_id_fkey FOREIGN KEY (order_id, organization_id) REFERENCES arc_orders(id, organization_id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_order_items add constraint arc_order_items_variant_id_organization_id_fkey FOREIGN KEY (variant_id, organization_id) REFERENCES arc_product_variants(id, organization_id) ON DELETE SET NULL;

alter table public.arc_orders add constraint arc_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_orders add constraint arc_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.arc_product_variants add constraint arc_product_variants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_product_variants add constraint arc_product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES arc_products(id) ON DELETE CASCADE;

alter table public.arc_products add constraint arc_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_products add constraint arc_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES arc_orders(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_return_requests add constraint arc_return_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_store_settings add constraint arc_store_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_store_themes add constraint arc_store_themes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.arc_store_themes add constraint arc_store_themes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.arc_suppliers add constraint arc_suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_memberships add constraint organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_memberships add constraint organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.organization_modules add constraint organization_modules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_product_licenses add constraint organization_product_licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table public.organization_product_licenses add constraint organization_product_licenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

alter table public.arc_collection_products enable row level security;

alter table public.arc_collections enable row level security;

alter table public.arc_customer_addresses enable row level security;

alter table public.arc_customer_favourites enable row level security;

alter table public.arc_discounts enable row level security;

alter table public.arc_import_batches enable row level security;

alter table public.arc_import_errors enable row level security;

alter table public.arc_inventory_movements enable row level security;

alter table public.arc_order_events enable row level security;

alter table public.arc_order_items enable row level security;

alter table public.arc_orders enable row level security;

alter table public.arc_payment_orders enable row level security;

alter table public.arc_product_variants enable row level security;

alter table public.arc_products enable row level security;

alter table public.arc_return_requests enable row level security;

alter table public.arc_store_settings enable row level security;

alter table public.arc_store_themes enable row level security;

alter table public.arc_suppliers enable row level security;

alter table public.organization_memberships enable row level security;

alter table public.organization_modules enable row level security;

alter table public.organization_product_licenses enable row level security;

alter table public.organizations enable row level security;

create policy "arc managers delete collection products" on public.arc_collection_products as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert collection products" on public.arc_collection_products as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update collection products" on public.arc_collection_products as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read collection products" on public.arc_collection_products as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collection_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers delete collections" on public.arc_collections as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert collections" on public.arc_collections as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update collections" on public.arc_collections as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read collections" on public.arc_collections as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_collections.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_addresses_owner_delete on public.arc_customer_addresses as PERMISSIVE for DELETE to authenticated
  using ((user_id = auth.uid()));

create policy arc_addresses_owner_insert on public.arc_customer_addresses as PERMISSIVE for INSERT to authenticated
  with check ((user_id = auth.uid()));

create policy arc_addresses_owner_select on public.arc_customer_addresses as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));

create policy arc_addresses_owner_update on public.arc_customer_addresses as PERMISSIVE for UPDATE to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy arc_customer_favourites_delete_own on public.arc_customer_favourites as PERMISSIVE for DELETE to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy arc_customer_favourites_insert_own on public.arc_customer_favourites as PERMISSIVE for INSERT to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy arc_customer_favourites_select_own on public.arc_customer_favourites as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "arc managers delete discounts" on public.arc_discounts as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers insert discounts" on public.arc_discounts as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update discounts" on public.arc_discounts as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read discounts" on public.arc_discounts as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_discounts.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage import batches" on public.arc_import_batches as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read import batches" on public.arc_import_batches as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_batches.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage import errors" on public.arc_import_errors as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read import errors" on public.arc_import_errors as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_import_errors.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage inventory" on public.arc_inventory_movements as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read inventory" on public.arc_inventory_movements as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_inventory_movements.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers insert order events" on public.arc_order_events as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_events.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read order events" on public.arc_order_events as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_events.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage order items" on public.arc_order_items as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read order items" on public.arc_order_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_order_items.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_order_items_customer_select on public.arc_order_items as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM arc_orders o
  WHERE ((o.id = arc_order_items.order_id) AND (o.user_id = auth.uid())))));

create policy "arc managers manage orders" on public.arc_orders as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read orders" on public.arc_orders as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_orders.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy arc_orders_customer_select on public.arc_orders as PERMISSIVE for SELECT to authenticated
  using ((user_id = auth.uid()));

create policy "arc managers manage variants" on public.arc_product_variants as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read variants" on public.arc_product_variants as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_product_variants.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers manage products" on public.arc_products as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND (m.role = ANY (ARRAY['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role]))))));

create policy "arc members read products" on public.arc_products as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_products.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "arc managers update returns" on public.arc_return_requests as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_return_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read returns" on public.arc_return_requests as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_return_requests.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "customers read own returns" on public.arc_return_requests as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "arc managers insert store settings" on public.arc_store_settings as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update store settings" on public.arc_store_settings as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true) AND ((membership.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read store settings" on public.arc_store_settings as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships membership
  WHERE ((membership.organization_id = arc_store_settings.organization_id) AND (membership.user_id = ( SELECT auth.uid() AS uid)) AND (membership.is_active = true)))));

create policy "arc managers delete store themes" on public.arc_store_themes as PERMISSIVE for DELETE to authenticated
  using (((mode = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))));

create policy "arc managers insert store themes" on public.arc_store_themes as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc managers update store themes" on public.arc_store_themes as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

create policy "arc members read store themes" on public.arc_store_themes as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_store_themes.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.is_active = true)))));

create policy "public reads published store themes" on public.arc_store_themes as PERMISSIVE for SELECT to anon
  using ((mode = 'published'::text));

create policy arc_suppliers_admins_delete on public.arc_suppliers as PERMISSIVE for DELETE to authenticated
  using (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_insert on public.arc_suppliers as PERMISSIVE for INSERT to authenticated
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_update on public.arc_suppliers as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_members_read on public.arc_suppliers as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM organization_memberships m
  WHERE ((m.organization_id = arc_suppliers.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.is_active))));

create policy arc_members_read_own_membership on public.organization_memberships as PERMISSIVE for SELECT to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

revoke all on function private.arc_guard_payment_settings() from public;
grant execute on function private.arc_guard_payment_settings() to public;

revoke all on function private.arc_guard_store_domains() from public;
grant execute on function private.arc_guard_store_domains() to public;

revoke all on function private.arvo_is_org_admin(target_org uuid) from public;
grant execute on function private.arvo_is_org_admin(target_org uuid) to authenticated;
grant execute on function private.arvo_is_org_admin(target_org uuid) to service_role;

revoke all on function private.can_manage_organization_assets(organization_id_text text) from public;
grant execute on function private.can_manage_organization_assets(organization_id_text text) to authenticated;

revoke all on function public.arc_address_before_write() from public;
grant execute on function public.arc_address_before_write() to anon;
grant execute on function public.arc_address_before_write() to authenticated;
grant execute on function public.arc_address_before_write() to service_role;
grant execute on function public.arc_address_before_write() to public;

revoke all on function public.arc_address_line(p_addr jsonb) from public;
grant execute on function public.arc_address_line(p_addr jsonb) to anon;
grant execute on function public.arc_address_line(p_addr jsonb) to authenticated;
grant execute on function public.arc_address_line(p_addr jsonb) to service_role;

revoke all on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) from public;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to anon;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to authenticated;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to service_role;

revoke all on function public.arc_aktarim_hesap_yukle(p_kullanicilar jsonb, p_kimlikler jsonb) from public;
grant execute on function public.arc_aktarim_hesap_yukle(p_kullanicilar jsonb, p_kimlikler jsonb) to service_role;

revoke all on function public.arc_aktarim_pk(p_tablo text) from public;
grant execute on function public.arc_aktarim_pk(p_tablo text) to service_role;

revoke all on function public.arc_aktarim_sil(p_tablo text, p_anahtarlar jsonb) from public;
grant execute on function public.arc_aktarim_sil(p_tablo text, p_anahtarlar jsonb) to service_role;

revoke all on function public.arc_aktarim_yukle(p_tablo text, p_satirlar jsonb) from public;
grant execute on function public.arc_aktarim_yukle(p_tablo text, p_satirlar jsonb) to service_role;

revoke all on function public.arc_baslik(p_text text) from public;
grant execute on function public.arc_baslik(p_text text) to anon;
grant execute on function public.arc_baslik(p_text text) to authenticated;
grant execute on function public.arc_baslik(p_text text) to service_role;

revoke all on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) from public;
grant execute on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) to anon;
grant execute on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) to authenticated;
grant execute on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) to service_role;

revoke all on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) from public;
grant execute on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) to anon;
grant execute on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) to authenticated;
grant execute on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) to service_role;

revoke all on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) from public;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to anon;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to authenticated;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to service_role;

revoke all on function public.arc_check_supplier_stock() from public;
grant execute on function public.arc_check_supplier_stock() to anon;
grant execute on function public.arc_check_supplier_stock() to authenticated;
grant execute on function public.arc_check_supplier_stock() to service_role;
grant execute on function public.arc_check_supplier_stock() to public;

revoke all on function public.arc_clean(p_value text) from public;
grant execute on function public.arc_clean(p_value text) to anon;
grant execute on function public.arc_clean(p_value text) to authenticated;
grant execute on function public.arc_clean(p_value text) to service_role;

revoke all on function public.arc_count_coupon_use() from public;
grant execute on function public.arc_count_coupon_use() to anon;
grant execute on function public.arc_count_coupon_use() to authenticated;
grant execute on function public.arc_count_coupon_use() to service_role;

revoke all on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) from public;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to anon;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to authenticated;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to service_role;

revoke all on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to anon;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to authenticated;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;

revoke all on function public.arc_decode_entities(t text) from public;
grant execute on function public.arc_decode_entities(t text) to anon;
grant execute on function public.arc_decode_entities(t text) to authenticated;
grant execute on function public.arc_decode_entities(t text) to service_role;
grant execute on function public.arc_decode_entities(t text) to public;

revoke all on function public.arc_extract_vat(p_gross bigint, p_rate numeric) from public;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to anon;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to authenticated;
grant execute on function public.arc_extract_vat(p_gross bigint, p_rate numeric) to service_role;

revoke all on function public.arc_fill_order_tax() from public;
grant execute on function public.arc_fill_order_tax() to anon;
grant execute on function public.arc_fill_order_tax() to authenticated;
grant execute on function public.arc_fill_order_tax() to service_role;
grant execute on function public.arc_fill_order_tax() to public;

revoke all on function public.arc_find_address(p_meta jsonb) from public;
grant execute on function public.arc_find_address(p_meta jsonb) to anon;
grant execute on function public.arc_find_address(p_meta jsonb) to authenticated;
grant execute on function public.arc_find_address(p_meta jsonb) to service_role;

revoke all on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) from public;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to anon;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to authenticated;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to service_role;

revoke all on function public.arc_log_order_event() from public;
grant execute on function public.arc_log_order_event() to anon;
grant execute on function public.arc_log_order_event() to authenticated;
grant execute on function public.arc_log_order_event() to service_role;

revoke all on function public.arc_normalize_address(p_addr jsonb) from public;
grant execute on function public.arc_normalize_address(p_addr jsonb) to anon;
grant execute on function public.arc_normalize_address(p_addr jsonb) to authenticated;
grant execute on function public.arc_normalize_address(p_addr jsonb) to service_role;

revoke all on function public.arc_reprice_supplier(p_supplier text) from public;
grant execute on function public.arc_reprice_supplier(p_supplier text) to anon;
grant execute on function public.arc_reprice_supplier(p_supplier text) to authenticated;
grant execute on function public.arc_reprice_supplier(p_supplier text) to service_role;

revoke all on function public.arc_resolve_commerce_tenant() from public;
grant execute on function public.arc_resolve_commerce_tenant() to anon;
grant execute on function public.arc_resolve_commerce_tenant() to authenticated;
grant execute on function public.arc_resolve_commerce_tenant() to service_role;

revoke all on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) from public;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to anon;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to service_role;

revoke all on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) from public;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to anon;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to service_role;

revoke all on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public;
grant execute on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to anon;
grant execute on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to authenticated;
grant execute on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;

revoke all on function public.arc_slugify(p_text text) from public;
grant execute on function public.arc_slugify(p_text text) to anon;
grant execute on function public.arc_slugify(p_text text) to authenticated;
grant execute on function public.arc_slugify(p_text text) to service_role;

revoke all on function public.arc_store_stage(p_organization_id uuid) from public;
grant execute on function public.arc_store_stage(p_organization_id uuid) to anon;
grant execute on function public.arc_store_stage(p_organization_id uuid) to authenticated;
grant execute on function public.arc_store_stage(p_organization_id uuid) to service_role;

revoke all on function public.arc_total_stock_units() from public;
grant execute on function public.arc_total_stock_units() to anon;
grant execute on function public.arc_total_stock_units() to authenticated;
grant execute on function public.arc_total_stock_units() to service_role;

revoke all on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) from public;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to anon;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to authenticated;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to service_role;

revoke all on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) from public;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to anon;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to authenticated;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to service_role;

revoke all on function public.attach_arvoculture_order_owner() from public;
grant execute on function public.attach_arvoculture_order_owner() to anon;
grant execute on function public.attach_arvoculture_order_owner() to authenticated;
grant execute on function public.attach_arvoculture_order_owner() to service_role;
grant execute on function public.attach_arvoculture_order_owner() to public;

revoke all on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) from public;
grant execute on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) to anon;
grant execute on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) to authenticated;
grant execute on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) to service_role;

revoke all on function public.claim_arvoculture_orders() from public;
grant execute on function public.claim_arvoculture_orders() to anon;
grant execute on function public.claim_arvoculture_orders() to authenticated;
grant execute on function public.claim_arvoculture_orders() to service_role;

revoke all on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) from public;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to anon;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to authenticated;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to service_role;

revoke all on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public;
grant execute on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to anon;
grant execute on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to authenticated;
grant execute on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;

revoke all on function public.get_arvoculture_my_orders() from public;
grant execute on function public.get_arvoculture_my_orders() to anon;
grant execute on function public.get_arvoculture_my_orders() to authenticated;
grant execute on function public.get_arvoculture_my_orders() to service_role;

revoke all on function public.get_arvoculture_my_returns() from public;
grant execute on function public.get_arvoculture_my_returns() to anon;
grant execute on function public.get_arvoculture_my_returns() to authenticated;
grant execute on function public.get_arvoculture_my_returns() to service_role;

revoke all on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to service_role;

revoke all on function public.get_arvoculture_storefront_collections() from public;
grant execute on function public.get_arvoculture_storefront_collections() to anon;
grant execute on function public.get_arvoculture_storefront_collections() to authenticated;
grant execute on function public.get_arvoculture_storefront_collections() to service_role;

revoke all on function public.get_arvoculture_storefront_deals(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to service_role;

revoke all on function public.get_arvoculture_storefront_discounts() from public;
grant execute on function public.get_arvoculture_storefront_discounts() to anon;
grant execute on function public.get_arvoculture_storefront_discounts() to authenticated;
grant execute on function public.get_arvoculture_storefront_discounts() to service_role;

revoke all on function public.get_arvoculture_storefront_facets() from public;
grant execute on function public.get_arvoculture_storefront_facets() to anon;
grant execute on function public.get_arvoculture_storefront_facets() to authenticated;
grant execute on function public.get_arvoculture_storefront_facets() to service_role;
grant execute on function public.get_arvoculture_storefront_facets() to public;

revoke all on function public.get_arvoculture_storefront_product(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to service_role;

revoke all on function public.get_arvoculture_storefront_product_badges() from public;
grant execute on function public.get_arvoculture_storefront_product_badges() to anon;
grant execute on function public.get_arvoculture_storefront_product_badges() to authenticated;
grant execute on function public.get_arvoculture_storefront_product_badges() to service_role;

revoke all on function public.get_arvoculture_storefront_product_count() from public;
grant execute on function public.get_arvoculture_storefront_product_count() to anon;
grant execute on function public.get_arvoculture_storefront_product_count() to authenticated;
grant execute on function public.get_arvoculture_storefront_product_count() to service_role;

revoke all on function public.get_arvoculture_storefront_product_slugs(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to service_role;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer) to public;

revoke all on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) from public;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to anon;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_products(p_limit integer, p_offset integer) to service_role;

revoke all on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to anon;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to authenticated;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;
grant execute on function public.get_arvoculture_storefront_products_page(p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to public;

revoke all on function public.get_arvoculture_storefront_search_index(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to service_role;
grant execute on function public.get_arvoculture_storefront_search_index(p_limit integer) to public;

revoke all on function public.get_arvoculture_storefront_settings() from public;
grant execute on function public.get_arvoculture_storefront_settings() to anon;
grant execute on function public.get_arvoculture_storefront_settings() to authenticated;
grant execute on function public.get_arvoculture_storefront_settings() to service_role;

revoke all on function public.get_arvoculture_storefront_variants(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to service_role;

revoke all on function public.get_storefront_seller(p_tenant text) from public;
grant execute on function public.get_storefront_seller(p_tenant text) to anon;
grant execute on function public.get_storefront_seller(p_tenant text) to authenticated;
grant execute on function public.get_storefront_seller(p_tenant text) to service_role;

revoke all on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public;
grant execute on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to anon;
grant execute on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to authenticated;
grant execute on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;

revoke all on function public.update_arvoculture_profile(p_full_name text, p_phone text) from public;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to anon;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to authenticated;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to service_role;

CREATE TRIGGER arc_addresses_before_write BEFORE INSERT OR UPDATE ON public.arc_customer_addresses FOR EACH ROW EXECUTE FUNCTION arc_address_before_write();

CREATE TRIGGER arc_order_items_stock_check BEFORE INSERT ON public.arc_order_items FOR EACH ROW EXECUTE FUNCTION arc_check_supplier_stock();

CREATE TRIGGER arc_orders_attach_owner BEFORE INSERT ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION attach_arvoculture_order_owner();

CREATE TRIGGER arc_orders_count_coupon_use AFTER UPDATE OF payment_status ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_count_coupon_use();

CREATE TRIGGER arc_orders_fill_tax AFTER UPDATE OF subtotal, total ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_fill_order_tax();

CREATE TRIGGER arc_orders_log_event AFTER UPDATE ON public.arc_orders FOR EACH ROW EXECUTE FUNCTION arc_log_order_event();

CREATE TRIGGER arc_guard_payment_settings BEFORE INSERT OR UPDATE ON public.arc_store_settings FOR EACH ROW EXECUTE FUNCTION private.arc_guard_payment_settings();

CREATE TRIGGER arc_guard_store_domains BEFORE INSERT OR UPDATE OF custom_domain, panel_custom_domain ON public.arc_store_settings FOR EACH ROW EXECUTE FUNCTION private.arc_guard_store_domains();
