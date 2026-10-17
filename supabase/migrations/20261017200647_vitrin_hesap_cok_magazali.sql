-- vitrin_hesap_cok_magazali
--
-- MÜŞTERİNİN HESAP ALANI DA MAĞAZAYA BAĞLANIYOR.
--
-- Katalog ve ödeme çok mağazalı hâle geldi (arc_storefront_*), ama
-- "siparişlerim" ve "iadelerim" hâlâ ArvoCulture'a özel adlarla
-- duruyordu. Daha önemlisi: o fonksiyonlar KURUMLA HİÇ SÜZMÜYOR,
-- yalnızca auth.uid() ile. Tek mağazalı dünyada fark etmiyordu;
-- iki mağazada alışveriş yapan bir müşteri, B mağazasının
-- vitrininde A'dan verdiği siparişleri de görürdü. Kendi verisi
-- ama yanlış yerde: mağaza sahibinin vitrini başka bir mağazanın
-- sipariş numaralarını ve ürün adlarını gösteriyor olurdu.
--
-- Gövdeler dökümden birebir alındı; eklenen tek şey kurum süzgeci
-- ve konak parametresi. Elle yeniden yazmak, aradaki farkın
-- (adres normalleştirme, gönderi listesi, taslak gönderinin
-- elenmesi) sessizce kaybolması demekti.
--
-- ESKİ FONKSİYONLAR KALDIRILMIYOR. ArvoCulture'ın vitrini dağıtım
-- sırasında bir süre eski adı çağırmaya devam edecek; ikisi birlikte
-- yaşayabilir. Kaldırma ayrı bir migration'ın işi.

create or replace function public.arc_storefront_my_orders(p_host text)
 RETURNS TABLE(order_number text, status text, payment_status text, subtotal bigint, discount bigint, shipping bigint, total bigint, currency text, coupon_code text, address jsonb, billing_address jsonb, note text, created_at timestamp with time zone, items jsonb, shipments jsonb)
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
    ) as items,

    -- GÖNDERİLER. Bir sipariş birden çok pakete bölünebiliyor ve her
    -- paketin kendi takip numarası var; müşteri tek numara görüp
    -- gelmeyen kalemi kayıp sanmasın diye hepsi ayrı ayrı veriliyor.
    -- İptal edilen gönderi listede YOK: yola çıkmayacak bir paketin
    -- takip numarasını göstermek müşteriyi boşuna bekletir.
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sequence', s.sequence,
            'status', s.status,
            'carrier', s.carrier_name,
            'tracking_number', s.tracking_number,
            'tracking_url', s.tracking_url,
            'shipped_at', s.shipped_at,
            'delivered_at', s.delivered_at,
            'items', coalesce(
              (
                select jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', si.quantity) order by oi.product_name)
                from public.arc_shipment_items si
                join public.arc_order_items oi on oi.id = si.order_item_id
                where si.shipment_id = s.id
              ),
              '[]'::jsonb
            )
          )
          order by s.sequence
        )
        from public.arc_shipments s
        where s.order_id = o.id
          and s.status <> 'cancelled'
          -- Taslak gönderi OTO'da henüz yok; müşteriye gösterilecek bir şey taşımıyor.
          and s.status <> 'draft'
      ),
      '[]'::jsonb
    ) as shipments
  from public.arc_orders o
  where o.user_id = auth.uid()
    and o.organization_id = public.arc_storefront_org(p_host)
  order by o.created_at desc
  limit 100;
$function$
;

create or replace function public.arc_storefront_my_returns(p_host text)
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
    and o.organization_id = public.arc_storefront_org(p_host)
  order by r.created_at desc
  limit 50;
$function$
;

/*
  Vitrin bunları tarayıcıdaki oturumla çağırıyor: yetki auth.uid()
  üzerinden fonksiyonun KENDİ gövdesinde. anon'a açmanın anlamı yok —
  oturumsuz çağrı zaten boş döner — ama authenticated'a şart.

  Postgres yeni fonksiyonu PUBLIC'e açık oluşturuyor ve Supabase
  varsayılanı anon'a da EXECUTE veriyor; ikisi de kaldırılıyor.
*/
revoke all on function public.arc_storefront_my_orders(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_my_orders(text) to authenticated, service_role;

revoke all on function public.arc_storefront_my_returns(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_my_returns(text) to authenticated, service_role;

/*
  Kendini sınayan blok: şema boşsa sessizce geçiyor, doluysa
  fonksiyonların oluştuğunu ve oturumsuz çağrıda boş döndüğünü
  doğruluyor (auth.uid() null).
*/
do $$
declare
  v_konak text;
  v_sayi integer;
begin
  select coalesce(custom_domain, platform_subdomain || '.shop.arvo-os.com')
    into v_konak
  from public.arc_store_settings
  where custom_domain is not null or platform_subdomain is not null
  limit 1;

  if v_konak is null then
    raise notice 'Adresi olan mağaza yok; doğrulama atlandı.';
    return;
  end if;

  select count(*) into v_sayi from public.arc_storefront_my_orders(v_konak);
  if v_sayi <> 0 then
    raise exception 'Oturumsuz çağrı sipariş döndürdü (% satır); auth.uid() süzgeci çalışmıyor.', v_sayi;
  end if;

  select count(*) into v_sayi from public.arc_storefront_my_returns(v_konak);
  if v_sayi <> 0 then
    raise exception 'Oturumsuz çağrı iade döndürdü (% satır).', v_sayi;
  end if;

  raise notice 'Hesap fonksiyonları hazır (örnek adres: %).', v_konak;
end;
$$;
