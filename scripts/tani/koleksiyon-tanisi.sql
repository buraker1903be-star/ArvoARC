-- ============================================================
-- TANI SORGUSU — koleksiyon rafı ve sitemap (17.10.2026)
--
-- Salt okunurdur: hiçbir şeyi değiştirmez.
-- Supabase → SQL Editor'de tamamını çalıştırın, çıkan tabloyu paylaşın.
--
-- Üç soruyu yanıtlar:
--   1. Yeni koleksiyon fonksiyonu 'erkek' ve giyim grupları için
--      satır döndürüyor mu? (Vitrin "0 ürün" gösterdi.)
--   2. Sitemap fonksiyonu kaç ürün veriyor: 3.407 mi, satılabilir
--      olan ~2.899 mu?
--   3. menu_group değerlerinin GERÇEK listesi — kategori
--      sayfalarının kapsamı buna göre kurulacak.
-- ============================================================

-- 1) Koleksiyon rafı: yeni fonksiyon ile çalışan eski ikizi
select
  'raf: erkek (yeni)'  as ne,
  (select count(*) from public.get_arvoculture_storefront_collection_products_page(
            array['erkek'], null, 200, 0, null, null, null, false, false, 'onerilen')) as adet
union all
select 'raf: erkek (eski)',
  (select count(*) from public.get_arvoculture_storefront_collection_products('erkek', null, 200))
union all
select 'raf: erkek-t-shirt (yeni)',
  (select count(*) from public.get_arvoculture_storefront_collection_products_page(
            array['erkek-t-shirt'], null, 200, 0, null, null, null, false, false, 'onerilen'))
union all
select 'raf: kozmetik grubu (yeni)',
  (select count(*) from public.get_arvoculture_storefront_collection_products_page(
            null, array['Kozmetik','Makyaj'], 200, 0, null, null, null, false, false, 'onerilen'))

-- 2) Sitemap: satılabilir varyantı olan aktif ürün sayısı
union all
select 'sitemap: fonksiyon ilk sayfa',
  (select count(*) from public.get_arvoculture_storefront_product_slugs(1000, 0))
union all
select 'sitemap: satılabilir ürün',
  (select count(*) from public.arc_products p
     join public.organizations o on o.id = p.organization_id and o.slug = 'arvoculture'
    where p.status = 'active'
      and exists (select 1 from public.arc_product_variants v
                   where v.product_id = p.id and v.organization_id = p.organization_id
                     and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)))
union all
select 'sitemap: aktif ürün (hepsi)',
  (select count(*) from public.arc_products p
     join public.organizations o on o.id = p.organization_id and o.slug = 'arvoculture'
    where p.status = 'active')

-- 3) menu_group'ların gerçek listesi
union all
select 'grup: ' || coalesce(nullif(c.metadata ->> 'menu_group', ''), '(boş)'),
       count(distinct cp.product_id)
  from public.arc_collections c
  join public.organizations o on o.id = c.organization_id and o.slug = 'arvoculture'
  left join public.arc_collection_products cp
    on cp.collection_id = c.id and cp.organization_id = c.organization_id
 where c.status = 'active'
 group by 1
 order by 1;
