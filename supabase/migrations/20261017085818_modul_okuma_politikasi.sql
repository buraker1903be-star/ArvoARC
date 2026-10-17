-- MAĞAZA ÜYESİ KENDİ MODÜL SATIRINI OKUYABİLİR (17.10.2026).
--
-- CANLIDA ÖLÇÜLDÜ: panelden manuel sipariş oluşturulamıyordu
-- ("Satış modülü kapalı; manuel sipariş oluşturulamaz.") ve stok
-- giriş/çıkış da kaydedilmiyordu ("Stok hareketi kaydedilemedi").
-- Oysa modül AÇIK: arc_resolve_commerce_tenant commerce_enabled=true
-- döndürüyor, panel zaten o yüzden açılıyor (kapalıysa giriş ekranına
-- atıyor).
--
-- Sebep GÖRÜNÜRLÜK: organization_modules üzerinde RLS açık ve HİÇ
-- politika yok, yani authenticated rolü tabloyu boş görüyor.
-- Kiracı fonksiyonu SECURITY DEFINER olduğu için satırı görüyor;
-- arc_create_order ve arc_adjust_inventory ise ÇAĞIRANIN yetkisiyle
-- çalışıyor (bilerek: stok ve sipariş yazarken RLS'in arkasına
-- saklanmasınlar) ve ikisi de "modül açık mı" diye bu tabloya
-- bakıyor. Satırı göremeyince kural "modül kapalı" diyor.
--
-- Etkilenen üç akış: manuel sipariş, elle stok hareketi ve iade
-- tamamlanınca stoğun geri eklenmesi (sonuncusu sessizdi: hata
-- yalnızca sunucu günlüğüne yazılıyordu). Vitrin siparişleri
-- etkilenmedi, o fonksiyon SECURITY DEFINER.
--
-- Çözüm en dar olanı: ÜYE kendi mağazasının modül satırını OKUR.
-- Yazma yine ArvoOS köprüsünündür (AGENTS.md) — insert/update/delete
-- politikası eklenmiyor, service_role zaten RLS'in dışında.
-- Kalıp organization_memberships'teki politikayla aynı
-- (arc_members_read_own_membership) ve bu proje ArvoARC'ın kendi
-- projesi; ArvoOS'un kopyasındaki politikalara dokunmuyor.

drop policy if exists arc_members_read_own_modules on public.organization_modules;

create policy arc_members_read_own_modules on public.organization_modules
  as permissive for select to authenticated
  using (exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = organization_modules.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));
