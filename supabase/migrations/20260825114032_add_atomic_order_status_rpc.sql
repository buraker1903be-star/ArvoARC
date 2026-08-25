create or replace function public.arc_update_order_status(
  p_order_id uuid,
  p_status text,
  p_payment_status text
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_item record;
  v_variant record;
  v_old_terminal boolean;
  v_new_terminal boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_status not in ('pending','confirmed','processing','fulfilled','cancelled','refunded') then raise exception 'Invalid order status'; end if;
  if p_payment_status not in ('pending','authorized','paid','partially_refunded','refunded','failed') then raise exception 'Invalid payment status'; end if;

  select id,organization_id,order_number,source,status into v_order
  from public.arc_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if not exists(
    select 1 from public.organization_memberships membership
    where membership.organization_id=v_order.organization_id
      and membership.user_id=v_user_id and membership.is_active=true
      and membership.role::text in ('owner','admin','manager')
  ) then raise exception 'Insufficient permissions'; end if;

  v_old_terminal := v_order.status in ('cancelled','refunded');
  v_new_terminal := p_status in ('cancelled','refunded');

  if v_order.source='native' and v_old_terminal<>v_new_terminal then
    for v_item in
      select variant_id,quantity from public.arc_order_items
      where organization_id=v_order.organization_id and order_id=v_order.id and variant_id is not null
    loop
      select id,stock,allow_backorder into v_variant
      from public.arc_product_variants
      where id=v_item.variant_id and organization_id=v_order.organization_id
      for update;
      if not found then raise exception 'Order variant not found'; end if;

      if v_new_terminal then
        update public.arc_product_variants set stock=stock+v_item.quantity,updated_at=now() where id=v_variant.id;
        insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by)
        values(v_order.organization_id,v_variant.id,'return',v_item.quantity,'order_status',v_order.id::text,'Sipariş iptal/iade: '||v_order.order_number,v_user_id);
      else
        if v_variant.stock<v_item.quantity and not v_variant.allow_backorder then
          raise exception 'Insufficient stock to reopen order %',v_order.order_number;
        end if;
        update public.arc_product_variants set stock=stock-v_item.quantity,updated_at=now() where id=v_variant.id;
        insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by)
        values(v_order.organization_id,v_variant.id,'sale',-v_item.quantity,'order_status',v_order.id::text,'Sipariş yeniden açıldı: '||v_order.order_number,v_user_id);
      end if;
    end loop;
  end if;

  update public.arc_orders set status=p_status,payment_status=p_payment_status,updated_at=now()
  where id=v_order.id and organization_id=v_order.organization_id;
end;
$$;

revoke all on function public.arc_update_order_status(uuid,text,text) from public,anon;
grant execute on function public.arc_update_order_status(uuid,text,text) to authenticated;