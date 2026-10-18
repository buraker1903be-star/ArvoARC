/*
  SİPARİŞ DETAYINDA ÖDEME YÖNTEMİ (18.10.2026)

  Müşteri sipariş sayfasında ödemeyi NASIL yaptığını göremiyordu.
  Ödeme DURUMU ("ödendi", "ödeme bekleniyor") vardı ama yöntemi
  yoktu; havale siparişinde "ödeme bekleniyor" yazısı tek başına
  ne yapacağını söylemiyordu — parayı nereye göndereceği, kart
  provizyonunun mu beklendiği belirsizdi.

  Yöntem zaten kayıtlı: `arc_orders.metadata ->> 'payment_method'`,
  serbest metin ("Banka havalesi / EFT", "Kredi kartı", "Nakit").
  Vitrin ödeme servisi ve panel oraya yazıyor; vitrin okumuyordu.

  DÖNÜŞ TİPİ DEĞİŞTİĞİ İÇİN ÖNCE DROP: Postgres `create or
  replace` ile dönüş tablosunu değiştirmeye izin vermiyor.

  İkizi `arc_storefront_my_orders`ın ikiz muafiyetinde
  (`scripts/check-ikizler.mjs`); tek mağazalı karşılığı
  `get_arvoculture_my_orders` ve o da aynı gün aşağıda
  güncelleniyor.
*/

drop function if exists public.arc_storefront_my_orders(text);

create or replace function public.arc_storefront_my_orders(p_host text)
 RETURNS TABLE(order_number text, status text, payment_status text, subtotal bigint, discount bigint, shipping bigint, total bigint, currency text, coupon_code text, payment_method text, address jsonb, billing_address jsonb, note text, created_at timestamp with time zone, items jsonb, shipments jsonb)
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

    /*
      ÖDEME YÖNTEMİ. metadata'da SERBEST METİN duruyor
      ("Banka havalesi / EFT", "Kredi kartı", "Nakit"); vitrin
      ödeme servisi ve panel oraya yazıyor. Eski siparişlerde
      alan BOŞ — geçmişi "kart" varsayıp doldurmak, varsayımı
      veriye dönüştürmek olurdu (bkz. src/lib/payment-method.ts).
    */
    public.arc_clean(o.metadata ->> 'payment_method') as payment_method,

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
$function$;

revoke all on function public.arc_storefront_my_orders(text)
  from public, anon;
/* Süzgeç auth.uid() VE adres; oturumsuz çağrı zaten boş dönerdi. */
grant execute on function public.arc_storefront_my_orders(text) to authenticated;
grant execute on function public.arc_storefront_my_orders(text) to service_role;


/* --------------------------------------------------------------
   TEK MAĞAZALI İKİZ

   Gövdeler aynı olmak zorunda (`npm run check:ikizler`); farklı
   olan yalnızca kiracının nasıl bulunduğu. Birini değiştirip
   öbürünü bırakmak, ikinci kiracı açıldığı gün ortaya çıkan
   sessiz bir fark üretiyor.
   -------------------------------------------------------------- */

drop function if exists public.get_arvoculture_my_orders();

CREATE OR REPLACE FUNCTION public.get_arvoculture_my_orders()
 RETURNS TABLE(order_number text, status text, payment_status text, subtotal bigint, discount bigint, shipping bigint, total bigint, currency text, coupon_code text, payment_method text, address jsonb, billing_address jsonb, note text, created_at timestamp with time zone, items jsonb, shipments jsonb)
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
    /* Çok kiracılı ikizle aynı: serbest metin, eski siparişte boş. */
    public.arc_clean(o.metadata ->> 'payment_method') as payment_method,

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
  order by o.created_at desc
  limit 100;
$function$;

revoke all on function public.get_arvoculture_my_orders() from public, anon;
grant execute on function public.get_arvoculture_my_orders() to authenticated;
grant execute on function public.get_arvoculture_my_orders() to service_role;
