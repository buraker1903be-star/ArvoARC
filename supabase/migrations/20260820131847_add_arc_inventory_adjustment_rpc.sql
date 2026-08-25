create or replace function public.arc_adjust_inventory(
  p_variant_id uuid,
  p_quantity integer,
  p_kind text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_note text default null
)
returns table(variant_id uuid, previous_stock integer, new_stock integer, movement_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_org_id uuid; v_prev integer; v_next integer;
  v_allow_backorder boolean; v_movement_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_quantity=0 then raise exception 'Quantity cannot be zero'; end if;
  if p_kind not in ('in','out','adjustment','sale','return','sync') then raise exception 'Invalid inventory movement kind'; end if;
  select organization_id,stock,allow_backorder into v_org_id,v_prev,v_allow_backorder
    from public.arc_product_variants where id=p_variant_id for update;
  if v_org_id is null then raise exception 'Variant not found'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=v_org_id and m.user_id=v_user_id and m.is_active and m.role::text in ('owner','admin','manager')) then raise exception 'Insufficient permissions'; end if;
  if not exists(select 1 from public.organization_modules om where om.organization_id=v_org_id and om.module_code='commerce' and om.is_enabled) then raise exception 'Commerce module is disabled'; end if;
  v_next:=v_prev+p_quantity;
  if v_next<0 and not v_allow_backorder then raise exception 'Insufficient stock and backorder is disabled'; end if;
  update public.arc_product_variants set stock=v_next,updated_at=now() where id=p_variant_id;
  insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by)
  values(v_org_id,p_variant_id,p_kind,p_quantity,p_reference_type,p_reference_id,p_note,v_user_id) returning id into v_movement_id;
  return query select p_variant_id,v_prev,v_next,v_movement_id;
end;
$$;

revoke all on function public.arc_adjust_inventory(uuid,integer,text,text,text,text) from public, anon;
grant execute on function public.arc_adjust_inventory(uuid,integer,text,text,text,text) to authenticated;
