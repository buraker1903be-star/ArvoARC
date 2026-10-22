/*
  TANITIM SAYFALARININ İNGİLİZCESİ.

  Hakkımızda, SSS ve iletişim sayfalarının metni kiracının kendi
  metni (`arc_store_pages`, panelden yazılıyor) ve TÜRKÇE. İngilizce
  vitrin açıldığında o metnin karşılığı yoktu: sayfa ya Türkçe
  paragraf gösterecekti ya hiç açılmayacaktı.

  Türkçe metni İngilizce sayfaya koymak BİLEREK yapılmıyor —
  çevirinin yarıda kaldığını göstermekten başka bir şey yapmaz.
  İngilizce metin yoksa vitrin KENDİ yansız İngilizce varsayılanını
  çiziyor; kiracı panelden yazdığı anda onun metni geçiyor.

  Ürünlerdeki kalıbın aynısı (20261022194731): aynı satırda
  `*_en` sütunları, boş = "çevirisi yok" demek.

  İKİZ YOK ve bu bilinçli: `arc_storefront_pages` çok kiracılı
  tasarlandı, ArvoCulture'a özel bir ikizi hiç olmadı
  (scripts/check-ikizler.mjs istisna listesinde gerekçesiyle duruyor).
*/

alter table public.arc_store_pages
  add column if not exists title_en text,
  add column if not exists body_en text;

comment on column public.arc_store_pages.title_en is
  'İngilizce başlık. Boş = çevirisi yok; vitrin kendi İngilizce varsayılanını çizer.';
comment on column public.arc_store_pages.body_en is
  'İngilizce gövde. Boş = çevirisi yok; vitrin kendi İngilizce varsayılanını çizer.';

/*
  VİTRİN SÖZLEŞMESİ GENİŞLİYOR, DEĞİŞMİYOR: `baslik` ve `govde`
  aynen duruyor, yanlarına `baslik_en` ve `govde_en` geliyor. Alan
  çıkarsaydı canlıdaki vitrin ilk dağıtıma kadar bozulurdu.

  SATIR SEÇME KOŞULU DA GENİŞLEDİ: önceden yalnızca Türkçe alanlara
  bakıyordu, yani SADECE İngilizcesi yazılmış bir satır "boş" sayılıp
  hiç dönmezdi — kiracı İngilizce metni yazar, vitrin göstermezdi ve
  hiçbir yerde hata görünmezdi.
*/
create or replace function public.arc_storefront_pages(p_host text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
           jsonb_object_agg(
             p.page_key,
             jsonb_build_object(
               'baslik', p.title,
               'govde', p.body,
               'baslik_en', p.title_en,
               'govde_en', p.body_en
             )
           ),
           '{}'::jsonb
         )
  from public.arc_store_pages p
  where p.organization_id = public.arc_storefront_org(p_host)
    /* Dört alanın dördü de boşsa satır "varsayılana dön" demektir;
       panelde alanları boşaltıp kaydeden kiracı satırı silmiş
       sayılıyor. */
    and (
      length(btrim(coalesce(p.title, ''))) > 0
      or length(btrim(coalesce(p.body, ''))) > 0
      or length(btrim(coalesce(p.title_en, ''))) > 0
      or length(btrim(coalesce(p.body_en, ''))) > 0
    );
$$;

/* Postgres yeni/değişen fonksiyonu PUBLIC'e açık bırakıyor ve
   Supabase anon'a da EXECUTE veriyor; yetkiler açıkça yazılıyor. */
revoke all on function public.arc_storefront_pages(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_pages(text) to anon;
grant execute on function public.arc_storefront_pages(text) to authenticated;
grant execute on function public.arc_storefront_pages(text) to service_role;
