-- BÖLÜNMÜŞ KARGO: bir sipariş, birden çok kargo firmasına ayrılabilir.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Neden ayrı tablo: sipariş tek bir kargo alanı taşıyordu (arc_orders.shipping)
-- ve bir gönderiden fazlasını anlatamıyordu. Oysa bir siparişin kalemleri farklı
-- firmalara bölünebiliyor: kırılgan ürün bir firmaya, ağır ürün başka firmaya.
--
-- tryOTO'nun modeli bunu dayatıyor: createShipment tek bir orderId alıyor, yani
-- OTO tarafında bir gönderi = bir sipariş. Bir ArvoARC siparişini ikiye bölmek,
-- OTO'da İKİ ayrı sipariş açmak demek. oto_order_id bu yüzden gönderi başına
-- tutuluyor, sipariş başına değil.

create table if not exists public.arc_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.arc_orders(id) on delete cascade,
  -- Gönderinin sipariş içindeki sırası; ekranda "1/3 paket" diye okunuyor.
  sequence integer not null default 1,
  -- tryOTO tarafındaki karşılıklar. Gönderi taslakken hepsi boş: kullanıcı
  -- önce kalemleri ayırıyor, firmayı sonra seçiyor.
  oto_order_id text,
  delivery_option_id text,
  carrier_code text,
  carrier_name text,
  tracking_number text,
  tracking_url text,
  awb_url text,
  status text not null default 'draft',
  -- Hata metni saklanıyor: "gönderi oluşturulamadı" tek başına kullanıcıya
  -- bir şey söylemiyor, OTO'nun mesajı (bakiye yetersiz, adres eksik) söylüyor.
  failure_reason text,
  -- Kargo bedeli KURUŞ cinsinden tamsayı (AGENTS.md: para kuruş).
  shipping_cost integer,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint arc_shipments_status_check check (
    status in ('draft', 'created', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed')
  ),
  constraint arc_shipments_sequence_check check (sequence > 0),
  constraint arc_shipments_cost_check check (shipping_cost is null or shipping_cost >= 0)
);

create index if not exists arc_shipments_order_idx on public.arc_shipments (order_id, sequence);
create index if not exists arc_shipments_org_idx on public.arc_shipments (organization_id, status);
-- Takip numarası firma başına benzersiz: aynı numarayı iki gönderiye yazmak,
-- webhook geldiğinde hangi gönderinin güncelleneceğini belirsiz bırakır.
create unique index if not exists arc_shipments_tracking_idx
  on public.arc_shipments (organization_id, carrier_code, tracking_number)
  where tracking_number is not null;

create table if not exists public.arc_shipment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.arc_shipments(id) on delete cascade,
  order_item_id uuid not null references public.arc_order_items(id) on delete cascade,
  quantity integer not null,
  created_at timestamptz not null default now(),
  constraint arc_shipment_items_quantity_check check (quantity > 0),
  -- Aynı kalem bir gönderide iki satır olamaz; miktar tek satırda toplanır.
  constraint arc_shipment_items_unique unique (shipment_id, order_item_id)
);

create index if not exists arc_shipment_items_order_item_idx
  on public.arc_shipment_items (order_item_id);

-- ---------------------------------------------------------------------------
-- MİKTAR BÜTÜNLÜĞÜ TETİKLEYİCİYLE KORUNUYOR.
--
-- RLS "kim yazabilir"i söyler, "ne kadar"ı söylemez: panelin oturum jetonu
-- tarayıcıda ve bu tabloya INSERT yetkisi olan kullanıcı API'den doğrudan
-- istediği miktarı yazabilir. Sipariş kaleminden fazlasını kargoya vermek
-- stoğu ve iade hesabını bozar, üstelik müşteriye olmayan ürün için takip
-- numarası gider.
--
-- İPTAL EDİLEN gönderi sayıma girmiyor: iptal edilen bir gönderinin kalemleri
-- yeniden bölünebilmeli, yoksa yanlış firmaya verilen bir gönderi siparişi
-- sonsuza kadar kilitlerdi.
-- ---------------------------------------------------------------------------
create or replace function private.arvo_arc_shipment_item_guard()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
declare
  siparis_adedi integer;
  gonderilen integer;
  hedef_siparis uuid;
