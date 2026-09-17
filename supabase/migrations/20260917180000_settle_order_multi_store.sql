-- Ödeme sonuçlandırma ve tedarikçi stok yazımı çok mağazalı hale getiriliyor.
--
-- İKİ FONKSİYON DA ARVOCULTURE'A SABİTLENMİŞTİ
--
-- settle_arvoculture_storefront_order:
--     join public.organizations org
--       on org.id = o.organization_id and org.slug = 'arvoculture'
-- Başka bir mağazanın siparişi için "not found" oluyor ve fonksiyon
-- 'Sipariş bulunamadı' fırlatıyordu. Çağıran uç (api/storefront/paytr-bildirim)
-- hatayı yakalayıp PayTR'a yine "OK" döndüğü için bildirim tekrarlanmıyordu:
-- ArvoCulture DIŞINDAKİ her mağazada kartla ödeme alınıyor, sipariş sonsuza
-- kadar "ödeme bekliyor"da kalıyordu. Çok mağazalı yapının altını oyan hata.
--
-- arc_bulk_update_supplier_stock:
--     select id into v_org_id from public.organizations where slug='arvoculture'
-- Hangi mağazanın içe aktarımı çağırırsa çağırsın stok ve FİYAT ArvoCulture'ın
-- varyantlarına yazılıyordu. İki mağazada da 'tarzyeri' tanımlıysa biri
-- diğerinin fiyatını eziyordu.
--
-- SESSİZ STOK AŞIMI
-- Stok düşümü "greatest(stock - miktar, 0)" ile yapılıyordu. Fonksiyonun
-- kendi yorumu "Yetersizse sipariş ödendi kalır ama işleme alınmaz; ekip
-- panelden görüp müdahale eder" diyor — ama hiçbir yere işaret konmuyordu:
-- stok sessizce 0'a kırpılıyor, kimse fark etmiyordu. Sipariş oluşturulurken
-- stok yalnızca KONTROL ediliyor, rezerve edilmiyor; aynı anda gelen iki
-- sipariş son adedi birlikte alıyor ve biri karşılıksız kalıyor.
-- Artık aşım siparişe görünür bir olay olarak yazılıyor (arc_order_events →
-- panel akışı ve sipariş detayı).
--
-- ADLANDIRMA
-- Doğru adı arc_settle_storefront_order. Eski ad ince bir sarmalayıcı olarak
-- korunuyor ki dağıtım sırasında (migration önce, kod sonra) iki taraf da
-- çalışsın.

-- ---------------------------------------------------------------
-- 1) Ödeme sonuçlandırma
-- ---------------------------------------------------------------
create or replace function public.arc_settle_storefront_order(
  p_order_id uuid,
  p_paid boolean,
  p_payment_reference text default null,
  p_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function public.arc_settle_storefront_order(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.arc_settle_storefront_order(uuid, boolean, text, text) to service_role;

-- Eski ad: dağıtım penceresinde kod hâlâ bunu çağırıyor olabilir.
create or replace function public.settle_arvoculture_storefront_order(
  p_order_id uuid,
  p_paid boolean,
  p_payment_reference text default null,
  p_failure_reason text default null
)
returns text
language sql
security definer
set search_path to ''
as $function$
  select public.arc_settle_storefront_order(p_order_id, p_paid, p_payment_reference, p_failure_reason);
$function$;

revoke all on function public.settle_arvoculture_storefront_order(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.settle_arvoculture_storefront_order(uuid, boolean, text, text) to service_role;

-- ---------------------------------------------------------------
-- 2) Tedarikçi stok yazımı
-- ---------------------------------------------------------------
-- Kurum artık parametre. Eski iki argümanlı sürüm DÜŞÜRÜLÜYOR: kalırsa
-- çağrı ona düşmeye devam eder ve hata sessizce sürer.
drop function if exists public.arc_bulk_update_supplier_stock(text, jsonb);

create or replace function public.arc_bulk_update_supplier_stock(
  p_organization_id uuid,
  p_supplier text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

revoke all on function public.arc_bulk_update_supplier_stock(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.arc_bulk_update_supplier_stock(uuid, text, jsonb) to service_role;
