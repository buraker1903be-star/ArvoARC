-- Mağaza başına PayTR anahtarı.
--
-- Anahtarlar bugüne kadar platform geneli ortam değişkenlerinden okunuyordu
-- (PAYTR_MERCHANT_KEY / PAYTR_MERCHANT_SALT). Tek mağaza varken sorun
-- değildi: o anahtarlar ArvoCulture'ın kendi hesabına ait. Ama ikinci mağaza
-- açıldığı anda onun tahsilatı da ArvoCulture'ın hesabına düşerdi.
--
-- Artık her mağaza kendi anahtarını kendi satırında tutuyor. Anahtarlar düz
-- yazılmaz: AES-256-GCM ile şifrelenir, çözme anahtarı yalnızca sunucudaki
-- PAYMENT_CREDENTIALS_KEY ortam değişkenindedir (bkz. src/lib/payment-credentials.ts).
-- Biçim: "v1:<iv>:<etiket>:<şifreli metin>", hepsi base64.

alter table public.arc_store_settings
  add column if not exists paytr_merchant_key_enc text,
  add column if not exists paytr_merchant_salt_enc text;

comment on column public.arc_store_settings.paytr_merchant_key_enc is
  'PayTR merchant_key, AES-256-GCM ile şifreli. Panelden girilir, hiçbir yerde geri gösterilmez.';
comment on column public.arc_store_settings.paytr_merchant_salt_enc is
  'PayTR merchant_salt, AES-256-GCM ile şifreli.';
