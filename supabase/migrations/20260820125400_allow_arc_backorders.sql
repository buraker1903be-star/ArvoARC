alter table public.arc_product_variants
  drop constraint if exists arc_product_variants_stock_check;

alter table public.arc_product_variants
  add column if not exists allow_backorder boolean not null default true;

comment on column public.arc_product_variants.allow_backorder is
  'When true, orders may reduce stock below zero for this variant.';

create or replace function public.arc_create_order(
  p_customer_name text,
  p_customer_email text,
  p_items jsonb,
  p_source text default 'native'
)
returns table(order_id uuid, order_number text, total bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_org_id uuid; v_order_id uuid; v_order_number text;
  v_total bigint := 0; v_item jsonb; v_variant_id uuid; v_quantity integer; v_variant record;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_source not in ('native','shopify') then raise exception 'Invalid order source'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Order must contain at least one item'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id:=nullif(v_item->>'variant_id','')::uuid; v_quantity:=nullif(v_item->>'quantity','')::integer;
    if v_variant_id is null or v_quantity is null or v_quantity<=0 then raise exception 'Invalid order item'; end if;
    select v.id,v.organization_id,v.sku,v.price,v.stock,v.allow_backorder,p.name product_name into v_variant
      from public.arc_product_variants v join public.arc_products p on p.id=v.product_id and p.organization_id=v.organization_id
      where v.id=v_variant_id for update of v;
    if not found then raise exception 'Variant not found'; end if;
    if v_org_id is null then v_org_id:=v_variant.organization_id; elsif v_org_id<>v_variant.organization_id then raise exception 'All order items must belong to the same organization'; end if;
    if v_variant.stock-v_quantity<0 and not v_variant.allow_backorder then raise exception 'Insufficient stock for SKU %',v_variant.sku; end if;
    v_total:=v_total+(v_variant.price*v_quantity);
  end loop;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=v_org_id and m.user_id=v_user_id and m.is_active and m.role::text in ('owner','admin','manager')) then raise exception 'Insufficient permissions'; end if;
  if not exists(select 1 from public.organization_modules om where om.organization_id=v_org_id and om.module_code='commerce' and om.is_enabled) then raise exception 'Commerce module is disabled'; end if;
  v_order_number:='ARC-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,6));
  insert into public.arc_orders(organization_id,order_number,source,customer_email,customer_name,subtotal,total)
  values(v_org_id,v_order_number,p_source,nullif(trim(p_customer_email),''),nullif(trim(p_customer_name),''),v_total,v_total) returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant_id:=(v_item->>'variant_id')::uuid; v_quantity:=(v_item->>'quantity')::integer;
    select v.sku,v.price,p.name product_name into v_variant from public.arc_product_variants v join public.arc_products p on p.id=v.product_id where v.id=v_variant_id;
    insert into public.arc_order_items(organization_id,order_id,variant_id,product_name,sku,quantity,unit_price,total)
    values(v_org_id,v_order_id,v_variant_id,v_variant.product_name,v_variant.sku,v_quantity,v_variant.price,v_variant.price*v_quantity);
    update public.arc_product_variants set stock=stock-v_quantity,updated_at=now() where id=v_variant_id;
    insert into public.arc_inventory_movements(organization_id,variant_id,kind,quantity,reference_type,reference_id,note,created_by)
    values(v_org_id,v_variant_id,'sale',-v_quantity,'order',v_order_id::text,'Sipariş '||v_order_number,v_user_id);
  end loop;
  return query select v_order_id,v_order_number,v_total;
end;
$$;

revoke all on function public.arc_create_order(text,text,jsonb,text) from public, anon;
grant execute on function public.arc_create_order(text,text,jsonb,text) to authenticated;
