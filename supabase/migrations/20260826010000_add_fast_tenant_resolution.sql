create or replace function public.arc_resolve_commerce_tenant()
returns table(
  organization_id uuid,
  membership_role text,
  organization_name text,
  organization_slug text,
  plan_code text,
  organization_status text,
  commerce_enabled boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select
    organization.id,
    membership.role::text,
    organization.name,
    organization.slug,
    organization.plan_code::text,
    organization.status::text,
    coalesce(module.is_enabled,false)
  from public.organization_memberships membership
  join public.organizations organization on organization.id=membership.organization_id
  left join public.organization_modules module
    on module.organization_id=organization.id and module.module_code='commerce'
  where membership.user_id=auth.uid() and membership.is_active=true
  order by (organization.slug='arvoculture') desc,membership.joined_at
  limit 1
$$;

revoke all on function public.arc_resolve_commerce_tenant() from public;
grant execute on function public.arc_resolve_commerce_tenant() to authenticated;
