-- VİTRİN, KARTLA ÖDEMENİN AÇIK OLUP OLMADIĞINI BİLMİYOR
--
-- arc_storefront_settings havale için bank_transfer_enabled döndürüyor,
-- yani vitrin havaleyi gizleyebiliyor. KART İÇİN KARŞILIĞI YOK: PayTR
-- bilgisi girilmemiş bir mağazanın vitrininde de "Kartla öde" duruyor,
-- müşteri bütün formu dolduruyor ve ancak en sonda 503 ile
-- "Kartla ödeme şu an kullanılamıyor" görüyor.
--
-- Yeni bir salonun varsayılan hâli tam olarak bu: havale kapalı ve
-- paytr_enabled de false (ikisinin de sütun varsayılanı). Kiracı, kartı
-- gizlemenin bir yolu olmadığı için müşterilerini o duvara çarptırıyor.
--
-- AYRI FONKSİYON, arc_storefront_settings'e SÜTUN EKLEMİYORUZ. Dönüş
-- tipini değiştirmek DROP gerektiriyor; DROP hem yetkileri düşürüyor hem
-- de o fonksiyonu kuran migration'ı (20260929062348) bir daha
-- çalıştırılamaz hâle getiriyor — tests/db/vitrin-kiraci.test.mjs bunu
-- yakaladı. Ekleyerek gitmek bu oturumda üçüncü kez daha ucuz çıktı.
--
-- ÖLÇÜT SUNUCUNUNKİYLE BİREBİR. lib/paytr/config.ts kartı ancak
-- merchant_id, şifreli anahtar ve şifreli salt varken kullanıyor.
-- Ayrışırsa vitrin "açık" der, sunucu reddeder — kapatmaya çalıştığımız
-- duvarın aynısı.
--
-- SIR SIZMIYOR: yalnızca boolean dönüyor, anahtarların kendisi değil.
-- Anahtarların VARLIĞI da bilgi sayılır mı: sayılmaz — müşteri zaten
-- ödeme adımında hangi yöntemlerin sunulduğunu görüyor.

create or replace function public.arc_storefront_payment_methods(p_host text)
 returns table(
   bank_transfer_enabled boolean,
   bank_transfer_discount_percent numeric,
   card_enabled boolean
 )
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    coalesce(s.bank_transfer_enabled, false),
    coalesce(s.bank_transfer_discount_percent, 3),
    coalesce(s.paytr_enabled, false)
      and s.paytr_merchant_id is not null
      and s.paytr_merchant_key_enc is not null
      and s.paytr_merchant_salt_enc is not null
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.id = public.arc_storefront_org(p_host)
  limit 1;
$function$;

comment on function public.arc_storefront_payment_methods(text) is
  'Vitrinin gösterebileceği ödeme yöntemleri. card_enabled yalnızca boolean; PayTR anahtarları dönmez. Ölçüt lib/paytr/config.ts ile aynı olmalı.';

-- Postgres yeni fonksiyonu PUBLIC'e açık oluşturuyor; önce kapatılıyor.
revoke all on function public.arc_storefront_payment_methods(text) from public, anon, authenticated, service_role;
grant execute on function public.arc_storefront_payment_methods(text) to anon;
grant execute on function public.arc_storefront_payment_methods(text) to authenticated;
grant execute on function public.arc_storefront_payment_methods(text) to service_role;

-- Geri almak için:
-- drop function if exists public.arc_storefront_payment_methods(text);