begin
  select oi.quantity, oi.order_id into siparis_adedi, hedef_siparis
  from public.arc_order_items oi
  where oi.id = new.order_item_id;

  if siparis_adedi is null then
    raise exception 'Sipariş kalemi bulunamadı.';
  end if;

  -- Gönderi ile kalem aynı siparişe ait olmalı: başka siparişin kalemini
  -- bu gönderiye eklemek, iki siparişi birbirine bağlardı.
  if not exists (
    select 1 from public.arc_shipments s
    where s.id = new.shipment_id and s.order_id = hedef_siparis
  ) then
    raise exception 'Kalem bu gönderinin siparişine ait değil.';
  end if;

  select coalesce(sum(si.quantity), 0) into gonderilen
  from public.arc_shipment_items si
  join public.arc_shipments s on s.id = si.shipment_id
  where si.order_item_id = new.order_item_id
    and s.status <> 'cancelled'
    and (tg_op = 'INSERT' or si.id <> new.id);

  if gonderilen + new.quantity > siparis_adedi then
    raise exception 'Kargoya verilen adet sipariş adedini aşamaz (sipariş: %, önceden ayrılan: %, eklenen: %).',
      siparis_adedi, gonderilen, new.quantity;
  end if;

  return new;
end;
$$;

create trigger arvo_arc_shipment_item_guard
before insert or update on public.arc_shipment_items
for each row execute function private.arvo_arc_shipment_item_guard();

create or replace function private.arvo_arc_shipment_touch()
returns trigger language plpgsql security invoker set search_path to '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger arvo_arc_shipment_touch
before update on public.arc_shipments
for each row execute function private.arvo_arc_shipment_touch();

-- ---------------------------------------------------------------------------
-- RLS: her şey mağaza kapsamlı (AGENTS.md değişmezi).
-- ---------------------------------------------------------------------------
alter table public.arc_shipments enable row level security;
alter table public.arc_shipment_items enable row level security;

create policy arc_shipments_member_all on public.arc_shipments
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipments.organization_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipments.organization_id and m.user_id = (select auth.uid())
  ));

create policy arc_shipment_items_member_all on public.arc_shipment_items
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipment_items.organization_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipment_items.organization_id and m.user_id = (select auth.uid())
  ));

-- Tetikleyici fonksiyonları private şemada; kimse doğrudan çağırmıyor.
revoke all on function private.arvo_arc_shipment_item_guard() from public, anon, authenticated;
revoke all on function private.arvo_arc_shipment_touch() from public, anon, authenticated;

grant select, insert, update, delete on public.arc_shipments to authenticated;
grant select, insert, update, delete on public.arc_shipment_items to authenticated;
grant all on public.arc_shipments to service_role;
grant all on public.arc_shipment_items to service_role;

-- ---------------------------------------------------------------------------
-- tryOTO KİMLİK BİLGİSİ MAĞAZA BAŞINA, ortam değişkeninde değil.
--
-- Entegrasyon şimdilik tek mağazada (Tarzyeri) kullanılacak; yine de ayar
-- mağaza kapsamlı duruyor. Tek mağazaya sabitlenmiş kod bu projede somut
-- hasara yol açtı: settle_arvoculture_storefront_order ve tedarikçi stok
-- yazımı ArvoCulture'a sabitliydi, diğer mağazalarda sipariş sonsuza kadar
-- "ödeme bekliyor"da kalıyordu (AGENTS.md). Ortam değişkenine konan tek bir
-- anahtar da aynı şey olurdu: ikinci mağaza açıldığında gönderiler yanlış
-- OTO hesabına düşerdi.
--
-- Refresh token PayTR anahtarlarıyla AYNI yöntemle şifreleniyor
-- (AES-256-GCM, src/lib/payment-credentials.ts). Access token saklanmıyor:
-- kısa ömürlü ve refreshToken ucundan her seferinde üretiliyor.
-- ---------------------------------------------------------------------------
alter table public.arc_store_settings
  add column if not exists tryoto_enabled boolean not null default false,
  add column if not exists tryoto_refresh_token_enc text,
  -- Sabit gönderici adresi: createOrder'da her seferinde adres yazmak yerine
  -- OTO'da tanımlı konumun kodu gönderiliyor.
  add column if not exists tryoto_pickup_location_code text,
  -- Sandbox hesabı ayrı: canlıya geçmeden gönderi denemesi yapılabilsin.
  add column if not exists tryoto_test_mode boolean not null default true;
