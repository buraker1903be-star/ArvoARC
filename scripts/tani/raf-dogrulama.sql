-- ============================================================
-- DOĞRULAMA — ikiye ayrılmış raf, anon rolüyle ve kendi süre
-- sınırıyla. 20261017133904 uygulandıktan SONRA çalıştırın.
--
-- Salt okunurdur. Dört satır döner; hepsi dönerse vitrin tarafını
-- yayına alabiliriz. Düşerse hangi satırda düştüğü cevaptır.
-- ============================================================
set role anon;

select 'A sayfa: giyim grupları' as ne, count(*) as adet
  from public.get_arvoculture_storefront_collection_products_page(
    null, array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'],
    24, 0, null, null, null, false, false, 'onerilen')
union all
select 'B sayfa: erkek', count(*)
  from public.get_arvoculture_storefront_collection_products_page(
    array['erkek'], null, 24, 0, null, null, null, false, false, 'onerilen')
union all
select 'C seçenekler: giyim grupları',
       (select coalesce(jsonb_array_length(sizes), 0)
          from public.get_arvoculture_storefront_collection_facets(
            null, array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk']))
union all
select 'D seçenekler: toplam ürün',
       (select total_count
          from public.get_arvoculture_storefront_collection_facets(
            null, array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk']));

reset role;
