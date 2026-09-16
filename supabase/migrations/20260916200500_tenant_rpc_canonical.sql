-- arc_resolve_commerce_tenant'ın TEK sahibi burasıdır.
--
-- Fonksiyon bir süre iki deponun migration'ında birden tanımlıydı: ArvoOS'un
-- 20260916120000_product_subscriptions.sql dosyasında ve ArvoARC'ın
-- 20260916180000_store_access_stages.sql dosyasında. ArvoOS'taki sürümde
-- arc_stage sütunu yoktu.
--
-- Migration'lar iki ayrı klasörden elle uygulandığı için sıra garanti değil.
-- ArvoOS'un dosyası sonradan bir kez daha çalıştırılsa fonksiyon eski haline
-- döner, arc_stage kaybolur ve Arc'ın kademeli kapanma yaptırımı SESSİZCE
-- devre dışı kalır — panel eksik sütunu görünce kimseyi engellemiyor, çünkü
-- yayın sırası yüzünden mağaza kapatmak istemiyoruz.
--
-- Artık tanım yalnızca burada. ArvoOS'un dosyasından çıkarıldı; bu dosya
-- istendiği kadar tekrar çalıştırılabilir, sonuç hep aynı.
--
-- Bu dosyayı değiştirirken: ARC'ın src/lib/tenant.ts'i arc_stage bekliyor.
-- Sütunu kaldırırsanız yaptırım sessizce durur.

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
