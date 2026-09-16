-- Arc mağazasının ödeme gecikmesinde kademeli kapanması.
--
-- Kurucu kararı (2026-09-16): ödeme gecikince mağaza bir anda kapanmaz,
-- kademe kademe daralır. Böylece geciken müşteri satışını sürdürüp borcunu
-- ödeyebilir; ödemezse kayıp büyümeden durur.
--
--   open          Lisans sürüyor. Her şey açık.
--   panel_closed  Dönem bitti. Panel kapalı; vitrin ve satış sürüyor.
--                 (Mağaza sahibi yönetemez ama müşterileri alışverişe devam eder.)
--   sales_closed  Dönem sonu + 1 ay. Satış ve tahsilat kapalı; vitrin görünür.
--   closed        Dönem sonu + 2 ay. Vitrin de kapalı.
--
-- Kural tek yerde: panel (requireTenant), ödeme ucu (api/storefront/odeme) ve
-- vitrin aynı fonksiyonu okur. Üç ayrı yere kopyalanırsa zamanla saparlar.

create or replace function public.arc_store_stage(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select case
        -- Kurucu iptal ettiyse kademe işletilmez.
        when l.status = 'canceled' then 'closed'
        -- Süresi dolmamış aktif ya da deneme lisansı: her şey açık.
        when l.status in ('active','trialing')
             and (l.current_period_end is null or l.current_period_end > now())
          then 'open'
        -- Kurucu elle askıya aldıysa satış da durur; vitrin görünür kalır.
        when l.status = 'suspended' then 'sales_closed'
        -- Dönem sonu yoksa kademe sayılamaz; en hafif yaptırım uygulanır.
        when l.current_period_end is null then 'panel_closed'
        when now() < l.current_period_end + interval '1 month' then 'panel_closed'
        when now() < l.current_period_end + interval '2 months' then 'sales_closed'
        else 'closed'
      end
      from public.organization_product_licenses l
      where l.organization_id = p_organization_id and l.product = 'arc'
    ),
    -- Lisans satırı hiç yoksa: mağazayı kapatmak yerine yalnızca paneli
    -- kapatıyoruz. Sessizce satışı durdurmak, kurulumu yarım kalmış bir
    -- mağazanın cirosunu fark edilmeden sıfırlar; panelin kapanması ise
    -- durumu hemen görünür kılar.
    'panel_closed'
  )
$function$;

revoke all on function public.arc_store_stage(uuid) from public;
grant execute on function public.arc_store_stage(uuid) to authenticated, anon, service_role;

-- Kiracı çözümlemesi kademeyi de döndürsün (panel tek sorguda karar versin).
-- Dönüş tipine sütun eklendiği için create or replace yetmiyor.
drop function if exists public.arc_resolve_commerce_tenant();
create function public.arc_resolve_commerce_tenant()
returns table(
  organization_id uuid,
  membership_role text,
  organization_name text,
  organization_slug text,
  plan_code text,
  organization_status text,
  commerce_enabled boolean,
  arc_license_status text,
  arc_period_end timestamptz,
  arc_stage text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select organization.id,
         membership.role::text,
         organization.name,
         organization.slug,
         organization.plan_code::text,
         organization.status::text,
         coalesce(module.is_enabled, false),
         coalesce(arc.status, 'inactive'),
         arc.current_period_end,
         public.arc_store_stage(organization.id)
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  left join public.organization_modules module
    on module.organization_id = organization.id and module.module_code = 'commerce'
  left join public.organization_product_licenses arc
    on arc.organization_id = organization.id and arc.product = 'arc'
  where membership.user_id = auth.uid() and membership.is_active = true
  order by (organization.slug = 'arvoculture') desc, membership.joined_at
  limit 1
$function$;

revoke all on function public.arc_resolve_commerce_tenant() from public, anon;
grant execute on function public.arc_resolve_commerce_tenant() to authenticated;
