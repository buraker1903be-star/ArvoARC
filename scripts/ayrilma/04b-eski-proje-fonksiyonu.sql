-- ============================================================
-- ARC ayrılması, son aktarım: ESKİ (ortak) projeye (oahshpkgdzrraqdzjqau)
-- uygulanır. Salt okunur: hiçbir şeyi değiştirmez, yalnızca ARC'a ait
-- hesapları şifre özetleriyle döndürür. Geçişten sonra 04c-temizlik.sql ile
-- kaldırılır.
--
-- Neden: hesap API'si şifre özetini vermiyor; müşteriler yeni projede
-- mevcut şifreleriyle girebilsin diye özet veritabanından okunmalı.
--
-- Seçim (19.09.2026 provasıyla aynı): ARC lisanslı kurumların üyeleri;
-- ARC'ta siparişi, adresi, favorisi ya da iadesi olanlar; ARC kayıtlarında
-- "oluşturan/güncelleyen" olarak geçenler; hiçbir kuruma üye olmayan ve
-- ArvoOS davet/çalışan izi taşımayan hesaplar (vitrin müşterileri).
-- ArvoOS personeli taşınmaz.
--
-- Yalnızca service_role (secret anahtar) çağırabilir.
-- ============================================================

create or replace function public.arc_aktarim_hesaplar()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with secili as (
    select u.id
    from auth.users u
    where exists (
            select 1 from public.organization_memberships m
            join public.organization_product_licenses l on l.organization_id = m.organization_id and l.product = 'arc'
            where m.user_id = u.id)
       or exists (select 1 from public.arc_orders o where o.user_id = u.id)
       or exists (select 1 from public.arc_customer_addresses a where a.user_id = u.id)
       or exists (select 1 from public.arc_customer_favourites f where f.user_id = u.id)
       or exists (select 1 from public.arc_return_requests r where r.user_id = u.id)
       or u.id in (
            select created_by from public.arc_products where created_by is not null
            union select created_by from public.arc_inventory_movements where created_by is not null
            union select created_by from public.arc_import_batches where created_by is not null
            union select created_by from public.arc_order_events where created_by is not null
            union select updated_by from public.arc_store_themes where updated_by is not null)
       or (not exists (select 1 from public.organization_memberships m where m.user_id = u.id)
           and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ?| array['arvoos_employee_id', 'arvoos_invitation_id', 'arvoos_organization_id']))
  )
  select jsonb_build_object(
    'kullanicilar', coalesce((select jsonb_agg(to_jsonb(u)) from auth.users u where u.id in (select id from secili)), '[]'::jsonb),
    'kimlikler', coalesce((select jsonb_agg(to_jsonb(i)) from auth.identities i where i.user_id in (select id from secili)), '[]'::jsonb)
  );
$$;

revoke all on function public.arc_aktarim_hesaplar() from public, anon, authenticated;
grant execute on function public.arc_aktarim_hesaplar() to service_role;

-- Veri API'si yeni fonksiyonu hemen görsün (yoksa "schema cache" hatası).
notify pgrst, 'reload schema';
