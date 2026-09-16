-- Havale indirimi mağaza ayarı olsun.
--
-- Havale indirimi ödeme ucunda sabit %3 yazıyordu ve bütün mağazalar için
-- geçerliydi. Kargo ücreti, ücretsiz kargo eşiği ve sipariş no öneki çok
-- mağazalı geçişte arc_store_settings'e taşındı; havale indirimi atlanmıştı.
-- Her yeni mağaza, haberi olmadan her havale siparişinde %3 veriyordu.
--
-- Varsayılan 3: ArvoCulture'ın bugünkü davranışı değişmiyor.

alter table public.arc_store_settings
  add column if not exists bank_transfer_discount_percent numeric not null default 3;

alter table public.arc_store_settings drop constraint if exists arc_store_settings_transfer_discount_check;
alter table public.arc_store_settings add constraint arc_store_settings_transfer_discount_check
  check (bank_transfer_discount_percent >= 0 and bank_transfer_discount_percent <= 100);

comment on column public.arc_store_settings.bank_transfer_discount_percent is
  'Havale/EFT ile ödeyene uygulanan indirim yüzdesi. 0 = indirim yok.';
