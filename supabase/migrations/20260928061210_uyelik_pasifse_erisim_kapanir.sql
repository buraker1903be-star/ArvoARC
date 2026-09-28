-- ÜYELİĞİ PASİFE ALINAN KİŞİ ERİŞİMİNİ KAYBEDER.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- ArvoARC'ın 57 politikasından 42'si organization_memberships'e bakıyor ve
-- 38'i "m.is_active" denetliyor: işten ayrılan kişinin üyeliği pasife
-- alınınca erişimi kapanıyor. private.arvo_is_org_admin de aynısını yapıyor,
-- yani bu evin kuralı.
--
-- Denetlemeyen DÖRT politika var ve dördü de 26–27.09.2026'da eklendi:
--
--   arc_shipments          arc_shipments_member_all
--   arc_shipment_items     arc_shipment_items_member_all
--   arc_price_collections  arc_price_collections_member_read
--   arc_price_collections  arc_price_collections_member_update
--
-- Sonuç: ayrılmış bir çalışan gönderileri ve fiyat toplama kayıtlarını
-- OKUYUP YAZMAYA devam ediyor. Gönderi tablosu takip numarası ve müşteri
-- adresi taşıyor; fiyat toplama tedarikçi alış fiyatlarını taşıyor.
-- Üyeliği kapatmak, erişimi kapattığını sanmakla aynı şey değil.
--
-- Politikalar DÜŞÜRÜLÜP yeniden kuruluyor: Postgres "create policy if not
-- exists" kabul etmiyor ve alter policy ifadeyi değiştirmek için yeterli
-- ama dört ayrı ifade yazmak yerine tek kalıpla yeniden kurmak, sonraki
-- okuyanın dördünü yan yana görmesini sağlıyor.

-- ---------- Gönderiler ----------

drop policy if exists arc_shipments_member_all on public.arc_shipments;
create policy arc_shipments_member_all on public.arc_shipments
  as permissive for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

drop policy if exists arc_shipment_items_member_all on public.arc_shipment_items;
create policy arc_shipment_items_member_all on public.arc_shipment_items
  as permissive for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipment_items.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_shipment_items.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

-- ---------- Fiyat toplama ----------

drop policy if exists arc_price_collections_member_read on public.arc_price_collections;
create policy arc_price_collections_member_read on public.arc_price_collections
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

drop policy if exists arc_price_collections_member_update on public.arc_price_collections;
create policy arc_price_collections_member_update on public.arc_price_collections
  as permissive for update to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_price_collections.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));
