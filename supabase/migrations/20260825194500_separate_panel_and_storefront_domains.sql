alter table public.arc_store_settings
  add column if not exists panel_custom_domain text null,
  add column if not exists panel_domain_status text not null default 'not_configured',
  add column if not exists panel_domain_verification_token text null,
  add column if not exists panel_domain_verified_at timestamptz null;

alter table public.arc_store_settings drop constraint if exists arc_store_settings_panel_custom_domain_check;
alter table public.arc_store_settings add constraint arc_store_settings_panel_custom_domain_check
  check (panel_custom_domain is null or panel_custom_domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$');

alter table public.arc_store_settings drop constraint if exists arc_store_settings_panel_domain_status_check;
alter table public.arc_store_settings add constraint arc_store_settings_panel_domain_status_check
  check (panel_domain_status in ('not_configured','pending_dns','verifying','active','failed'));

create unique index if not exists arc_store_settings_panel_custom_domain_uidx
  on public.arc_store_settings(panel_custom_domain)
  where panel_custom_domain is not null;

update public.arc_store_settings
set panel_custom_domain = 'app.arvoculture.com',
    panel_domain_status = 'pending_dns',
    panel_domain_verification_token = coalesce(panel_domain_verification_token, 'arvo-verification=42710432169348369e20f21b4eaadbef'),
    panel_domain_verified_at = null,
    custom_domain = 'arvoculture.com',
    platform_subdomain = 'arvoculture',
    domain_status = 'pending_dns',
    domain_verified_at = null,
    storefront_url = 'https://arvoculture.com',
    updated_at = now()
where organization_id = 'f00ab7ef-e9be-467b-9e95-db8f753275c3';
