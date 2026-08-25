alter table public.arc_store_settings
  add column if not exists logo_path text null,
  add column if not exists favicon_path text null,
  add column if not exists primary_color text not null default '#002045',
  add column if not exists accent_color text not null default '#6f9548',
  add column if not exists custom_domain text null,
  add column if not exists platform_subdomain text null,
  add column if not exists domain_status text not null default 'not_configured',
  add column if not exists domain_verification_token text null,
  add column if not exists domain_verified_at timestamptz null;

alter table public.arc_store_settings drop constraint if exists arc_store_settings_primary_color_check;
alter table public.arc_store_settings add constraint arc_store_settings_primary_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.arc_store_settings drop constraint if exists arc_store_settings_accent_color_check;
alter table public.arc_store_settings add constraint arc_store_settings_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.arc_store_settings drop constraint if exists arc_store_settings_custom_domain_check;
alter table public.arc_store_settings add constraint arc_store_settings_custom_domain_check check (custom_domain is null or custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$');
alter table public.arc_store_settings drop constraint if exists arc_store_settings_platform_subdomain_check;
alter table public.arc_store_settings add constraint arc_store_settings_platform_subdomain_check check (platform_subdomain is null or platform_subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$');
alter table public.arc_store_settings drop constraint if exists arc_store_settings_domain_status_check;
alter table public.arc_store_settings add constraint arc_store_settings_domain_status_check check (domain_status in ('not_configured','pending_dns','verifying','active','failed'));

create unique index if not exists arc_store_settings_custom_domain_uidx on public.arc_store_settings(custom_domain) where custom_domain is not null;
create unique index if not exists arc_store_settings_platform_subdomain_uidx on public.arc_store_settings(platform_subdomain) where platform_subdomain is not null;

