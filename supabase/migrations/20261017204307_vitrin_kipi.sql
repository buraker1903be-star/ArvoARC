-- vitrin_kipi
--
-- VİTRİN BİZDE Mİ, MÜŞTERİDE Mİ?
--
-- Bugüne kadar tek bir varsayım vardı: vitrini biz barındırıyoruz.
-- Mağaza alan adını panele yazınca kod onu bizim Vercel projemize
-- ekliyor ve DNS'in bize yönelmesini bekliyordu.
--
-- İkinci bir müşteri tipi çıktı: SİTESİNİ KENDİ YAPAN mağaza.
-- Panelden yalnızca ürünlerini ve siparişlerini yönetiyor, vitrini
-- kendi sunucusunda. Onun alan adını bizim Vercel projemize eklemek
-- yanlış: DNS zaten başka yere yöneliyor, kayıt sonsuza kadar "DNS
-- bekleniyor"da kalıyor ve kullanıcı var olmayan bir sorunu çözmeye
-- çalışıyor.
--
-- Oysa alan adının KAYITLI OLMASI yine gerekiyor: mağazayı Origin
-- başlığından çözen her şey (ödeme ucu, kupon ucu, vitrin veri
-- API'si) ve CORS izni ona bakıyor. Yani kayıt aynı, YAPILAN İŞ
-- farklı.
--
-- 'hosted'   — vitrin bizde. Alan adı Vercel'e eklenir, DNS bize
--              yönelir, platform alt alan adı da çalışır.
-- 'external' — vitrin müşteride. Alan adı yalnızca tanıma ve CORS
--              için kaydedilir; Vercel'e dokunulmaz.
--
-- VARSAYILAN 'hosted': bugünkü bütün mağazalar öyle ve sessiz bir
-- davranış değişikliği olmasın.

alter table public.arc_store_settings
  add column if not exists storefront_mode text not null default 'hosted';

alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_storefront_mode_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_storefront_mode_check
  check (storefront_mode in ('hosted', 'external'));

/*
  Dış vitrinde alan adı doğrulaması BİZİM işimiz değil: DNS
  müşterinin sunucusuna yöneliyor ve biz onu doğrulayamayız.
  Kayıt "aktif" sayılıyor, çünkü kaydın amacı tanıma ve CORS —
  ikisi de alan adı yazıldığı an çalışıyor.

  Mevcut satırlara dokunulmuyor: hepsi 'hosted' ve doğrulama
  akışları aynen sürüyor.
*/

comment on column public.arc_store_settings.storefront_mode is
  'hosted: vitrin bizim Vercel projemizde. external: müşterinin kendi sitesi; alan adı yalnızca tanıma ve CORS için kayıtlı.';

do $$
declare
  v_sayi integer;
begin
  select count(*) into v_sayi from public.arc_store_settings where storefront_mode not in ('hosted', 'external');
  if v_sayi > 0 then
    raise exception 'Beklenmeyen vitrin kipi olan % satır var.', v_sayi;
  end if;

  select count(*) into v_sayi from public.arc_store_settings;
  raise notice 'Vitrin kipi eklendi; % mağazanın hepsi hosted.', v_sayi;
end;
$$;
