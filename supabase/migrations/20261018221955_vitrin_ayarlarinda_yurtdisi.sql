/*
  VİTRİN AYARLARINA YURTDIŞI ALANLARI (19.10.2026)

  Vitrin dolar fiyatını gösterebilmek için kuru ve kâr payını
  bilmek zorunda. Bunlar `arc_store_settings`'te duruyordu ama
  vitrinin okuduğu ayar fonksiyonu yalnızca kargo ve havale
  alanlarını döndürüyordu.

  FİYAT HESABI VİTRİNDE, KUR SUNUCUDAN. Dolar fiyatını burada
  hesaplayıp döndürmek daha güvenli görünüyor ama her ürün için
  ayrı bir alan demek; üstelik sepet toplamı, kargo ve kupon da
  dolar olacak ve onların hepsi zaten vitrinde hesaplanıyor.
  Kuralı tek yerde tutmanın yolu ham kuru vermek: hesap
  `lib/dolar-fiyati` içinde ve testi var.

  MOD KAPALIYSA KUR DA GÖNDERİLMİYOR. Kapalı bir mağazanın kurunu
  vitrine vermek, oranın bir gün yanlışlıkla fiyat göstermesine
  açık kapı bırakırdı: kapalı mod demek "dolar yok" demek.

  DÖNÜŞ TİPİ DEĞİŞTİĞİ İÇİN ÜÇÜ DE AÇIKÇA DÜŞÜYOR.

  Önce yalnızca çekirdek `cascade` ile düşürülmüştü ve sarmalayıcılar
  AYAKTA KALDI: Postgres, bir SQL fonksiyonunun gövdesinde çağırdığı
  başka bir fonksiyon için bağımlılık kaydı tutmuyor. Sonuç canlıda
  görüldü — "cannot change return type of existing function".
*/

drop function if exists public.arc_storefront_settings(text);
drop function if exists public.get_arvoculture_storefront_settings();
drop function if exists public.arc_vitrin_ayarlar(uuid);

create or replace function public.arc_vitrin_ayarlar(p_organization_id uuid)
returns table (
  shipping_fee bigint,
  free_shipping_threshold bigint,
  bank_transfer_enabled boolean,
  bank_transfer_discount_percent numeric,
  international_enabled boolean,
  usd_rate numeric,
  usd_margin_percent numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3),
    coalesce(s.international_enabled, false),
    /* Mod kapalıysa kur da yok: kapalı mod "dolar yok" demek. */
    case when coalesce(s.international_enabled, false) then s.usd_rate end,
    case when coalesce(s.international_enabled, false)
         then coalesce(s.usd_margin_percent, 0) end
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.id = p_organization_id
  limit 1;
$function$;

revoke all on function public.arc_vitrin_ayarlar(uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_ayarlar(uuid) to service_role;

/* Sarmalayıcılar yukarıda düşürüldü; aynı gövdeyle geri geliyorlar. */

create or replace function public.arc_storefront_settings(p_host text)
returns table (
  shipping_fee bigint,
  free_shipping_threshold bigint,
  bank_transfer_enabled boolean,
  bank_transfer_discount_percent numeric,
  international_enabled boolean,
  usd_rate numeric,
  usd_margin_percent numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_ayarlar(public.arc_storefront_org(p_host));
$function$;

revoke all on function public.arc_storefront_settings(text) from public;
grant execute on function public.arc_storefront_settings(text) to anon, authenticated, service_role;

create or replace function public.get_arvoculture_storefront_settings()
returns table (
  shipping_fee bigint,
  free_shipping_threshold bigint,
  bank_transfer_enabled boolean,
  bank_transfer_discount_percent numeric,
  international_enabled boolean,
  usd_rate numeric,
  usd_margin_percent numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_ayarlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$;

revoke all on function public.get_arvoculture_storefront_settings() from public;
grant execute on function public.get_arvoculture_storefront_settings() to anon, authenticated, service_role;
