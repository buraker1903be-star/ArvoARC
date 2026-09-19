-- ============================================================
-- ARC veritabanı (obaskcdxaaezjglayash): kullanıcı kendi üyeliğini okuyabilir
--
-- ARC tablolarının politikaları üyeliği doğrudan sorguluyor:
--   exists (select 1 from organization_memberships m
--           where m.organization_id = … and m.user_id = auth.uid() …)
-- Bu alt sorgu çağıranın yetkisiyle çalışır. Ayrılmada paylaşılan tablolar
-- ArvoOS'un politikaları olmadan, RLS açık ve politikasız kuruldu
-- (scripts/ayrilma/arc-kurulum-uret.sql). Sonuç: oturum açmış personel kendi
-- üyelik satırını göremiyor, bütün arc_ tabloları ona boş dönüyordu
-- (19.09.2026 geçişi: panel 0 sipariş, 0 ürün; veritabanında 36 / 3.442).
--
-- Kural: yalnızca KENDİ satırları, yalnızca okuma. Yazmayı ArvoOS köprüsü
-- servis anahtarıyla yapar. Eski ortak veritabanında da üye kendi
-- üyeliğini okuyabiliyordu.
-- ============================================================

drop policy if exists arc_members_read_own_membership on public.organization_memberships;
create policy arc_members_read_own_membership on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Geri almak için:
-- drop policy if exists arc_members_read_own_membership on public.organization_memberships;
