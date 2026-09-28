-- lr makyaj ton adlari yazilir
--
-- Kapatıcı (29021-*), Fondöten (29022-*) ve Kaş Jeli (29030-*) 20.08.2026
-- Shopify içe aktarımında ton adlarını kaybetti: yalnızca ilk varyantın
-- başlığı kaldı, kalanlar boştu ve 20260928083351 onlara SKU'yu yazdı.
--
-- SKU'ları zaten doğru LR kimlikleri, yani bu ürünler fiyat akışında.
-- Eksik olan sadece isim; vitrinde ton seçicisi "29022-2" gösteriyordu.
--
-- Adlar UYDURULMUYOR, LR'ın kendi listelerinden okundu
-- (arc_price_collections, 28.09.2026). Duran başlıklar da doğruluyor:
-- kapatıcı ve fondötenin ilk varyantı "Flair" yazıyordu — LR'ın
-- "NR 1 - Fair" tonunun yanlış yazılmışı; kaş jelinin ilki zaten
-- "Light" ve LR'da da öyle.
update public.arc_product_variants v
   set title = e.ton,
       updated_at = now()
  from (values
          -- LR ZEITGARD Signature Concealer (kapatıcı)
          ('29021-1', 'Fair'),
          ('29021-2', 'Light'),
          ('29021-3', 'Neutral'),
          -- LR ZEITGARD Signature Parlak Fondöten
          ('29022-1', 'Fair'),
          ('29022-2', 'Light'),
          ('29022-3', 'Neutral'),
          -- LR ZEITGARD Signature Şekillendirici Kaş Jeli
          ('29030-1', 'Light'),
          ('29030-2', 'Medium')
       ) as e(sku, ton)
 where v.sku = e.sku
   and coalesce(v.title, '') <> e.ton;
