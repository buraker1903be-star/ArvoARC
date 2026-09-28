-- lr urunleri panelden yonetilir ve bilinen skular yazilir
--
-- NEDEN. Dört LR ürünü (Serox Serum, Serox Cream, İpeksi Mat Ruj,
-- Yumuşak Dudak Kalemi) Shopify CSV'sinden geldi ama o dosyada
-- `Variant SKU` sütunu BOŞTU: SKU'ları içe aktarım üretti
-- (ARC-LR-…-001) ve LR'da karşılığı olmadığı için fiyat toplayıcısı
-- bu ürünleri hiç tanımadı — maliyetleri hiç oluşmadı.
--
-- Gerçek LR kimlikleri topladığımız listelerden çıkarıldı. Yazıldıktan
-- sonra aynı CSV'nin tekrar aktarılması, üretilmiş kimliği YENİDEN
-- üretip düzeltilmiş kaydın yanına ikinci bir varyant ekleyecekti; bu
-- yüzden ürünler "panelden yönetiliyor" diye işaretleniyor ve içe
-- aktarım onlara hiç dokunmuyor (lib/shopify-varyant.ts).

-- 1) İçe aktarım bu ürünlere dokunmasın.
--    İşaret metadata'da: ürün metadata'sı zaten içe aktarım ayarlarını
--    taşıyor (shopify_handle, images_migrated…) ve şema anlık
--    görüntüsü el değmeden kalıyor.
update public.arc_products p
   set metadata = coalesce(p.metadata, '{}'::jsonb) || '{"panelden_yonetiliyor": true}'::jsonb,
       updated_at = now()
 where exists (
         select 1 from public.arc_product_variants v
          where v.product_id = p.id
            and v.organization_id = p.organization_id
            and v.sku like 'ARC-LR-%'
       );

-- 2) Rengi BİLİNEN varyantlara gerçek LR kimliği yazılır.
--
--    Yalnızca dördü yazılıyor. Kalan altı varyantın rengi içe
--    aktarımda kayboldu ve SIRAYA GÖRE eşlemek yanlış olurdu: ruj'da
--    -001 'pure-red' yani LR'ın NR 1'i, dudak kaleminde -001
--    'rosy-nude' yani LR'ın NR 2'si. İki üründe sıra farklı; hangisinin
--    hangi renk olduğuna kod karar veremez, yanlış renge yanlış fiyat
--    yazmak canlı mağazada geri alınamaz.
--
--    external_id de birlikte güncelleniyor: <slug>:<sku> biçimi
--    20260928083351'de sabitlendi, SKU değişince kimlik de değişmeli.
update public.arc_product_variants v
   set sku         = e.yeni_sku,
       title       = coalesce(e.yeni_baslik, e.yeni_sku),
       external_id = case when v.external_id is null then null else p.slug || ':' || e.yeni_sku end,
       updated_at  = now()
  from public.arc_products p,
       (values
          ('ARC-LR-SEROX-INSTANT-SERUM-001',   '28251-101', null),
          ('ARC-LR-SEROX-KREM-001',            '28244-301', null),
          ('ARC-LR-ZEITGARD-MAT-RUJ-001',      '29032-1',   'Pure Red'),
          ('ARC-LR-ZEITGARD-DUDAK-KALEMI-001', '29031-2',   'Rosy Nude')
       ) as e(eski_sku, yeni_sku, yeni_baslik)
 where p.id = v.product_id
   and p.organization_id = v.organization_id
   and v.sku = e.eski_sku;
