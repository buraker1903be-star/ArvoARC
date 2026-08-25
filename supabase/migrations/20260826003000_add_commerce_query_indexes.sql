create index if not exists arc_variants_org_product_idx
  on public.arc_product_variants(organization_id,product_id);

create index if not exists arc_variants_org_stock_idx
  on public.arc_product_variants(organization_id,stock);

create index if not exists arc_order_items_org_order_idx
  on public.arc_order_items(organization_id,order_id);

create index if not exists arc_inventory_org_created_idx
  on public.arc_inventory_movements(organization_id,created_at desc);

create index if not exists arc_orders_org_status_created_idx
  on public.arc_orders(organization_id,status,created_at desc);

create index if not exists arc_orders_org_payment_created_idx
  on public.arc_orders(organization_id,payment_status,created_at desc);
