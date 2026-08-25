insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arc-product-images',
  'arc-product-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "arc members list product images"
on storage.objects for select to authenticated
using (
  bucket_id = 'arc-product-images'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  )
);

create policy "arc managers upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'arc-product-images'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner','admin','manager')
  )
);

create policy "arc managers update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'arc-product-images'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner','admin','manager')
  )
)
with check (
  bucket_id = 'arc-product-images'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner','admin','manager')
  )
);

create policy "arc managers delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'arc-product-images'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner','admin','manager')
  )
);
