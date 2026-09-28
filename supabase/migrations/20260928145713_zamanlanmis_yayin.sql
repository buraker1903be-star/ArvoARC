-- ZAMANLANMIŞ YAYIN: ürün kendiliğinden yayına girip çıkıyor.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Kampanya saatinde birinin panele girip ürünü "Aktif" yapması
-- gerekiyordu. Gece yarısı başlayan bir indirimde bu, ya birinin gece
-- beklemesi ya kampanyanın saatinde başlamaması demek. Bitişte de
-- aynısı: süresi dolmuş kampanyanın ürünü mağazada kalıyordu.
--
-- İKİ SÜTUN, JSONB DEĞİL. Değerleri zamanlanmış görev sorguluyor
-- (publish_at <= now()); metadata içinde olsalardı her turda bütün
-- katalog taranırdı. Kısmi indeksle yalnızca PLANI OLAN satırlar
-- okunuyor — katalog 3.400 ürün, planı olan genelde birkaç tane.
--
-- SAAT DİLİMİ: sütunlar timestamptz, yani an. Panel Türkiye saatiyle
-- soruyor ve çeviriyi uygulama yapıyor (lib/tr-time.ts): "10:00'da
-- başlat" diyen kullanıcı sunucunun UTC'sini bilmek zorunda değil.

alter table public.arc_products
  add column if not exists publish_at timestamptz,
  add column if not exists unpublish_at timestamptz;

comment on column public.arc_products.publish_at is
  'Bu anda taslaktan yayına alınır; uygulanınca NULL''lanır. NULL: plan yok.';
comment on column public.arc_products.unpublish_at is
  'Bu anda yayından taslağa alınır; uygulanınca NULL''lanır. NULL: plan yok.';

-- Sıfır saniyelik yayın bir kusurdur; ters aralık da öyle. Uygulama
-- zaten reddediyor (lib/yayin-plani.ts) ama son söz veritabanında:
-- görev doğrudan SQL'den de beslenebilir.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arc_products_yayin_araligi') then
    alter table public.arc_products
      add constraint arc_products_yayin_araligi
      check (publish_at is null or unpublish_at is null or unpublish_at > publish_at);
  end if;
end $$;

-- KISMİ İNDEKS: görev yalnızca planı olan satırları arıyor.
create index if not exists arc_products_yayin_zamani_idx
  on public.arc_products (publish_at) where publish_at is not null;
create index if not exists arc_products_yayin_bitisi_idx
  on public.arc_products (unpublish_at) where unpublish_at is not null;

-- Geri almak için:
-- drop index if exists arc_products_yayin_zamani_idx;
-- drop index if exists arc_products_yayin_bitisi_idx;
-- alter table public.arc_products drop constraint if exists arc_products_yayin_araligi;
-- alter table public.arc_products drop column if exists publish_at, drop column if exists unpublish_at;
