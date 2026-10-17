-- sitemap_satilabilir_urun
--
-- SITEMAP, "indeksle" dediği adresle AYNI ŞEYİ söylemeli.
--
-- Ürün sayfası stok yokken arama motoruna `noindex` veriyor (vitrin:
-- robots.index = product.available !== false). Sitemap ise aynı
-- adresi listelemeye devam ediyordu. 17.10.2026'da ölçüldü: 3.407
-- aktif üründen 508'i (%15) hiçbir varyantı satılamaz durumda, yani
-- sitemap'in her yedi adresinden biri "indeksleme" diyen bir sayfaya
-- gidiyordu. Search Console bunu "noindex olarak işaretlenmiş
-- gönderilmiş URL" diye raporluyor; tarama bütçesi de 3.400 ürünlük
-- bir katalogda boşa gidiyor.
--
-- Fonksiyondaki varlık kontrolü zaten "varyantı olmayan ürünün
-- sayfası da yok" diyordu; kural satılabilirliğe genişletildi. Stok
-- gelince sayfa yeniden indekslenebilir oluyor ve sitemap'e aynı
-- turda geri giriyor — lastmod da değişiyor.
--
-- İki ikiz birlikte güncelleniyor (kiracı vitrini 20261017122520'de
-- sayfalamayı almıştı; gövdesi oradan devam ediyor).

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_slugs(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    /*
      SATILABİLİR VARYANTI OLMAYAN ÜRÜN SITEMAP'E GİRMEZ (17.10.2026).
      Ürün sayfası stok yokken `noindex` veriyor (vitrin:
      robots.index = product.available !== false), sitemap ise aynı
      adresi "indeksle" diye bildiriyordu. 3.407 ürünün 508'i bu
      durumdaydı: Search Console bunları "noindex olarak işaretlenmiş
      gönderilmiş URL" diye raporluyor ve tarama bütçesi boşa
      gidiyor. Stok gelince ikisi birlikte geri dönüyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

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
    /*
      SATILABİLİR VARYANTI OLMAYAN ÜRÜN SITEMAP'E GİRMEZ (17.10.2026).
      Ürün sayfası stok yokken `noindex` veriyor (vitrin:
      robots.index = product.available !== false), sitemap ise aynı
      adresi "indeksle" diye bildiriyordu. 3.407 ürünün 508'i bu
      durumdaydı: Search Console bunları "noindex olarak işaretlenmiş
      gönderilmiş URL" diye raporluyor ve tarama bütçesi boşa
      gidiyor. Stok gelince ikisi birlikte geri dönüyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;
revoke all on function public.get_arvoculture_storefront_product_slugs(p_limit integer, p_offset integer) from public;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer, p_offset integer) to anon;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer, p_offset integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_product_slugs(p_limit integer, p_offset integer) to service_role;

revoke all on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) from public;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to anon;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to authenticated;
grant execute on function public.arc_storefront_product_slugs(p_host text, p_limit integer, p_offset integer) to service_role;
