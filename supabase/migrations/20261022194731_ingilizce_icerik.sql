/*
  İNGİLİZCE İÇERİK ALANLARI (22.10.2026)

  İngilizce vitrin (/en) açıldı ama ürün ADLARI ve AÇIKLAMALARI
  Türkçe: "Kadın 3 İplik Şardonsuz Yazlık Cepli Lastikli Bağcıklı
  Regular Fit Şort". Yurtdışı müşterisi ne aldığını okuyamıyor.

  ÇEVİRİ VERİTABANINDA, ÇALIŞMA ANINDA DEĞİL. Sayfa çizilirken bir
  çeviri servisine gitmek üç sorun doğuruyordu: her istekte ücret,
  servis düştüğünde yarı Türkçe sayfa ve arama motorunun her
  taramada farklı metin görmesi (aynı adres, değişen içerik =
  dizine girmeyen sayfa). Çeviri bir kez üretilip SAKLANIYOR;
  gösterim sırasında yalnızca okunuyor.

  BOŞ ALAN TÜRKÇEYE DÜŞÜYOR, boş kalmıyor. 3.400 ürünün çevirisi bir
  içerik işi ve kademeli yürüyecek; çevirisi olmayan ürün İngilizce
  vitrinde Türkçe adıyla görünür. Yarım çeviri, boş bir kart ya da
  "[untranslated]" gibi bir izden iyi.

  `translated_at` NEDEN VAR: ürünün Türkçe adı sonradan
  değiştiğinde (tedarikçi güncellemesi, elle düzeltme) çeviri
  BAYATLIYOR ve bunu hiçbir şey söylemiyor. Damga `updated_at` ile
  karşılaştırılıp "çevirisi eskimiş ürünler" listesi çıkarılabiliyor.
  Damgasız bir tasarımda o soru hiç sorulamazdı.

  ÇEVİRİ ELLE DE DÜZELTİLEBİLİR: alanlar düz metin ve panelden
  yazılabilir. Makine çevirisi bir başlangıç, son söz değil.
*/

alter table public.arc_products
  add column if not exists name_en text,
  add column if not exists description_en text,
  /* Çevirinin üretildiği an; `updated_at`'ten eskiyse çeviri bayat. */
  add column if not exists translated_at timestamptz;

alter table public.arc_collections
  add column if not exists title_en text,
  add column if not exists description_en text,
  add column if not exists translated_at timestamptz;

comment on column public.arc_products.name_en is
  'Ürün adının İngilizcesi; boşsa İngilizce vitrin Türkçe adı gösterir.';
comment on column public.arc_products.translated_at is
  'Çevirinin üretildiği an; updated_at bundan yeniyse çeviri bayatlamıştır.';

/*
  KISMİ İNDEKS: "çevirisi olmayan ürünler" sorgusu çeviri işinin her
  turunda koşuyor ve katalog 3.400 satır. Tam indeks burada gereksiz
  — çevirisi OLAN satırları aramıyoruz.
*/
create index if not exists arc_products_cevirisiz
  on public.arc_products (organization_id)
  where name_en is null;

/* --------------------------------------------------------------
   VİTRİNİN OKUDUĞU ÇEVİRİ

   NEDEN AYRI FONKSİYON, ÜRÜN LİSTELERİNE SÜTUN EKLEMEK YERİNE:
   vitrinin ürün listeleri on dört fonksiyon (artı ikizleri) ve
   hepsine iki sütun eklemek on dört gövdeyi elle yeniden yazmak
   demekti — kopyalama hatası riski kazanımdan büyük (aynı karar
   yurtdışına gönderilemeyen ürün listesinde de verildi).

   İngilizce sayfa zaten hangi ürünleri çizdiğini biliyor; adları
   tek sorguda alıp üzerine BİNDİRİYOR.

   ANON'A AÇIK: ürün adı herkese açık bir bilgi ve o sayfalarda
   zaten basılıyor.
   -------------------------------------------------------------- */

drop function if exists public.arc_vitrin_ingilizce_urunler(uuid, text[]);

create or replace function public.arc_vitrin_ingilizce_urunler(
  p_organization_id uuid,
  p_sluglar text[]
)
returns table (slug text, name_en text, description_en text)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.slug, p.name_en, p.description_en
  from public.arc_products p
  where p.organization_id = p_organization_id
    and p.slug = any (coalesce(p_sluglar, '{}'))
    /* Yalnızca çevirisi OLANLAR dönüyor: çağıran taraf bulamadığı
       slug için Türkçeye düşüyor ve boş satır taşımak gereksiz. */
    and p.name_en is not null;
$function$;

revoke all on function public.arc_vitrin_ingilizce_urunler(uuid, text[]) from public, anon, authenticated;
grant execute on function public.arc_vitrin_ingilizce_urunler(uuid, text[]) to service_role;

drop function if exists public.arc_storefront_translations(text, text[]);

create or replace function public.arc_storefront_translations(p_host text, p_sluglar text[])
returns table (slug text, name_en text, description_en text)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_ingilizce_urunler(
    public.arc_storefront_org(p_host), p_sluglar);
$function$;

revoke all on function public.arc_storefront_translations(text, text[]) from public;
grant execute on function public.arc_storefront_translations(text, text[]) to anon, authenticated, service_role;

drop function if exists public.get_arvoculture_storefront_translations(text[]);

create or replace function public.get_arvoculture_storefront_translations(p_sluglar text[])
returns table (slug text, name_en text, description_en text)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_ingilizce_urunler(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_sluglar);
$function$;

revoke all on function public.get_arvoculture_storefront_translations(text[]) from public;
grant execute on function public.get_arvoculture_storefront_translations(text[]) to anon, authenticated, service_role;
