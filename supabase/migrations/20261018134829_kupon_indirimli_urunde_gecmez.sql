-- Kupon indirimdeki üründe geçmez.
--
-- ArvoARC'ta indirim kaydının `combinable` alanı ve panelde
-- "Diğer indirimlerle birleştirilebilir" kutusu 29.09.2026'dan beri
-- duruyor; kutu işaretsizken indirim detay ekranı "Tek başına
-- uygulanır" yazıyor. Ama alan HİÇBİR YERDE OKUNMUYORDU: sipariş
-- fonksiyonu kuponu her zaman ara toplamın TAMAMINA uyguluyordu.
-- Panel bir şey vaat edip başka şey yapıyordu ve bu sessizdi —
-- ne hata, ne uyarı.
--
-- Değişen tek şey kuponun TABANI:
--   * yüzde ve sabit indirim yalnızca indirimsiz satırlara,
--   * ücretsiz kargo kuponu etkilenmiyor (kargo bir ürün indirimi
--     değil; müşteri hak ettiği ücretsiz kargoyu kaybetmemeli),
--   * asgari sepet tutarı yine sepetin tamamıyla karşılaştırılıyor.
--
-- GÖVDE 20261017144835'ten alındı, 20261016080951'den DEĞİL: ilk
-- yazışta eski gövde kopyalanmıştı ve tedarikçi tamponunu bilen
-- stok denetimi (arc_variant_available) sessizce geri alınıyordu.
-- `npm run test:db` yakaladı ("tedarikçi varyantında stoktan fazla
-- adet sipariş edilemiyor"). Bu fonksiyonu bir daha değiştirirken
-- gövdeyi EN SON tanımından alın.
--
-- Vitrin aynı kuralı aynasına aldı (ArvoCulture-site
-- `src/lib/coupon.ts` → `kuponaTabiToplam` ve `evaluateCoupon`);
-- ikisi ayrılırsa müşteri ödemede burada hesaplanandan farklı bir
-- tutar görür.

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
  -- Kupona TABİ ara toplam: indirimli satırlar bunun dışında.
  v_kuponlanabilir bigint := 0;
  -- Kuponun uygulanacağı taban (birleşebilir mi sorusuna göre).
  v_kupon_tabani bigint := 0;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

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

    select v.id, v.price, v.stock, v.allow_backorder, v.supplier,
           v.compare_at_price, p.name
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

    /*
      MİKTAR DENETİMİ TEDARİKÇİ ÜRÜNÜNDE allow_backorder'A BAKMIYOR
      (17.10.2026).

      Eski kural yalnızca "stok yetmiyor VE stoksuz satış kapalı"
      diyordu. Tedarikçi varyantında bu koşul HİÇ sağlanmıyor:
      arc_product_variants.allow_backorder sütununun varsayılanı true
      ve tedarikçi içe aktarımı o alanı hiç yazmıyor. Sonuç: stoğu 10
      olan tedarikçi varyantına 20 adet sipariş geçiyor ve stok
      -10'a iniyordu. Tedarikçi o adedi gönderemez; farkı mağaza
      karşılar.
      (Kalem başına üst sınır zaten 20; yani 10 stoklu üründen 20
      adet istemek yukarıdaki denetimden geçiyordu.)

      Üstelik satılabilirlik kuralı da o alana bakmıyor:
      arc_variant_available tedarikçi ürününde yalnızca tampona
      bakıyor. Yani miktar denetimi, satılabilirlik denetiminden
      daha gevşekti.

      KENDİ ÜRÜNÜMÜZDE KURAL DEĞİŞMEDİ: stoksuz satış açıkken
      stoktan fazlası satılabilir — bu mağazanın bilinçli tercihi.
      Değişen yalnızca tedarikçi ürünü, çünkü orada o alan bir
      tercih değil, yazılmamış bir varsayılan.
    */
    if v_variant.stock < v_qty
       and (
         v_variant.supplier is not null
         or not coalesce(v_variant.allow_backorder, false)
       ) then
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

    /*
      Satır indirimliyse kupona girmiyor. Ölçüt ürün kartındaki
      üstü çizili fiyatla AYNI: compare_at_price > price.
    */
    if coalesce(v_variant.compare_at_price, 0) <= v_variant.price then
      v_kuponlanabilir := v_kuponlanabilir + (v_variant.price * v_qty);
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Sepet boş';
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    /*
      TABAN: birleşebilir kuponda sepetin tamamı, değilse yalnızca
      indirimsiz satırlar.

      Asgari sepet tutarı (minimum_subtotal) SEPETİN TAMAMIYLA
      karşılaştırılmaya devam ediyor: "500 TL ve üzeri sepetlerde
      geçerli" cümlesi sepetin büyüklüğü hakkında, kuponun tabanı
      hakkında değil.

      Taban ayrı bir sorguyla okunuyor; aşağıdaki seçim kuponun
      bütün geçerlilik koşullarını (tarih, kullanım sınırı, asgari
      tutar) da sınıyor ve taban o koşullardan bağımsız. Kupon
      geçersizse v_discount zaten sıfır kalıyor.
    */
    select case
             when coalesce(d.combinable, false) then v_subtotal
             else v_kuponlanabilir
           end
      into v_kupon_tabani
    from public.arc_discounts d
    where d.organization_id = p_organization_id
      and upper(d.code) = upper(trim(p_coupon_code))
      and d.status = 'active'
    limit 1;

    v_kupon_tabani := coalesce(v_kupon_tabani, 0);

    select case
             when d.discount_type = 'percentage'
               then (v_kupon_tabani * d.value) / 100
             when d.discount_type = 'fixed_amount'
               then least(d.value, v_kupon_tabani)
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


revoke all on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public, anon, authenticated;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;
