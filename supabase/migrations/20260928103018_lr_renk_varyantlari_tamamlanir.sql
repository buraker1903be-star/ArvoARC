-- lr renk varyantlari tamamlanir
--
-- 20260928100521 bu iki ürünün YALNIZCA rengi bilinen birer varyantını
-- yeniden adlandırmıştı (ruj -001 'pure-red', kalem -001 'rosy-nude').
-- Kalan altı satır ARC-LR-… kimliğiyle duruyordu ve LR'da karşılığı
-- olmadığı için fiyat akışına hiç girmiyordu.
--
-- NEDEN ARTIK ATANABİLİYOR. O satırlar birbirinden AYIRT EDİLEMEZ:
-- fiyatları aynı, stokları 0, attributes boş, başlıkları kendi SKU'ları,
-- sipariş kalemi yok ve tabloda varyant başına görsel yok. Yani renk
-- bilgisi bu satırlarda yok — "yanlış satıra yanlış renk" diye bir
-- çelişki üretilemiyor; renk burada okunmuyor, TANIMLANIYOR. Dört rengin
-- LR fiyatı da aynı, dolayısıyla fiyat tarafında da fark doğmuyor.
--
-- Eşleme LR'ın kendi numarasına göre: kalan SKU'lar kalan renklere
-- sırayla veriliyor. Stok girildikten sonra bir renk yanlış etiketlenmiş
-- görünürse panelden düzeltilir; bugün düzeltilecek bir şey yok çünkü
-- hepsinin stoğu 0.
--
-- LR renk adları 28.09.2026'da toplanan listelerden okundu
-- (arc_price_collections, kaynak 'lr' ve 'lr-genel').

update public.arc_product_variants v
   set sku         = e.yeni_sku,
       title       = e.renk,
       external_id = case when v.external_id is null then null else p.slug || ':' || e.yeni_sku end,
       updated_at  = now()
  from public.arc_products p,
       (values
          -- İpeksi Mat Ruj — 29032-1 Pure Red zaten yazılmıştı.
          ('ARC-LR-ZEITGARD-MAT-RUJ-002',      '29032-2', 'Rosy Nude'),
          ('ARC-LR-ZEITGARD-MAT-RUJ-003',      '29032-3', 'Berry Rose'),
          ('ARC-LR-ZEITGARD-MAT-RUJ-004',      '29032-4', 'Ruby Red'),
          -- Yumuşak Dudak Kalemi — 29031-2 Rosy Nude zaten yazılmıştı.
          ('ARC-LR-ZEITGARD-DUDAK-KALEMI-002', '29031-1', 'Pure Red'),
          ('ARC-LR-ZEITGARD-DUDAK-KALEMI-003', '29031-3', 'Berry Rose'),
          ('ARC-LR-ZEITGARD-DUDAK-KALEMI-004', '29031-4', 'Deep Brown')
       ) as e(eski_sku, yeni_sku, renk)
 where p.id = v.product_id
   and p.organization_id = v.organization_id
   and v.sku = e.eski_sku;

-- Zaten yazılmış iki varyantın başlığı renk adıyla aynı biçimde dursun.
update public.arc_product_variants
   set title = case sku when '29032-1' then 'Pure Red' else 'Rosy Nude' end,
       updated_at = now()
 where sku in ('29032-1', '29031-2')
   and title <> case sku when '29032-1' then 'Pure Red' else 'Rosy Nude' end;
