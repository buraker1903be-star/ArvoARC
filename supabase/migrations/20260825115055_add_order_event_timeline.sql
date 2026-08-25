create table public.arc_order_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  event_type text not null check(event_type in ('status_updated','fulfillment_updated')),
  event_data jsonb not null default '{}'::jsonb check(jsonb_typeof(event_data)='object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(order_id,organization_id) references public.arc_orders(id,organization_id) on delete cascade
);
create index arc_order_events_order_created_idx on public.arc_order_events(order_id,created_at desc);
alter table public.arc_order_events enable row level security;
grant select,insert on public.arc_order_events to authenticated;
create policy "arc members read order events" on public.arc_order_events for select to authenticated using(exists(select 1 from public.organization_memberships m where m.organization_id=arc_order_events.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
create policy "arc managers insert order events" on public.arc_order_events for insert to authenticated with check(exists(select 1 from public.organization_memberships m where m.organization_id=arc_order_events.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

create or replace function public.arc_log_order_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status is distinct from new.status or old.payment_status is distinct from new.payment_status then
    insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by)
    values(new.organization_id,new.id,'status_updated',jsonb_build_object('old_status',old.status,'new_status',new.status,'old_payment_status',old.payment_status,'new_payment_status',new.payment_status),auth.uid());
  elsif (old.metadata->>'shipping_carrier') is distinct from (new.metadata->>'shipping_carrier')
     or (old.metadata->>'tracking_number') is distinct from (new.metadata->>'tracking_number')
     or (old.metadata->>'tracking_url') is distinct from (new.metadata->>'tracking_url')
     or (old.metadata->>'internal_note') is distinct from (new.metadata->>'internal_note') then
    insert into public.arc_order_events(organization_id,order_id,event_type,event_data,created_by)
    values(new.organization_id,new.id,'fulfillment_updated',jsonb_build_object('shipping_carrier',new.metadata->>'shipping_carrier','tracking_number',new.metadata->>'tracking_number'),auth.uid());
  end if;
  return new;
end;$$;
revoke all on function public.arc_log_order_event() from public,anon,authenticated;
create trigger arc_orders_log_event after update on public.arc_orders for each row execute function public.arc_log_order_event();