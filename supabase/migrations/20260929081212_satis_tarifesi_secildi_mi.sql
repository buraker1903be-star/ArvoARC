-- SATIŞ TARİFESİNİ KİRACI GERÇEKTEN SEÇTİ Mİ?
--
-- SORUN (29.09.2026'da PGlite'ta üretildi). shipping_fee ve
-- free_shipping_threshold NOT NULL ve sütun varsayılanları 12000 /
-- 200000 kuruş — yani 120 TL kargo, 2000 TL üzeri ücretsiz. Bu
-- sayılar sistem tek mağazalıyken (20260916200000) konmuştu ve
-- ArvoCulture'ın tarifesi. Yeni bir salonun ayar satırı açıldığında
-- o salon, HİÇ SORULMADAN başka bir mağazanın tarifesiyle satmaya
-- başlıyor.
--
-- Rehber de yanlış söylüyordu: kurulum adımı "shipping_fee bir sayı
-- mı" diye bakıyor, sütun NOT NULL olduğu için cevap her zaman evet
-- ve "Kargo ücretini belirle" adımı, kimsenin belirlemediği hâlde
-- TAMAM görünüyordu. Rehberin yanlış "tamam" demesi, kusuru
-- müşterinin bulması demek.
--
-- ÇÖZÜM. Sütunlardan varsayılanı kaldırmak yerine "seçildi mi" bilgisi
-- ayrı tutuluyor: NOT NULL bir sütun "120 TL'yi seçtim" ile "hiç
-- dokunmadım"ı ayırt edemez, sütunu nullable yapmak ise satış yolundaki
-- her hesabı etkilerdi. Damga yalnızca rehberi ilgilendiriyor; tarife
-- hesabı değişmiyor.

alter table public.arc_store_settings
  add column if not exists sales_configured_at timestamptz;

comment on column public.arc_store_settings.sales_configured_at is
  'Kiracı satış ayarlarını (kargo, ücretsiz kargo eşiği, havale indirimi) kendisi kaydettiğinde damgalanır. NULL ise tarife hâlâ platform varsayılanı; kurulum rehberi bu adımı eksik sayar.';

-- BUGÜN VAR OLAN MAĞAZALAR SEÇMİŞ SAYILIYOR. Hâlihazırda satan bir
-- mağazaya "kargon eksik" demek yanlış alarm olurdu; damga olmadığı
-- için geçmişi bilemiyoruz ve doğru varsayım, çalışan mağazanın
-- tarifesinin bilinçli olduğu.
update public.arc_store_settings
   set sales_configured_at = coalesce(updated_at, created_at, now())
 where sales_configured_at is null;
