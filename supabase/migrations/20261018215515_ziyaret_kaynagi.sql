/*
  ZİYARET KAYNAĞI (19.10.2026)

  "Google'dan mı Instagram'dan mı geliyor" sorusunun yanıtı
  yoktu: ziyaret kaydı nereden gelindiğini hiç tutmuyordu.

  HAM YÖNLENDİREN DEĞİL, KONAK. Tam adres (`referrer`) saklamak
  gereksiz veri demek: arama terimi, kampanya kimliği, bazen
  oturum anahtarı o adreste duruyor. Saklanan şey yalnızca
  kaynağın adı — "google", "instagram", "utm_source" ne
  diyorsa o.

  BOŞ = DOĞRUDAN. Adres çubuğuna yazarak, yer iminden ya da
  uygulama içinden gelen ziyaretin kaynağı yok; uydurma bir
  etiket ("bilinmeyen") koymak onu bir platform gibi gösterirdi.

  İMZA DEĞİŞTİĞİ İÇİN ÖNCE DROP: aynı adın iki sürümü yan yana
  dururken vitrin hangisini çağırdığını bilmeden kaynağı
  yazmayabilirdi.
*/

alter table public.arc_visits
  add column if not exists source text;

create index if not exists arc_visits_kaynak
  on public.arc_visits (organization_id, source, created_at desc)
  where source is not null;

drop function if exists public.arc_storefront_visit(
  text, text, text, text, text, double precision, double precision, text);

create or replace function public.arc_storefront_visit(
  p_host text,
  p_path text,
  p_product_slug text default null,
  p_country text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_ip text default null,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_hash text;
  v_son integer;
begin
  v_org := public.arc_storefront_org(p_host);
  if v_org is null then return; end if;
  if p_path is null or length(p_path) = 0 then return; end if;

  /*
    GÜNLÜK TUZ. Karma yalnızca "aynı ziyaretçi bir dakikada kaç
    kez yazdı" sorusuna yarıyor; tuza günün tarihi karıştığı için
    kayıtlar günler arasında birbirine bağlanamıyor.
  */
  if p_ip is not null and length(p_ip) > 0 then
    /*
      md5, pgcrypto'nun digest'i DEĞİL: bu bir güvenlik sınırı
      değil, dakikalık bir kova anahtarı. pgcrypto'ya bağlanmak
      kurulumu olmayan bir projede fonksiyonu çalışmaz yapardı ve
      ziyaret kaydı sessizce düşerdi.
    */
    v_hash := md5(
      p_ip || to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD')
    );

    /*
      HIZ SINIRI. Dakikada otuz sayfadan fazlası bot sayılıyor ve
      yazılmıyor; sınır yoksa tek bir tarayıcı haritayı ve ürün
      sayımını tek başına belirleyebilir.
    */
    select count(*) into v_son
    from public.arc_visits
    where organization_id = v_org
      and ip_hash = v_hash
      and created_at > now() - interval '1 minute';

    if v_son >= 30 then return; end if;
  end if;

  insert into public.arc_visits
    (organization_id, path, product_slug, country, city, lat, lon, ip_hash, source)
  values (
    v_org,
    left(p_path, 300),
    nullif(left(coalesce(p_product_slug, ''), 200), ''),
    nullif(left(coalesce(p_country, ''), 8), ''),
    nullif(left(coalesce(p_city, ''), 120), ''),
    p_lat,
    p_lon,
    v_hash,
    /* Küçük harfe indiriliyor: "Instagram" ve "instagram" tek
       satır olsun, listede iki kez görünmesin. */
    nullif(lower(left(coalesce(p_source, ''), 80)), '')
  );

  /*
    TEMİZLİK YAZIMIN İÇİNDE. Ayrı bir zamanlayıcı işi,
    unutulduğunda sessizce büyüyen bir tablo demek. Yüz yazımdan
    birinde koşuyor.
  */
  if random() < 0.01 then
    delete from public.arc_visits
    where created_at < now() - interval '30 days';
  end if;
end;
$function$;

revoke all on function public.arc_storefront_visit(
  text, text, text, text, text, double precision, double precision, text, text)
  from public, anon, authenticated;
/*
  VİTRİN KENDİ SUNUCUSUNDAN ÇAĞIRIYOR ve elindeki anahtar anon.
  Yazdığı şey bir sayaç: en kötü ihtimalle gürültü üretir,
  okunabilir bir veri sızdırmaz. Hız sınırı fonksiyonun içinde.
*/
grant execute on function public.arc_storefront_visit(
  text, text, text, text, text, double precision, double precision, text, text)
  to anon, authenticated, service_role;
