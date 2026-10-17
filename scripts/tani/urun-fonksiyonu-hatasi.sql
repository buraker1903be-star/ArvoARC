-- ============================================================
-- TANI — ürün ve arama dizini fonksiyonları neden hata veriyor?
--
-- Salt okunurdur. GERİ ALMA MIGRATION'INDAN ÖNCE çalıştırın
-- (geri alma hatayı ortadan kaldırır, sebep de kaybolur).
--
-- Her çağrı kendi bloğunda; düşen blok hata metnini yazdırıyor.
-- Çıktı "Messages/Notices" sekmesinde.
-- ============================================================
do $$
declare n integer;
begin
  begin
    select count(*) into n from public.get_arvoculture_storefront_product('lr-serox-krem');
    raise notice 'A ürün (ArvoCulture sarmalayıcı): % satır', n;
  exception when others then
    raise notice 'A ürün DÜŞTÜ: % / %', sqlstate, sqlerrm;
  end;

  begin
    select count(*) into n from public.arc_vitrin_urun(
      (select id from public.organizations where slug = 'arvoculture' limit 1), 'lr-serox-krem');
    raise notice 'B ürün (çekirdek doğrudan): % satır', n;
  exception when others then
    raise notice 'B ürün çekirdek DÜŞTÜ: % / %', sqlstate, sqlerrm;
  end;

  begin
    select count(*) into n from public.get_arvoculture_storefront_search_index(50, 0);
    raise notice 'C arama dizini (sarmalayıcı): % satır', n;
  exception when others then
    raise notice 'C arama dizini DÜŞTÜ: % / %', sqlstate, sqlerrm;
  end;

  begin
    select count(*) into n from public.get_arvoculture_storefront_products(5, 0);
    raise notice 'D katalog (çalışan yüzey): % satır', n;
  exception when others then
    raise notice 'D katalog DÜŞTÜ: % / %', sqlstate, sqlerrm;
  end;
end $$;
