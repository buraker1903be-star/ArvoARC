-- Vitrin siparişi ve kupon kontrolü mağaza başına.
--
-- create_arvoculture_storefront_order ve check_arvoculture_coupon yalnızca
-- kurumu değil, mağazaya özgü dört ayarı da sabit tutuyordu:
--   kurum (slug='arvoculture'), sipariş no öneki 'AC',
--   kargo ücreti 120 TL, ücretsiz kargo eşiği 2.000 TL
-- İkinci mağaza açıldığında siparişleri ArvoCulture'a yazılır, numarası 'AC'
-- ile başlar ve ArvoCulture'ın kargo tarifesiyle hesaplanırdı.
--
-- Bu migration:
--   1) Dört ayarı arc_store_settings'e taşır (varsayılanlar bugünkü değerler,
--      yani ArvoCulture'ın davranışı değişmez).
--   2) Kurumu parametre alan yeni fonksiyonları ekler.
--   3) Eski adları ince sarmalayıcıya çevirir; yayın sırası ne olursa olsun
--      vitrin çalışmaya devam eder.
--
-- Ayrıca bir birim hatası düzeltiliyor: arc_discounts.value sabit indirimde
-- KURUŞ olarak saklanıyor (panel Math.round(tutar*100) ile yazıyor), ama
-- check_arvoculture_coupon onu bir kez daha 100'le çarpıyordu. 50 TL'lik kupon
-- 5.000 TL indirim olarak dönüyordu. Dönen değer bugün hiçbir yerde
-- kullanılmadığı için müşteriye yansımamıştı; kullanılsaydı sepeti sıfırlardı.

-- 1) Mağazaya özgü satış ayarları
alter table public.arc_store_settings
  add column if not exists order_prefix text not null default 'AC',
  add column if not exists shipping_fee bigint not null default 12000,
  add column if not exists free_shipping_threshold bigint not null default 200000;

alter table public.arc_store_settings drop constraint if exists arc_store_settings_order_prefix_check;
alter table public.arc_store_settings add constraint arc_store_settings_order_prefix_check
  check (order_prefix ~ '^[A-Z]{1,6}$');
alter table public.arc_store_settings drop constraint if exists arc_store_settings_shipping_check;
alter table public.arc_store_settings add constraint arc_store_settings_shipping_check
  check (shipping_fee >= 0 and free_shipping_threshold >= 0);

comment on column public.arc_store_settings.order_prefix is 'Sipariş numarası öneki (ArvoCulture: AC). Mağaza başına tekil olmalı.';
comment on column public.arc_store_settings.shipping_fee is 'Kargo ücreti, kuruş. KDV dahil.';
comment on column public.arc_store_settings.free_shipping_threshold is 'Bu tutarın üstünde kargo bedava, kuruş.';

-- 2) Kupon kontrolü (kurum parametreli, birim hatası düzeltilmiş)
create or replace function public.arc_check_coupon(
  p_organization_id uuid,
  p_code text,
  p_subtotal bigint default 0,
  p_email text default null
)
returns table(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
    aynı müşteri ikinci kez kullanamamalı. E-posta üzerinden sayılıyor;
    misafir siparişlerde de çalışsın diye.
  */
  if v_d.per_customer_limit is not null and p_email is not null then
    select count(*) into v_used
    from public.arc_orders o
    where o.organization_id = p_organization_id
      and lower(o.customer_email) = lower(trim(p_email))
      and upper(coalesce(o.metadata ->> 'coupon_code', '')) = upper(trim(p_code))
      and o.status not in ('cancelled', 'refunded');

    if v_used >= v_d.per_customer_limit then
      return query select false,
        'Bu indirim kodunu daha önce kullandınız.'::text,
        null::text, null::numeric, null::bigint, 0::bigint;
      return;
    end if;
  end if;

  /* Alt limit. */
  if v_d.minimum_subtotal is not null and p_subtotal < v_d.minimum_subtotal then
    return query select false,
      format('Bu kod %s TL ve üzeri siparişlerde geçerli.',
             to_char(v_d.minimum_subtotal / 100.0, 'FM999G999D00'))::text,
      null::text, null::numeric, v_d.minimum_subtotal, 0::bigint;
    return;
  end if;

  /*
    İndirim tutarı. DÜZELTME: sabit indirimde value zaten kuruş
    (panel Math.round(tutar*100) ile yazıyor). Eskiden burada bir kez daha
    100'le çarpılıyordu; sipariş oluşturma ise doğru hesaplıyordu.
  */
  if v_d.discount_type = 'percentage' then
    v_amount := round(p_subtotal * v_d.value / 100);
  else
    v_amount := least(v_d.value::bigint, p_subtotal);
  end if;

  return query select true, 'Kod uygulandı.'::text, v_d.discount_type,
    v_d.value, v_d.minimum_subtotal, v_amount;
end;
$function$;

-- 3) Sipariş oluşturma (kurum parametreli, ayarlar mağazadan)
create or replace function public.arc_create_storefront_order(
  p_organization_id uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_coupon_code text default null
)
returns table(order_id uuid, order_number text, total bigint)
language plpgsql
security definer
set search_path to ''
as $function$
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
           end
      into v_discount
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
  end if;

  if (v_subtotal - v_discount) >= v_free_threshold then
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
$function$;

-- 4) Eski adlar ince sarmalayıcıya dönüşüyor.
-- Yayın sırası ne olursa olsun (kod önce, migration önce) vitrin çalışır.
create or replace function public.check_arvoculture_coupon(p_code text, p_subtotal bigint default 0, p_email text default null)
returns table(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_check_coupon(
    (select id from public.organizations where slug = 'arvoculture' limit 1),
    p_code, p_subtotal, p_email)
$function$;

create or replace function public.create_arvoculture_storefront_order(
  p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text default null
)
returns table(order_id uuid, order_number text, total bigint)
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function public.arc_check_coupon(uuid, text, bigint, text) from public, anon;
revoke all on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.arc_check_coupon(uuid, text, bigint, text) to service_role;
grant execute on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) to service_role;
