-- tarzyeri_stok_tamponu_11
--
-- ARVOCULTURE'DA TARZYERİ STOĞU 10'A DÜŞÜNCE SATIŞ KAPANIYOR.
--
-- Kurum sahibinin kararı (17.10.2026): "stok sayısı 10'a düşünce
-- varyantlarda satış durdurulsun, tükendi olarak görünsün".
--
-- NEDEN 11 YAZIYOR: alanın anlamı "tedarikçi stoğu bu değerin
-- ALTINA düşerse ürün satışa kapanır" (panelde de böyle yazıyor).
-- Satışın 10'DA kapanması için eşik 11 olmalı; 10 yazılsa stok 10
-- iken ürün hâlâ satılabilir, 9'da kapanırdı. İki okuma arasındaki
-- fark son on adedin satılıp satılmaması, o yüzden karar sorularak
-- alındı.
--
-- Kural iki yerde birlikte çalışıyor:
--   * içe aktarım (lib/supplier-stock.ts sellableStock): tedarikçide
--     11'den az görünen varyanta 0 yazıyor, yani panelde de "tükendi";
--   * satılabilirlik (arc_variant_available): stok > 0 ve stok >= tampon.
-- Sonuç: tedarikçide 10 adet kalan varyant hiçbir yüzeyde satılabilir
-- görünmüyor ve siparişi de geçmiyor (20261017144835).
--
-- YAN ETKİ, BİLİNÇLİ: panel 10 ve altındaki gerçek tedarikçi adedini
-- göstermiyor, 0 gösteriyor. Mekanizma zaten böyleydi (tampon 5
-- iken 4 ve altı 0 yazılıyordu); değişen yalnızca eşik.
--
-- Yalnızca ArvoCulture'ın Tarzyeri kaydı; başka kiracı ve başka
-- tedarikçi etkilenmiyor.

update public.arc_suppliers s
   set stock_buffer = 11,
       updated_at = now()
  from public.organizations o
 where o.id = s.organization_id
   and o.slug = 'arvoculture'
   and s.code = 'tarzyeri'
   and s.stock_buffer <> 11;

/*
  Uygulandığının kanıtı. Kayıt YOKSA hata değil: birim testlerinin
  veritabanı boş şemadan kuruluyor (tests/db/ortam.mjs) ve orada
  ArvoCulture'ın Tarzyeri satırı hiç bulunmuyor. Kayıt VARSA eşiği
  11 olmak zorunda — sessizce 0 satır güncellemek, bu migration'ın
  hiç işe yaramadığını saklamak olurdu.
*/
do $$
declare aday integer; onbir integer;
begin
  select count(*) into aday
    from public.arc_suppliers s
    join public.organizations o on o.id = s.organization_id
   where o.slug = 'arvoculture' and s.code = 'tarzyeri';

  if aday = 0 then
    raise notice 'ArvoCulture · Tarzyeri kaydı yok; eşik yazılmadı (boş şema olabilir).';
    return;
  end if;

  select count(*) into onbir
    from public.arc_suppliers s
    join public.organizations o on o.id = s.organization_id
   where o.slug = 'arvoculture' and s.code = 'tarzyeri' and s.stock_buffer = 11;

  raise notice 'ArvoCulture · Tarzyeri: % kayittan % tanesinde tampon 11.', aday, onbir;
  if onbir <> aday then
    raise exception 'Tampon yazılamadı: % kayıttan yalnızca % tanesi 11.', aday, onbir;
  end if;
end $$;
