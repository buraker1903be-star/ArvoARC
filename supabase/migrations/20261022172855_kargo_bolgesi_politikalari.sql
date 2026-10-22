/*
  KARGO BÖLGELERİNE RLS POLİTİKASI (22.10.2026)

  `arc_shipping_zones` 20261018220531'de RLS AÇIK ve POLİTİKASIZ
  kuruldu. O migration'ın yorumu "okuma vitrin fonksiyonundan
  (SECURITY DEFINER), yazma panelde servis anahtarıyla" diyordu ve
  ikinci yarısı YANLIŞTI: panel servis anahtarı kullanmıyor,
  oturum istemcisiyle çalışıyor (`lib/tenant.ts` → `createClient()`,
  yani anon anahtarı + kullanıcının JWT'si, rol `authenticated`).

  Sonuç canlıda görüldü: Ayarlar → Yurtdışı satış bölgeleri ne
  okuyabiliyor ne yazabiliyordu. Okuma politikasız bir tabloda
  SESSİZCE boş dönüyor — operatör "Henüz bölge tanımlanmadı"
  görüyor, hiçbir yerde hata yok. Bu tam olarak 17.10.2026'daki
  `organization_modules` olayının kalıbı (manuel sipariş, elle stok
  hareketi ve iade sonrası stok geri ekleme ölüydü, sebebi hiçbir
  ekranda görünmüyordu) ve `npm run check:rls` o olaydan sonra bunu
  yakalamak için yazıldı. Denetim bu tabloyu üç gün göremedi çünkü
  canlı şema DÖKÜMÜ bayattı — döküm yenilenince ilk iş olarak
  bunu bildirdi.

  POLİTİKALAR arc_email_templates KALIBININ AYNISI: üye okur,
  yönetici yazar. Bölge tarifesi para belirliyor (yurtdışı kargosu),
  yani yazma yetkisi satış ayarlarıyla aynı kademede olmalı; okuma
  ise bütün üyelere açık, çünkü ayar ekranını gören herkes tarifeyi
  de görmeli.

  VİTRİN ETKİLENMİYOR: o, politikalardan bağımsız olarak
  `arc_vitrin_kargo_bolgeleri` (SECURITY DEFINER) üzerinden okuyor.
  Bu migration yalnızca PANELİ açıyor.
*/

drop policy if exists arc_members_read_shipping_zones on public.arc_shipping_zones;
drop policy if exists arc_managers_write_shipping_zones on public.arc_shipping_zones;

create policy arc_members_read_shipping_zones
  on public.arc_shipping_zones
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = arc_shipping_zones.organization_id
        and m.user_id = auth.uid()
        and m.is_active
    )
  );

create policy arc_managers_write_shipping_zones
  on public.arc_shipping_zones
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = arc_shipping_zones.organization_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.role = any (array['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role])
    )
  )
  with check (
    exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = arc_shipping_zones.organization_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.role = any (array['owner'::membership_role, 'admin'::membership_role, 'manager'::membership_role])
    )
  );
