-- ============================================================
-- Ödeme sonucunun işlenmesi
--
-- Bu fonksiyon `anon` rolüne AÇILMAZ. Yalnızca sunucu tarafındaki
-- callback servisi, service_role anahtarıyla çağırır. Aksi hâlde
-- herkes kendi siparişini "ödendi" işaretleyebilirdi.
--
-- Stok burada düşülür, sipariş oluşturulurken değil: ödeme
-- başarısız olursa stok boşuna kilitlenmemeli.
--
-- Fonksiyon aynı sipariş için ikinci kez çağrılırsa hiçbir şey
-- yapmaz. PayTR bildirimi tekrarlayabilir; stoğun iki kez
-- düşmesi kabul edilemez.
-- ============================================================

create or replace function public.settle_arvoculture_storefront_order(
  p_order_id uuid,
  p_paid boolean,
  p_payment_reference text default null,
  p_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_current text;
  v_item record;
begin
  select o.organization_id, o.payment_status
    into v_org_id, v_current
  from public.arc_orders o
  join public.organizations org
    on org.id = o.organization_id
   and org.slug = 'arvoculture'
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

  -- Stok düşümü. Yetersizse sipariş ödendi kalır ama işleme
  -- alınmaz; ekip panelden görüp müdahale eder. Müşterinin
  -- parası alınmışken siparişi sessizce iptal etmek yanlış olur.
  for v_item in
    select variant_id, quantity
    from public.arc_order_items
    where order_id = p_order_id
      and variant_id is not null
  loop
    update public.arc_product_variants
       set stock = greatest(stock - v_item.quantity, 0),
           updated_at = now()
     where id = v_item.variant_id
       and organization_id = v_org_id;
  end loop;

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
$$;

comment on function public.settle_arvoculture_storefront_order is
  'PayTR bildirimi sonrası siparişi kapatır. Yalnızca service_role çağırabilir; anon rolüne açılmamalıdır.';

revoke all on function public.settle_arvoculture_storefront_order(
  uuid, boolean, text, text
) from public, anon, authenticated;
