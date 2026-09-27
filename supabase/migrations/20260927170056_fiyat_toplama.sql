-- FİYAT TOPLAMA: tarayıcı toplayıcısının gönderdiği satırlar.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- LR'ın portalından fiyatları sunucudan taramak denenmedi: site Apache
-- Wicket (durum tutan; derin bağlantı ana sayfaya atıyor, 27.09.2026'da
-- ölçüldü) ve giriş CAS SSO (tek kullanımlık execution jetonu). Taklit
-- etmek kullanıcının LR hesap şifresini saklamayı gerektirirdi.
--
-- Onun yerine kullanıcı kendi oturumunda bir düğmeye basıyor; tarayıcı
-- toplayıcısı sayfadaki SKU ve fiyatları okuyup panele gönderiyor.
-- Gelen liste burada bekliyor: kullanıcı panelde önizleyip onaylıyor.
-- Doğrudan fiyat yazmıyor — yanlış sütun toplanmış olabilir ve canlı
-- mağazada yanlış fiyat geri alınamaz bir hata.
--
-- Kayıtlar kalıcı: hangi gün hangi fiyatların toplandığı, sonradan
-- "bu fiyat nereden geldi" sorusunun tek cevabı.

create table if not exists public.arc_price_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hangi siteden toplandı; ileride başka tedarikçi eklenebilir.
  kaynak text not null default 'lr',
  -- [{sku, ad, fiyatlar:[kuruş...]}] — ham hâliyle, yorumlanmadan.
  satirlar jsonb not null,
  -- Toplayıcının çalıştığı sayfa; "nereden geldi" sorusunun cevabı.
  sayfa text,
  created_at timestamptz not null default now(),
  uygulandi_at timestamptz
);

comment on table public.arc_price_collections is
  'Tarayıcı toplayıcısının gönderdiği ham fiyat listeleri; panelde önizlenip uygulanıyor.';

create index if not exists arc_price_collections_org_idx
  on public.arc_price_collections (organization_id, created_at desc);

alter table public.arc_price_collections enable row level security;

/*
  Okuma ve güncelleme kurumun üyelerine açık. YAZMA POLİTİKASI YOK:
  toplayıcı servis anahtarıyla yazıyor (jetonu uç doğruluyor) ve
  tarayıcıdan gelen istek oturumlu bir kullanıcı taşımıyor.
*/
create policy arc_price_collections_member_read on public.arc_price_collections
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
  ));

create policy arc_price_collections_member_update on public.arc_price_collections
  as permissive for update to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
  ));
