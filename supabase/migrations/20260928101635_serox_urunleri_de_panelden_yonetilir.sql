-- serox urunleri de panelden yonetilir
--
-- 20260928100521 ürünleri `sku like 'ARC-LR-%'` koşuluyla buluyordu.
-- İki Serox ürününün SKU'ları o migration uygulanmadan ÖNCE elle
-- düzeltilmişti (gerçek LR kimlikleri zaten biliniyordu), yani koşul
-- onları bulamadı ve işaretsiz kaldılar. Ruj ile dudak kaleminde
-- -002/-003/-004 varyantları durduğu için onlar işaretlendi.
--
-- İşaretsiz kalmaları, aynı Shopify CSV'sinin tekrar aktarılmasında içe
-- aktarımın üretilmiş kimliği yeniden üretip düzeltilmiş kaydın yanına
-- ikinci bir varyant eklemesi demekti.
--
-- Koşul bu kez SLUG: SKU zaten değişmiş olduğu için ona bakılamaz.
update public.arc_products
   set metadata = coalesce(metadata, '{}'::jsonb) || '{"panelden_yonetiliyor": true}'::jsonb,
       updated_at = now()
 where slug in ('lr-serox-instant-serum', 'lr-serox-krem')
   and coalesce(metadata ->> 'panelden_yonetiliyor', '') <> 'true';
