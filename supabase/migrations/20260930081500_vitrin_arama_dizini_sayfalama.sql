/*
  VİTRİN ARAMA DİZİNİ VE SİTEMAP'İ SAYFALANABİLİR OLDU.

  Neden: PostgREST bu RPC uçlarında db-max-rows (1000) sınırını uyguluyor,
  `Range` başlığını ise dikkate almıyor. Fonksiyona `p_limit => 20000`
  denmesine rağmen vitrine her zaman yalnızca ilk 1000 ürün geliyordu;
  "dudak kalemi" gibi dizinin sonunda kalan ürünler aramada hiç çıkmıyordu.
  29.09.2026'da Range başlığıyla sayfalama denendi: PostgREST başlığı yok
  sayınca her istek aynı ilk 1000 satırı döndürdü ve dizin 49.800 satırlık
  50 kat tekrarlı bir listeye dönüştü (vitrinde geri alındı). Sayfalama bu
  yüzden başlıkla değil, fonksiyonun kendi parametresiyle yapılıyor.

  Eski imza (p_limit integer) DÜŞÜRÜLÜYOR: yalnızca CREATE OR REPLACE ile
  ikinci bir aşırı yükleme oluşur ve `p_limit` adlı tek argümanla yapılan
  çağrı iki adaya birden uyup "function is not unique" hatası verirdi.
  DROP yetkileri de götürdüğü için grant satırları yeniden yazılıyor.

  Sıralamaya p.slug eklendi: offset'li sayfalama yalnızca sıralama kesin
  (deterministik) olduğunda doğru çalışır. Aynı `updated_at` değerine sahip
  ürünler sayfalar arasında yer değiştirip bir sayfada tekrarlanır,
  diğerinde tamamen atlanabilirdi.
*/

drop function if exists public.get_arvoculture_storefront_search_index(integer);

create function public.get_arvoculture_storefront_search_index(
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(
  slug text,
  name text,
  vendor text,
  product_type text,
  price bigint,
  compare_at_price bigint,
  image_path text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p.slug,
    p.name,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    /*
      Yalnızca ilk görsel. Arama sonucu tek küçük resim gösteriyor
      ama katalog fonksiyonu her ürünün tüm galerisini taşıyordu —
      3.400 ürün için tek başına 1,7 MB.
    */
    (p.metadata -> 'image_paths' ->> 0) as image_path
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.metadata, p.updated_at
  /*
    Stokta olmayan ürün aramada zaten gösterilmiyordu; süzme
    uygulama tarafında yapılıyordu. Veritabanında yapmak hem
    satır sayısını hem taşınan veriyi düşürüyor.
  */
  having bool_or(
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

/*
  Yetkiler eski hâliyle korunuyor. `authenticated` BİLEREK listede:
  ArvoCulture'da müşteri hesabı var ve giriş yapan müşterinin istekleri
  anon değil authenticated rolüyle gidiyor — bu rol kaldırılsaydı arama
  yalnızca oturum açmış müşteride çalışmaz olurdu.
*/
revoke all on function public.get_arvoculture_storefront_search_index(integer, integer) from public;
grant execute on function public.get_arvoculture_storefront_search_index(integer, integer) to anon;
grant execute on function public.get_arvoculture_storefront_search_index(integer, integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_search_index(integer, integer) to service_role;

drop function if exists public.get_arvoculture_storefront_product_slugs(integer);

create function public.get_arvoculture_storefront_product_slugs(
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(slug text, updated_at timestamp with time zone)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
    /*
      Varyantı olmayan ürünün sayfası da yok; sitemap'e girmemeli.
      Ama varyantları toplamaya gerek yok — varlık kontrolü yeter.
      Asıl fonksiyon burada group by yapıp fiyat ve beden
      hesaplıyor, sitemap ise hiçbirini kullanmıyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
    )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

/*
  Eski hâlinde `public` rolüne de execute verilmişti (revoke alışkanlığı
  yerleşmeden önce yazılmıştı). Sitemap'i yalnızca vitrinin sunucusu
  çağırıyor; adlandırılmış roller açık kalıyor, PUBLIC kapanıyor.
*/
revoke all on function public.get_arvoculture_storefront_product_slugs(integer, integer) from public;
grant execute on function public.get_arvoculture_storefront_product_slugs(integer, integer) to anon;
grant execute on function public.get_arvoculture_storefront_product_slugs(integer, integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_product_slugs(integer, integer) to service_role;
