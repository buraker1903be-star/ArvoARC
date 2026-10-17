-- vitrin_magaza_sayfalari
--
-- VİTRİN TANITIM SAYFALARINI ADRESTEN OKUSUN.
--
-- `arc_store_pages` bir önceki migration'da açıldı
-- (20261017211501) ve orada şöyle yazıyordu: "Vitrin bu tabloyu
-- kendi anahtarıyla okumuyor: sayfalar sunucuda çiziliyor ve servis
-- anahtarıyla okunuyor (RLS atlanıyor)." BU VARSAYIM YANLIŞTI.
-- Vitrinin sunucu tarafı da yalnızca yayınlanabilir (anon) anahtar
-- taşıyor (`ARC_SUPABASE_PUBLISHABLE_KEY`); servis anahtarı vitrine
-- hiç verilmedi ve verilmemeli — o anahtar bütün kiracıların
-- siparişlerini okuyabilir, vitrin ise internete bakan bir süreç.
-- Yani tablo olduğu gibi bırakılsa sayfalar BOŞ gelirdi: RLS
-- oturumsuz isteği eliyor, hata da vermiyor.
--
-- Çözüm diğer vitrin okumalarıyla aynı: adresi alan, kurumu kendisi
-- çözen, `security definer` bir fonksiyon. Yani tablo anon'a
-- açılmıyor; yalnızca "şu adresten görünen metin" sorusu yanıtlanıyor.
--
-- SIZINTI YOK: bu metinler zaten herkese açık sayfalarda basılıyor.
-- Tabloda yayın durumu (taslak/yayında) yok; satır varsa sayfada
-- görünmesi gereken metin odur.
--
-- ÜÇ SAYFA TEK ÇAĞRIDA. Sayfa başına bir çağrı da olurdu ama
-- hakkımızda/SSS/iletişim bağlantıları her sayfanın altbilgisinde
-- duruyor; vitrin üçünü bir arada önbelleğe alıp tek anahtarla
-- saklıyor. Nesne döndürmek, "bu mağazanın hiç metni yok"u da tek
-- kontrolle anlaşılır kılıyor.

create or replace function public.arc_storefront_pages(p_host text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_object_agg(
             p.page_key,
             jsonb_build_object('baslik', p.title, 'govde', p.body)
           ),
           '{}'::jsonb
         )
  from public.arc_store_pages p
  where p.organization_id = public.arc_storefront_org(p_host)
    /* Başlığı ve gövdesi boş satır, "varsayılana dön" demektir:
       panelde alanları boşaltıp kaydeden kiracı satırı silmiş sayılıyor
       ama elle girilmiş eski bir boş satır da aynı anlama gelmeli. */
    and (length(btrim(p.title)) > 0 or length(btrim(p.body)) > 0);
$$;

/*
  Postgres PUBLIC'e, Supabase de anon'a varsayılan olarak EXECUTE
  veriyor; ikisi de kaldırılıp yalnızca gerekenler veriliyor.
*/
revoke all on function public.arc_storefront_pages(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_pages(text) to anon, authenticated, service_role;

/*
  Kendini sınayan blok. Metni olmayan bir mağazada da, tanınmayan bir
  adreste de BOŞ NESNE dönmeli — null değil: vitrin "{}" görünce
  varsayılan metni çiziyor, null görünce de aynısını yapıyor ama
  ayrımı kodda iki kez kontrol etmek istemiyoruz.
*/
do $$
declare
  v_sonuc jsonb;
begin
  v_sonuc := public.arc_storefront_pages('bilinmeyen-adres.example');
  if v_sonuc is null or v_sonuc <> '{}'::jsonb then
    raise exception 'Tanınmayan adres için boş nesne dönmedi: %', v_sonuc;
  end if;

  raise notice 'Vitrin sayfa okuması hazır.';
end;
$$;
