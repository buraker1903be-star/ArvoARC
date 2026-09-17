-- Kupon ve ücretsiz kargo hesabı düzeltiliyor.
--
-- İKİ HATA
--
-- 1) "Ücretsiz Kargo" kuponu hiçbir şey yapmıyor ama "Kod uygulandı" diyor.
--    Panel bu tipi açıkça sunuyor (indirimler/page.tsx: "Ücretsiz kargo"),
--    value = 0 ile kaydediliyor. Sipariş hesabında ise:
--        when 'percentage' ... when 'fixed_amount' ... else 0
--    yani free_shipping "else 0" dalına düşüyor, kargo da normal tahsil
--    ediliyordu. Müşteri sepette "Kod uygulandı" görüp 120 TL kargoyu yine
--    ödüyordu.
--
-- 2) Kupon, ücretsiz kargo eşiğini düşürüyordu. Eşik
--        (v_subtotal - v_discount) >= v_free_threshold
--    ile karşılaştırılıyordu. 2.000 TL'lik sepette ücretsiz kargo gören
--    müşteri %10 kupon girince eşiğin altına düşüp 120 TL kargo ödüyordu:
--    indirim kullanmak müşteriye pahalıya patlıyordu.
--
-- Eşik artık indirim ÖNCESİ ara toplamla karşılaştırılıyor; free_shipping
-- kuponu kargoyu sıfırlıyor.
--
-- Fonksiyonun geri kalanı 20260916200000'deki hâliyle birebir aynı.

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
$function$;
