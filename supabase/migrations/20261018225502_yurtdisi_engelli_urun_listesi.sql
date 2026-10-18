/*
  YURTDIŞINA GÖNDERİLEMEYEN ÜRÜNLERİN LİSTESİ (19.10.2026)

  Sipariş fonksiyonu bu ürünleri yurtdışı adresinde zaten reddediyor
  (20261018220926). Ama müşteri bunu ancak ADRESİNİ YAZDIKTAN SONRA
  öğreniyor: sepeti dolduruyor, ödeme adımına geliyor ve "bu ürün
  yurtdışına gönderilemiyor" cümlesiyle karşılaşıyor. Vitrinin o ürünü
  yurtdışı modunda hiç göstermemesi gerekiyor.

  NEDEN AYRI BİR FONKSİYON, LİSTELERE SÜTUN EKLEMEK YERİNE:
  işaretin kendisi `arc_products.international_blocked` ve ürün
  listeleri on dört fonksiyon (artı ikizleri). On dördüne birer sütun
  eklemek, on dört gövdeyi elle yeniden yazmak demekti; kopyalama
  hatası riski, kazanılan şeyden büyük. Ürün sayısı da küçük: bugün
  132 ürün, yani birkaç kilobaytlık bir slug listesi.

  SÜZGEÇ VİTRİNDE, KURAL BURADA. Vitrin bu listeyle yurtdışı modunda
  o kartları gizliyor; gizleme KOLAYLIK, siparişi reddeden satır ise
  KURAL. Süzgeç bir gün atlarsa sipariş yine geçmiyor.
*/

drop function if exists public.arc_vitrin_engelli_urunler(uuid);

create or replace function public.arc_vitrin_engelli_urunler(p_organization_id uuid)
returns table (slug text)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.slug
  from public.arc_products p
  where p.organization_id = p_organization_id
    and p.status = 'active'
    and p.international_blocked
  order by p.slug;
$function$;

revoke all on function public.arc_vitrin_engelli_urunler(uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_engelli_urunler(uuid) to service_role;

drop function if exists public.arc_storefront_blocked_products(text);

create or replace function public.arc_storefront_blocked_products(p_host text)
returns table (slug text)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_engelli_urunler(public.arc_storefront_org(p_host));
$function$;

revoke all on function public.arc_storefront_blocked_products(text) from public;
grant execute on function public.arc_storefront_blocked_products(text) to anon, authenticated, service_role;

drop function if exists public.get_arvoculture_storefront_blocked_products();

create or replace function public.get_arvoculture_storefront_blocked_products()
returns table (slug text)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_engelli_urunler(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$;

revoke all on function public.get_arvoculture_storefront_blocked_products() from public;
grant execute on function public.get_arvoculture_storefront_blocked_products() to anon, authenticated, service_role;
