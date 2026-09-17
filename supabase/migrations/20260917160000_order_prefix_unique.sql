-- Sipariş numarası öneki mağaza başına tekil.
--
-- 20260916200000'de sütunun yorumu şöyle yazılmıştı:
--   'Sipariş numarası öneki (ArvoCulture: AC). Mağaza başına tekil olmalı.'
-- ama tekillik hiçbir yerde uygulanmıyordu; üstelik alan panelden
-- düzenlenemediği için her mağaza varsayılan 'AC' ile açılıyordu.
--
-- NEDEN ÖNEMLİ
-- Sipariş numarası PayTR'a merchant_oid olarak gidiyor ve bildirim geri
-- geldiğinde sipariş numarayla aranıyor
-- (api/storefront/paytr-bildirim). O arama kurum kapsamsız: iki mağaza aynı
-- öneki kullanırsa aynı gün üretilen iki numaranın çakışma ihtimali gerçek
-- hale gelir ve bildirim YANLIŞ mağazanın siparişine düşebilir. İmza o
-- siparişin mağazasının anahtarıyla doğrulandığı için bildirim sessizce
-- reddedilir: ödeme alınır, sipariş "ödeme bekliyor"da kalır.
--
-- Önek mağaza başına tekil olunca numara uzayları ayrışır ve çakışma
-- imkânsızlaşır.
--
-- DİKKAT: Şu anda birden çok mağaza varsa hepsi 'AC' önekindedir ve bu
-- migration HATA VERİR. Önce aşağıdaki sorgu boş dönmeli; dönmezse
-- mağazalara Ayarlar → Satış ayarlarından farklı önek verin.
--
--   select order_prefix, count(*) as magaza
--   from public.arc_store_settings
--   group by 1 having count(*) > 1;

create unique index if not exists arc_store_settings_order_prefix_unique_idx
  on public.arc_store_settings (upper(order_prefix))
  where order_prefix is not null and trim(order_prefix) <> '';
