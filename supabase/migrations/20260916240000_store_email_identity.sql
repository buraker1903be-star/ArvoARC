-- Mağazaya özel e-posta gönderen adresi.
--
-- Müşteriye giden kimlik e-postaları (kayıt doğrulama, şifre sıfırlama)
-- ArvoCulture'ın adresinden gidiyordu ve bu kodda sabitti. İkinci mağazanın
-- müşterisi, sizin alan adınızdan e-posta alırdı — mağazayı başkasına
-- sattığınızda hem marka karışıklığı hem itibar riski.
--
-- Adres boş bırakılırsa bugünkü varsayılana düşülür: bir alan adından
-- e-posta gönderebilmek için o alan adının Resend'de doğrulanmış olması
-- gerekiyor (DNS kaydı), yani yeni mağaza kendi adresini ancak doğrulamayı
-- tamamladıktan sonra yazabilir. Bu yüzden zorunlu tutulmuyor.
--
-- Marka adı, logo ve unvan/adres zaten mevcut alanlardan okunuyor
-- (store_name, logo_path, organizations.legal_name/legal_address).

alter table public.arc_store_settings
  add column if not exists email_from text,
  add column if not exists email_reply_to text;

comment on column public.arc_store_settings.email_from is
  'Müşteri e-postalarında gönderen: "Mağaza Adı <adres@alanadi.com>". Alan adı Resend''de doğrulanmış olmalı. Boşsa platform varsayılanı kullanılır.';
comment on column public.arc_store_settings.email_reply_to is
  'Yanıt adresi. Boşsa platform varsayılanı kullanılır.';
