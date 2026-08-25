create table if not exists public.arc_store_themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mode text not null check (mode in ('draft','published')),
  version integer not null default 1 check (version > 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  updated_by uuid null references auth.users(id) on delete set null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,mode)
);
create index if not exists arc_store_themes_org_mode_idx on public.arc_store_themes(organization_id,mode);
alter table public.arc_store_themes enable row level security;
revoke all on table public.arc_store_themes from anon,authenticated;
grant select on table public.arc_store_themes to anon;
grant select,insert,update,delete on table public.arc_store_themes to authenticated;

drop policy if exists "public reads published store themes" on public.arc_store_themes;
create policy "public reads published store themes" on public.arc_store_themes for select to anon
using (mode='published');
drop policy if exists "arc members read store themes" on public.arc_store_themes;
create policy "arc members read store themes" on public.arc_store_themes for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_store_themes.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "arc managers insert store themes" on public.arc_store_themes;
create policy "arc managers insert store themes" on public.arc_store_themes for insert to authenticated
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_store_themes.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
drop policy if exists "arc managers update store themes" on public.arc_store_themes;
create policy "arc managers update store themes" on public.arc_store_themes for update to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=arc_store_themes.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')))
with check (exists (select 1 from public.organization_memberships m where m.organization_id=arc_store_themes.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));
drop policy if exists "arc managers delete store themes" on public.arc_store_themes;
create policy "arc managers delete store themes" on public.arc_store_themes for delete to authenticated
using (mode='draft' and exists (select 1 from public.organization_memberships m where m.organization_id=arc_store_themes.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager')));

insert into public.arc_store_themes(organization_id,mode,version,config,published_at)
values
('f00ab7ef-e9be-467b-9e95-db8f753275c3','draft',1,'{"announcement":"2.000 TL üzeri ücretsiz kargo • İlk alışverişe ARVO10","hero_eyebrow":"ARVOCULTURE · APPAREL & BEAUTY","hero_title":"Seçtiğin şey,","hero_emphasis":"senin hikâyen.","hero_description":"Tarzını, bakımını ve gündelik ritüellerini tek bir kültürde buluşturan özgün seçkiler.","primary_cta_label":"Giyimi keşfet","primary_cta_href":"/koleksiyon/giyim","secondary_cta_label":"Bakımı keşfet","secondary_cta_href":"/koleksiyon/bakim","featured_eyebrow":"ÖNE ÇIKANLAR","featured_title":"Şimdi keşfet.","campaign_title":"İlk seçimine özel.","campaign_description":"İlk siparişinde ARVO10 koduyla %10 indirim.","primary_color":"#111210","accent_color":"#D9FF43","background_color":"#F5F2EC","typography":"editorial","hero_style":"editorial-orbs"}'::jsonb,null),
('f00ab7ef-e9be-467b-9e95-db8f753275c3','published',1,'{"announcement":"2.000 TL üzeri ücretsiz kargo • İlk alışverişe ARVO10","hero_eyebrow":"ARVOCULTURE · APPAREL & BEAUTY","hero_title":"Seçtiğin şey,","hero_emphasis":"senin hikâyen.","hero_description":"Tarzını, bakımını ve gündelik ritüellerini tek bir kültürde buluşturan özgün seçkiler.","primary_cta_label":"Giyimi keşfet","primary_cta_href":"/koleksiyon/giyim","secondary_cta_label":"Bakımı keşfet","secondary_cta_href":"/koleksiyon/bakim","featured_eyebrow":"ÖNE ÇIKANLAR","featured_title":"Şimdi keşfet.","campaign_title":"İlk seçimine özel.","campaign_description":"İlk siparişinde ARVO10 koduyla %10 indirim.","primary_color":"#111210","accent_color":"#D9FF43","background_color":"#F5F2EC","typography":"editorial","hero_style":"editorial-orbs"}'::jsonb,now())
on conflict (organization_id,mode) do nothing;

