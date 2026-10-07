-- GARANTİ SANAL POS ANAHTARLARI — ve Tami'nin ödeme yolundan çıkışı
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Model 3D PAY HOSTING: kart formu bankanın sayfasında, kart numarası
-- bizim sunucumuza hiç uğramıyor (lib/odeme/garanti/*). PayTR ve
-- Tami'deki düzenin aynısı; PCI yükümlülüğü SAQ A'da kalıyor.
--
-- ANAHTARLAR KİRACI BAŞINA, PayTR ve Tami'de olduğu gibi. Tek hesap
-- üstünden gitmek tahsilatı doğru mağazaya dağıtmayı ayrı bir işe
-- çevirirdi ve bu projede tek mağazaya sabitlenmiş ödeme kodu somut
-- hasara yol açtı (AGENTS.md, "her şey mağaza kapsamlıdır").

alter table public.arc_store_settings
  add column if not exists garanti_enabled boolean not null default false,
  add column if not exists garanti_test_mode boolean not null default true,
  -- Sır DEĞİL: bankanın panelinde de açık duruyorlar ve hata ararken
  -- görülebilmeleri gerekiyor.
  add column if not exists garanti_isyeri_no text,
  add column if not exists garanti_terminal_no text,
  -- SIRLAR, AES-256-GCM (lib/payment-credentials.ts).
  add column if not exists garanti_provizyon_sifresi_enc text,
  add column if not exists garanti_iade_sifresi_enc text,
  add column if not exists garanti_magaza_anahtari_enc text,
  add column if not exists garanti_api_surumu text not null default 'v512',
  add column if not exists garanti_guvenlik_duzeyi text not null default '3D_PAY_HOSTING',
  add column if not exists garanti_yari_guvenli_kabul boolean not null default false;

comment on column public.arc_store_settings.garanti_test_mode is
  'Varsayılan TRUE: canlıya alma kararı açıkça verilir. PayTR''da bunun tersi (tanımsızken test moduna düşme) canlıda tahsilatın hiç yapılmaması riskini doğurmuştu.';

/*
  HASH SÜRÜMÜ AYARDA, ÇÜNKÜ ÜYE İŞYERİ HESABINA GÖRE DEĞİŞİYOR.

  'v512'  → SHA512, para birimi kodu hash'e girer (bankanın yeni hesaplarda verdiği)
  'v0.01' → SHA1, para birimi kodu hash'e girmez (eski hesaplar)

  Yanlış seçim her ödemenin "hash hatalı" ile dönmesi demek ve banka
  hangi alanın uymadığını söylemiyor. Tahmin etmektense ayara koymak,
  bankanın entegrasyon belgesindeki değeri bir kez girmeyi gerektiriyor.
*/
alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_garanti_api_surumu_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_garanti_api_surumu_check
  check (garanti_api_surumu in ('v512', 'v0.01'));

comment on column public.arc_store_settings.garanti_guvenlik_duzeyi is
  'secure3dsecuritylevel. 3D Pay Hosting için 3D_PAY_HOSTING; bankanın verdiği belgede başka bir değer yazıyorsa buradan değiştirilir.';
comment on column public.arc_store_settings.garanti_yari_guvenli_kabul is
  '3D doğrulaması yarı güvenli (mdstatus 2/3/4) biten işlemler kabul edilsin mi. Kart ya da banka 3D''ye kayıtlı değilse provizyon yine de yapılıyor; reddetmek parası çekilmiş müşterinin siparişini açmamak demek, kabul etmek ters ibraz riskini işyerine almak. Varsayılan FALSE: risk açıkça seçilsin.';
comment on column public.arc_store_settings.garanti_iade_sifresi_enc is
  'PROVRFN kullanıcısının şifresi. Yalnızca iptal/iade imzasında kullanılıyor; girilmezse panelden iade yapılamaz, tahsilat çalışır.';

/*
  SAĞLAYICI SIRASI: TAMİ ÇIKTI, GARANTİ GİRDİ.

  'garanti' → önce Garanti, olmazsa PayTR (ArvoCulture'ın bugünkü kararı)
  'paytr'   → yalnızca PayTR

  'tami' ARTIK SEÇİLEMİYOR. Kısıtı daraltmadan önce seçili olan mağazalar
  'paytr'a alınıyor; bırakılsaydı kısıt eklenemez, eklenebilseydi de o
  mağazaların kartlı ödemesi kapanırdı.

  TAMİ KODU SİLİNMEDİ ve silinmemeli: Tami ile tahsil edilmiş GEÇMİŞ
  siparişlerin iadesi hâlâ Tami'ye gitmek zorunda (lib/odeme/iade.ts).
  tami_* sütunları da o yüzden duruyor — anahtarlar silinirse o
  siparişlerin parası müşteriye panelden iade edilemez.
*/
update public.arc_store_settings set odeme_saglayicisi = 'paytr' where odeme_saglayicisi = 'tami';

alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_odeme_saglayicisi_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_odeme_saglayicisi_check
  check (odeme_saglayicisi in ('paytr', 'garanti'));

comment on column public.arc_store_settings.odeme_saglayicisi is
  'Kartlı ödemede önce denenecek sağlayıcı. Yedeğe düşme YALNIZCA ödeme oturumu açılırken geçerli: müşteri bankanın sayfasına düştükten sonra ikinci bir sağlayıcıda oturum açmak çift çekim demek.';
