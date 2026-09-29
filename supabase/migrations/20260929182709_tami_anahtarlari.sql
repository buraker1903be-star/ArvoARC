-- TAMİ ANAHTARLARI VE SAĞLAYICI SIRASI
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Ödeme sağlayıcısı kararı: BİRİNCİL TAMİ, YEDEK PAYTR. Tami tarafında
-- ortak ödeme sayfası kullanılıyor; kart bizim sunucumuza hiç
-- uğramıyor (lib/odeme/tami/*).
--
-- ANAHTARLAR KİRACI BAŞINA. PayTR'da olduğu gibi: her mağaza kendi
-- işyeri/terminal bilgilerini giriyor. Tek hesap üstünden gidilseydi
-- tahsilatın doğru kiracıya dağıtılması ayrı bir iş olurdu ve bu
-- projede tek mağazaya sabitlenmiş ödeme kodu somut hasara yol açtı
-- (AGENTS.md, "her şey mağaza kapsamlıdır").
--
-- SIRLAR ŞİFRELİ: secretKey ve JWK "k" değeri AES-256-GCM ile
-- (lib/payment-credentials.ts, PAYMENT_CREDENTIALS_KEY). merchant,
-- terminal ve kid sır değil — Tami portalinde de açık duruyorlar ve
-- hata ayıklarken görülebilmeleri gerekiyor.
--
-- Sütunlar EKLENİYOR, paytr_* olduğu gibi kalıyor: yedek sağlayıcı
-- çalışır durumda kalmalı.

alter table public.arc_store_settings
  add column if not exists tami_enabled boolean not null default false,
  add column if not exists tami_test_mode boolean not null default true,
  add column if not exists tami_merchant_number text,
  add column if not exists tami_terminal_number text,
  add column if not exists tami_secret_key_enc text,
  add column if not exists tami_jwk_kid text,
  add column if not exists tami_jwk_k_enc text;

comment on column public.arc_store_settings.tami_test_mode is
  'Varsayılan TRUE: canlıya alma kararı açıkça verilir. PayTR''da bunun tersi (tanımsızken test moduna düşme) canlıda tahsilatın hiç yapılmaması riskini doğurmuştu.';

/*
  SAĞLAYICI SIRASI. Kart ödemesi artık "PayTR" demek değil.

  'tami'  → önce Tami denenir, olmazsa PayTR (bugünkü karar)
  'paytr' → yalnızca PayTR (Tami'ye geçmemiş mağazalar)

  Devretme YALNIZCA müşteri ödeme sayfasına düşmeden önce geçerli:
  oturum açıldıktan sonra ikinci bir sağlayıcıda oturum açılmaz, yoksa
  iki sağlayıcıda birden açık ödeme ve çift çekim riski doğar.

  Varsayılan 'paytr': bu migration uygulandığında hiçbir mağazanın
  Tami anahtarı yok ve varsayılanı 'tami' yapmak, ertesi sabah bütün
  mağazaların kartla ödemesini yedeğe düşürürdü.
*/
alter table public.arc_store_settings
  add column if not exists odeme_saglayicisi text not null default 'paytr';

alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_odeme_saglayicisi_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_odeme_saglayicisi_check
  check (odeme_saglayicisi in ('paytr', 'tami'));

/*
  ÖDEME KAYDI HANGİ SAĞLAYICIDAN GEÇTİĞİNİ TAŞIYOR. İade, tahsilatın
  yapıldığı sağlayıcıya gitmek zorunda; sipariş üzerinde yazmazsa
  yedeğe düşülen bir günde alınan ödemenin iadesi yanlış kapıya gider.

  Eski kayıtların hepsi PayTR: bugüne kadar tek sağlayıcı vardı.
*/
alter table public.arc_payment_orders
  add column if not exists saglayici text not null default 'paytr';

alter table public.arc_payment_orders
  drop constraint if exists arc_payment_orders_saglayici_check;
alter table public.arc_payment_orders
  add constraint arc_payment_orders_saglayici_check
  check (saglayici in ('paytr', 'tami'));

/*
  Tami'nin sipariş numarası ödeme kaydının kendi uuid'si olacak
  (lib/odeme/tami/istek.ts: Tami 2-36 karakter, yalnızca harf/rakam,
  "-" ve "_", ayırıcılar art arda gelemiyor). merchant_oid PayTR'ın
  biçimini taşıyor ve boş bırakılamıyor; Tami kayıtlarında oraya da
  aynı uuid yazılacak, yani sorgulama tek alandan yapılabiliyor.
*/
