-- ============================================================
-- Tedarikçi ayarlarında yetki uygulamayla hizalanıyor
--
-- arc_suppliers'ın tek politikası (arc_suppliers_member_all, FOR ALL):
--   using      → kurumun herhangi bir üyesi (rol yok, is_active yok)
--   with check → owner/admin/manager
--
-- DELETE yalnızca `using`'e bakar; bu yüzden HERHANGİ bir üye veritabanı
-- API'sinden (tarayıcıdaki oturum jetonuyla) tedarikçi kaydını silebiliyordu.
-- is_active denetimi olmadığı için pasife alınmış eski bir çalışan da kâr
-- oranlarını, besleme adresini okuyup silmeye devam edebiliyordu. Manager
-- ise kâr oranını ve stok tamponunu değiştirebiliyordu.
--
-- Uygulama bu tabloya yalnızca owner/admin ile yazıyor
-- (src/app/(panel)/tedarikci/actions.ts); tedarikçi sayfasını her üye
-- görüyor. Otomatik aktarım (api/tedarikci/ice-aktar) servis anahtarıyla
-- çalışır, RLS'ten etkilenmez.
--
-- Yeni kural: okuma → aktif üye; ekleme/güncelleme/silme → aktif owner/admin.
-- private.arvo_is_org_admin ArvoOS migration'ı 20260918171628 ile geldi
-- (ortak veritabanı; o migration önce uygulanmış olmalı).
-- ============================================================

drop policy if exists arc_suppliers_member_all on public.arc_suppliers;

create policy arc_suppliers_members_read on public.arc_suppliers
  for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_suppliers.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

create policy arc_suppliers_admins_insert on public.arc_suppliers
  for insert to authenticated
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_update on public.arc_suppliers
  for update to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

create policy arc_suppliers_admins_delete on public.arc_suppliers
  for delete to authenticated
  using (private.arvo_is_org_admin(organization_id));

-- Geri almak için:
-- drop policy arc_suppliers_members_read on public.arc_suppliers;
-- drop policy arc_suppliers_admins_insert on public.arc_suppliers;
-- drop policy arc_suppliers_admins_update on public.arc_suppliers;
-- drop policy arc_suppliers_admins_delete on public.arc_suppliers;
-- create policy arc_suppliers_member_all on public.arc_suppliers as permissive for all to authenticated
--   using (exists (select 1 from organization_memberships m where m.organization_id = arc_suppliers.organization_id and m.user_id = auth.uid()))
--   with check (exists (select 1 from organization_memberships m where m.organization_id = arc_suppliers.organization_id and m.user_id = auth.uid() and m.role = any (array['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role])));
