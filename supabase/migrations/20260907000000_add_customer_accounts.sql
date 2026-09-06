-- ============================================================
-- Müşteri hesapları
--
-- ARC'ın mevcut RLS politikaları personel içindir:
-- `organization_memberships` üzerinden çalışır. Müşteri o
-- politikalarla hiçbir şey göremez. Bu migration müşteriye ait
-- ayrı ve dar bir erişim katmanı ekler.
--
-- Güvenlik kuralı: müşteri YALNIZCA kendi siparişlerini okur.
-- Yazma, güncelleme ve silme yetkisi yoktur; sipariş durumu
-- yalnızca panel ve ödeme servisi tarafından değiştirilir.
-- ============================================================

-- 1. Siparişi kullanıcıya bağlayan alan --------------------------
alter table public.arc_orders
  add column if not exists user_id uuid references auth.users(id);

create index if not exists arc_orders_user_id_idx
  on public.arc_orders (user_id);

-- E-posta ile eşleştirme için: müşteri kayıt olmadan önce sipariş
-- vermiş olabilir. Aşağıdaki fonksiyon o siparişleri hesaba bağlar.
create index if not exists arc_orders_customer_email_idx
  on public.arc_orders (lower(customer_email));

-- 2. Müşteri okuma politikası -----------------------------------
-- Mevcut personel politikalarına dokunulmaz; bunun yanına eklenir.
drop policy if exists arc_orders_customer_select on public.arc_orders;

create policy arc_orders_customer_select
  on public.arc_orders
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists arc_order_items_customer_select on public.arc_order_items;

create policy arc_order_items_customer_select
  on public.arc_order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.arc_orders o
      where o.id = arc_order_items.order_id
        and o.user_id = auth.uid()
    )
  );

-- 3. Kayıt sonrası geçmiş siparişleri hesaba bağlama ------------
--
-- Müşteri misafir olarak sipariş verip sonra kayıt olabilir.
-- Bu fonksiyon, doğrulanmış e-posta adresiyle eşleşen ve henüz
-- bir hesaba bağlanmamış siparişleri kullanıcıya bağlar.
--
-- E-posta `auth.jwt()` içinden okunur; istemciden alınmaz.
-- Aksi hâlde herkes başkasının e-postasını gönderip onun
-- siparişlerini kendi hesabına bağlayabilirdi.
create or replace function public.claim_arvoculture_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_verified boolean :=
    coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
    or coalesce((auth.jwt() ->> 'email_verified')::boolean, false);
  v_count integer;
begin
  if v_user_id is null or v_email = '' then
    return 0;
  end if;

  -- Doğrulanmamış e-posta ile sipariş sahiplenilemez.
  if not v_verified then
    return 0;
  end if;

  update public.arc_orders
     set user_id = v_user_id,
         updated_at = now()
   where user_id is null
     and lower(customer_email) = v_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.claim_arvoculture_orders is
  'Kayıt sonrası, doğrulanmış e-postayla eşleşen misafir siparişlerini hesaba bağlar.';

revoke all on function public.claim_arvoculture_orders() from public, anon;
grant execute on function public.claim_arvoculture_orders() to authenticated;

-- 4. Müşterinin kendi siparişlerini listelemesi -----------------
create or replace function public.get_arvoculture_my_orders()
returns table (
  order_number text,
  status text,
  payment_status text,
  total bigint,
  currency text,
  created_at timestamptz,
  items jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.order_number,
    o.status,
    o.payment_status,
    o.total,
    o.currency,
    o.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', i.product_name,
            'sku', i.sku,
            'quantity', i.quantity,
            'total', i.total
          )
          -- arc_order_items tablosunda created_at yok; kalemler
          -- eklenme sırasını koruyan kimliğe göre sıralanır.
          order by i.id
        )
        from public.arc_order_items i
        where i.order_id = o.id
      ),
      '[]'::jsonb
    ) as items
  from public.arc_orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit 100;
$$;

comment on function public.get_arvoculture_my_orders is
  'Giriş yapmış müşterinin kendi siparişlerini döndürür.';

revoke all on function public.get_arvoculture_my_orders() from public, anon;
grant execute on function public.get_arvoculture_my_orders() to authenticated;

-- 5. Sipariş oluştururken kullanıcıyı bağlama -------------------
-- Giriş yapmış müşteri sipariş verirse sipariş doğrudan hesabına
-- yazılır; sonradan sahiplenmeye gerek kalmaz.
create or replace function public.attach_arvoculture_order_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists arc_orders_attach_owner on public.arc_orders;

create trigger arc_orders_attach_owner
  before insert on public.arc_orders
  for each row
  execute function public.attach_arvoculture_order_owner();
