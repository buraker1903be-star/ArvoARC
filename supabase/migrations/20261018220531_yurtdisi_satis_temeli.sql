/*
  YURTDIŞI SATIŞIN TEMELİ (19.10.2026)

  Üç parça: dolar kuru + kâr payı, bölgeye göre kargo tarifesi ve
  "bu ürün yurtdışına gönderilemez" işareti.

  MOD VARSAYILAN KAPALI. Yurtdışı vitrini yarım haldeyken açık
  olsaydı, LR ürünü gönderilemediği halde sipariş edilebilirdi.
  `international_enabled` bütün parçalar bitince elle açılıyor.

  KUR PANELDEN, CANLI DEĞİL (kurum sahibinin kararı). Dış bir kur
  servisine bağlanmak, servis düştüğü gün fiyatın ne olacağı
  sorusunu doğuruyor: yedek kura düşmek sessizce yanlış fiyat,
  satışı durdurmak ciro kaybı. Panelden girilen kur değişmedikçe
  fiyat da değişmiyor — mağaza ne sattığını biliyor.

  KÂR PAYI AYRI BİR ALAN, kura gömülü değil. İkisi tek sayı
  olsaydı "kur ne, kârım ne" sorusu yanıtsız kalırdı; kur
  güncellenirken kâr payının da yeniden hesaplanması gerekirdi.
*/

alter table public.arc_store_settings
  add column if not exists international_enabled boolean not null default false,
  /* 1 USD kaç TL. Ondalık: kuruş değil, kur. */
  add column if not exists usd_rate numeric(12, 4),
  /* Dolar fiyatına eklenen yüzde: kur riski ve yurtdışı maliyeti. */
  add column if not exists usd_margin_percent numeric(6, 2) not null default 0;

comment on column public.arc_store_settings.usd_rate is
  '1 USD kaç TL; panelden girilir, canlı kur değildir.';
comment on column public.arc_store_settings.usd_margin_percent is
  'Dolar fiyatına eklenen yüzde (kur riski ve yurtdışı maliyeti).';

/* --------------------------------------------------------------
   BÖLGEYE GÖRE KARGO TARİFESİ

   Tek bir "yurtdışı ücreti" uzak ülkelerde zarar ettiriyor,
   ülke ülke tarife ise iki yüz satırlık bir tablo demek.
   Bölge ikisinin arası: Avrupa, ABD, diğer.

   ÜLKE KODLARI DİZİ OLARAK: bir bölgeye ülke eklemek satır
   açmayı değil diziye bir kod yazmayı gerektiriyor.
   -------------------------------------------------------------- */

create table if not exists public.arc_shipping_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  label text not null,
  /* ISO ülke kodları (TR, DE, US…). Boş dizi = "öteki her yer";
     eşleşmeyen ülke bu bölgeye düşüyor. */
  countries text[] not null default '{}',
  /* Kargo ücreti USD SENT cinsinden: yurtdışı fiyatları dolar. */
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  /* Bu tutarın üstünde kargo ücretsiz (sent). 0 = eşik yok. */
  free_over_cents bigint not null default 0 check (free_over_cents >= 0),
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists arc_shipping_zones_kurum
  on public.arc_shipping_zones (organization_id, sira);

/*
  RLS AÇIK, POLİTİKA YOK: okuma vitrin fonksiyonundan (SECURITY
  DEFINER), yazma panelde servis anahtarıyla.
*/
alter table public.arc_shipping_zones enable row level security;

/* --------------------------------------------------------------
   YURTDIŞINA GÖNDERİLEMEYEN ÜRÜN

   LR ürünleri yurtdışına gönderilemiyor. Kuralı sorgu anında
   marka adından çıkarmak kırılgan olurdu: marka adı değişir ya da
   başka bir tedarikçi için de aynı kural gerekirse kod
   değiştirmek gerekirdi. İşaret ÜRÜNÜN ÜSTÜNDE duruyor; aşağıdaki
   güncelleme onu bugünkü LR kataloğu için dolduruyor, sonrası
   panelden yönetilebilir.
   -------------------------------------------------------------- */

alter table public.arc_products
  add column if not exists international_blocked boolean not null default false;

comment on column public.arc_products.international_blocked is
  'Yurtdışına gönderilemeyen ürün; yurtdışı vitrininde hiç görünmez.';

create index if not exists arc_products_yurtdisi
  on public.arc_products (organization_id)
  where international_blocked;

/*
  BUGÜNKÜ LR KATALOĞU İŞARETLENİYOR.

  Eşleşme dar tutuldu: marka adı "LR" ya da "LR ..." ile
  başlayanlar. Gevşek bir `%lr%` deseni "Colour", "Flora" gibi
  adların içindeki harfleri yakalardı ve satılabilir ürünleri
  sessizce yurtdışı vitrininden silerdi.

  Uygulandıktan sonra sayıyı doğrulayın:
    select count(*) from public.arc_products where international_blocked;
*/
update public.arc_products
   set international_blocked = true
 where international_blocked = false
   and (
     coalesce(metadata ->> 'vendor', '') ilike 'lr'
     or coalesce(metadata ->> 'vendor', '') ilike 'lr %'
     or coalesce(metadata ->> 'vendor', '') ilike '%lr health%'
   );
