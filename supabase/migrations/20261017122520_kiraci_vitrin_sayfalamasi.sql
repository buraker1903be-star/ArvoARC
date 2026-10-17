-- kiraci_vitrin_sayfalamasi
--
-- KİRACI VİTRİNİ DE SAYFALANIYOR: arc_storefront_product_slugs ve
-- arc_storefront_search_index.
--
-- Bu iki fonksiyonun ArvoCulture'a özel ikizleri 29–30.09.2026'da
-- düzeltilmişti; çok kiracılı olanlar düzeltmenin dışında kaldı.
--
-- Hata şuydu: fonksiyon `limit 20000` diyor ama PostgREST tek
-- istekte en çok 1000 satır döndürüyor. Sonuç SESSİZ bir kesilme —
-- hata yok, eksik veri var. Arama dizini "en son dokunulan 1000
-- ürün"e dönüşüyordu (tedarikçi içe aktarımı on dakikada bir
-- binlerce varyantı güncelliyor), müşteri satın alabildiği ürünü
-- arayıp bulamıyordu. Sitemap de 1000 üründe kesiliyordu.
--
-- İlk onarım `Range` başlığıyla denendi: PostgREST bu RPC uçlarında
-- başlığı YOK SAYIYOR, her sayfa aynı ilk 1000 satırı döndürdü ve
-- dizin canlıda 50 kat tekrarlanmış 49.800 satıra çıktı. O yüzden
-- sayfalama PARAMETREYLE: `p_offset`. Vitrindeki rpcTumSayfalar da
-- bunu şart koşuyor (ArvoCulture-site lib/arc.ts): p_offset almayan
-- bir fonksiyonu sayfalamaya kalkarsa sessizce yinelenmiş liste
-- üretir.
--
-- Bugün bu iki fonksiyonu çağıran kod yok (ArvoCulture kendi
-- ikizlerini kullanıyor), yani ikinci kiracı açılırken aynı hatayı
-- yeniden yaşamak için kurulmuş bir tuzaktı. Gövdeler ikizlerinden
-- birebir alındı; değişen yalnızca kiracı çözümü
-- (o.slug = 'arvoculture' → arc_storefront_org(p_host)).
--
-- Parametre eklendiği için CREATE OR REPLACE yetmez: aşırı yükleme
-- oluşur ve eski imza da çağrılabilir kalırdı. Önce düşürülüyor.
-- Çağıranı olmadığı için düşürmek güvenli.

drop function if exists public.arc_storefront_product_slugs(p_host text, p_limit integer);
drop function if exists public.arc_storefront_search_index(p_host text, p_limit integer);

CREATE OR REPLACE FUNCTION public.arc_storefront_product_slugs(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
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
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_search_index(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
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
$function$
;
revoke all on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) from public;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to anon;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to authenticated;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to service_role;

revoke all on function public.arc_storefront_search_index(p_host text, p_limit integer, p_offset integer) from public;
grant execute on function public.arc_storefront_search_index(p_host text, p_limit integer, p_offset integer) to anon;
grant execute on function public.arc_storefront_search_index(p_host text, p_limit integer, p_offset integer) to authenticated;
grant execute on function public.arc_storefront_search_index(p_host text, p_limit integer, p_offset integer) to service_role;
