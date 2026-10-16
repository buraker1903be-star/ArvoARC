/*
  SAAT DİLİMİ TÜRKİYE (16.10.2026).

  Veritabanı UTC'de çalışıyordu. Sipariş numarası gün damgasını
  to_char(now(), …) ile basıyordu, yani gece 00:00–03:00 arasında verilen
  sipariş bir önceki günün numarasını alıyordu: 16 Ekim 02:23'teki
  sipariş "AC261015-D0A35A" oldu. Panelden açılan siparişin numarası
  ("ARC-YYYYMMDD-HHMMSS-…") saati de UTC basıyordu, üç saat geri.

  İki katman:

  1. Veritabanının saat dilimi Türkiye. Bundan sonra yazılan bir
     fonksiyon now()::date, current_date ya da to_char(now(), …) ile gün
     aldığında Türkiye gününü alır — kural bir daha unutulduğunda da
     doğru çalışsın diye. Türkiye yaz saati uygulamadığı için aralık
     hesapları (now() - interval …) değişmez; zaman damgaları yine aynı
     ANI tutar, yalnızca metne çevrilirken "+03:00" ile yazılır (kodda ve
     vitrinde bu değerleri metin olarak kesen yer yok, 16.10.2026'da
     tarandı).

  2. İki numara üretici dilimi AÇIKÇA yazıyor: bağlantı ya da rol
     düzeyindeki bir timezone ayarı veritabanı ayarını ezebilir, numara
     buna bağlı kalmasın. Gövdeler canlı şema dökümünden alındı, yalnızca
     to_char satırı değişti.

  Eski siparişlerin numarası değişmez.
*/
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Europe/Istanbul');
end
$$;

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

  v_order_number := 'ARC-' || to_char(clock_timestamp() at time zone 'Europe/Istanbul', 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

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

  v_order_number := v_prefix || to_char(now() at time zone 'Europe/Istanbul', 'YYMMDD') || '-' ||
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

revoke all on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) from public, anon, authenticated;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to authenticated;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to service_role;
revoke all on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public, anon, authenticated;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;
