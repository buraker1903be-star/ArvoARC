/*
  CANLI ZİYARET KAYDI (19.10.2026)

  "Siteye dünyanın neresinden tıklanıyor" ve "en çok hangi ürün
  tıklanıyor" sorularının hiçbir yerde yanıtı yoktu.

  KİŞİSEL VERİ TUTULMUYOR. IP saklanmıyor; yalnızca hız sınırı
  için GÜNLÜK DEĞİŞEN bir tuzla karması tutuluyor, yani aynı
  ziyaretçi ertesi gün başka bir karma üretiyor ve kayıtlar
  birbirine bağlanamıyor. Konum tarayıcıdan İZİN İSTENEREK
  alınmıyor; Vercel'in kenar başlıklarından geliyor (ülke, şehir,
  yaklaşık koordinat) ve şehir düzeyinde kaba.

  KAYITLAR KALICI DEĞİL. Otuz günden eski satırlar siliniyor;
  temizlik ayrı bir zamanlayıcıya bağlanmadı çünkü yeni bir cron
  işi, unutulduğunda sessizce büyüyen bir tablo demek. Her yüz
  yazımdan birinde temizlik kendiliğinden koşuyor.
*/

create table if not exists public.arc_visits (
  id bigserial primary key,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  /* Hangi sayfa; ürün sayfasıysa slug ayrıca yazılıyor ki
     "en çok tıklanan ürün" sorgusu metin ayrıştırmasın. */
  path text not null,
  product_slug text,
  country text,
  city text,
  /* Yaklaşık koordinat: harita noktası için. Şehir merkezinden
     geliyor, kişiye değil. */
  lat double precision,
  lon double precision,
  /* Günlük tuzlu karma — kimliklendirme değil, hız sınırı. */
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists arc_visits_kurum_zaman
  on public.arc_visits (organization_id, created_at desc);
create index if not exists arc_visits_urun
  on public.arc_visits (organization_id, product_slug, created_at desc)
  where product_slug is not null;

/*
  RLS AÇIK, POLİTİKA YOK: tabloya doğrudan gelen hiç kimse bir
  şey görmemeli. Yazma aşağıdaki SECURITY DEFINER fonksiyondan,
  okuma panelde servis anahtarıyla.
*/
alter table public.arc_visits enable row level security;

/* --------------------------------------------------------------
   ZİYARET YAZMA
   -------------------------------------------------------------- */

create or replace function public.arc_storefront_visit(
  p_host text,
  p_path text,
  p_product_slug text default null,
  p_country text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_ip text default null
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
    (organization_id, path, product_slug, country, city, lat, lon, ip_hash)
  values (
    v_org,
    left(p_path, 300),
    nullif(left(coalesce(p_product_slug, ''), 200), ''),
    nullif(left(coalesce(p_country, ''), 8), ''),
    nullif(left(coalesce(p_city, ''), 120), ''),
    p_lat,
    p_lon,
    v_hash
  );

  /*
    TEMİZLİK YAZIMIN İÇİNDE. Ayrı bir zamanlayıcı işi,
    unutulduğunda sessizce büyüyen bir tablo demek. Yüz yazımdan
    birinde koşuyor: yük dağılıyor, tablo kendi kendini
    sınırlıyor.
  */
  if random() < 0.01 then
    delete from public.arc_visits
    where created_at < now() - interval '30 days';
  end if;
end;
$function$;

revoke all on function public.arc_storefront_visit(
  text, text, text, text, text, double precision, double precision, text)
  from public, anon, authenticated;
/*
  VİTRİN KENDİ SUNUCUSUNDAN ÇAĞIRIYOR ve elindeki anahtar anon.
  Yazdığı şey bir sayaç: en kötü ihtimalle gürültü üretir,
  okunabilir bir veri sızdırmaz. Hız sınırı fonksiyonun içinde.
*/
grant execute on function public.arc_storefront_visit(
  text, text, text, text, text, double precision, double precision, text)
  to anon, authenticated, service_role;
