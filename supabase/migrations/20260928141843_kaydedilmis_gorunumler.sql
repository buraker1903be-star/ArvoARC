-- KAYDEDİLMİŞ GÖRÜNÜMLER: süzgeç birleşiminin adı.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Panelde günlük iş hep aynı birkaç süzgeçle yapılıyor: "bugün onay
-- bekleyenler", "sorunlu kargolar", "taslak kalmış Tarzyeri ürünleri".
-- Bunları her sabah yeniden kurmak üç ayrı tıklama ve kimse yer imine
-- koymuyor, çünkü panelde adres satırı görünmüyor.
--
-- GÖRÜNÜM KİŞİYE DEĞİL SALONA AİT. Kaydeden kişi tatildeyken de ekibin
-- "bugün kargolanacaklar" görünümüne ihtiyacı var; kişisel tutulsaydı
-- aynı süzgeç salonda üç kere kurulurdu. Kimin kurduğu yine de
-- yazılıyor (created_by): bir görünümün neden var olduğunu sormak
-- gerektiğinde tek ipucu o.
--
-- SORGU METİN OLARAK SAKLANIYOR, JSONB DEĞİL. Görünüm bir adrese
-- gidiyor; adres zaten sorgu dizgisi. JSONB'ye çevirip geri kurmak iki
-- yönlü bir dönüşüm daha demekti ve sütunun tek okuyucusu var. İçerik
-- uygulama tarafında yalnızca tanınan anahtar ve değerlerden YENİDEN
-- KURULARAK yazılıyor (lib/kayitli-gorunum.ts): ham kullanıcı metni
-- buraya girmiyor.

create table if not exists public.arc_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hangi liste: 'siparisler' | 'urunler'. Yeni liste eklenince kısıt genişler.
  liste text not null check (liste in ('siparisler', 'urunler')),
  ad text not null check (length(btrim(ad)) between 1 and 40),
  -- "filter=pending&period=7" — sayfa numarası TAŞIMIYOR; görünüm bir süzgeç.
  sorgu text not null check (length(sorgu) between 1 and 400),
  -- Şeritteki yeri; eşitlikte kurulma sırası belirliyor.
  sira integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.arc_saved_views is
  'Panel listelerinde kaydedilmiş süzgeç birleşimleri; salon genelinde paylaşılır.';

-- Aynı listede aynı ad taşıyan iki görünüm: şeritte hangisinin ne
-- olduğu anlaşılmaz. Ad büyük/küçük harften bağımsız tekil —
-- "Bekleyenler" ile "bekleyenler" aynı görünümdür.
create unique index if not exists arc_saved_views_ad_uniq
  on public.arc_saved_views (organization_id, liste, lower(ad));

create index if not exists arc_saved_views_liste_idx
  on public.arc_saved_views (organization_id, liste, sira, created_at);

alter table public.arc_saved_views enable row level security;

/*
  OKUMA tüm etkin üyelere açık: görünüm ekranın bir parçası, gizli bir
  veri taşımıyor ve depocunun da "bugün kargolanacaklar"a ihtiyacı var.

  YAZMA owner/admin/manager'a açık. private.arvo_is_org_admin
  KULLANILMADI: o yardımcı yalnızca owner/admin sayıyor ve görünüm
  kurmak yönetsel bir iş değil — günlük işi yapan mağaza müdürü kendi
  süzgecini kaydedebilmeli. Panelin "canManage" kapısı da bu üç rol.
*/
drop policy if exists arc_saved_views_member_read on public.arc_saved_views;
create policy arc_saved_views_member_read on public.arc_saved_views
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_saved_views.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

drop policy if exists arc_saved_views_manager_insert on public.arc_saved_views;
create policy arc_saved_views_manager_insert on public.arc_saved_views
  as permissive for insert to authenticated
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_saved_views.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
  ));

drop policy if exists arc_saved_views_manager_update on public.arc_saved_views;
create policy arc_saved_views_manager_update on public.arc_saved_views
  as permissive for update to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_saved_views.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_saved_views.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
  ));

drop policy if exists arc_saved_views_manager_delete on public.arc_saved_views;
create policy arc_saved_views_manager_delete on public.arc_saved_views
  as permissive for delete to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_saved_views.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
  ));

-- Geri almak için:
-- drop table public.arc_saved_views;
