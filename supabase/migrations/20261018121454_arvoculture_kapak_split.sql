-- arvoculture_kapak_split
--
-- ANA SAYFA KAPAĞI ARVO EV STİLİNE GEÇİYOR.
--
-- Vitrin tarafı hazır ve canlıda: kapak düzeni ("split") artık
-- tema ayarından okunuyor. Daha önce ÖLÜ AYARDI — `hero-${...}`
-- sınıfı gövdeye yazılıyor ama hiçbir kural onu kullanmıyordu.
--
-- NE DEĞİŞİYOR: metin fotoğrafın ÜSTÜNDE değil, beyaz zeminde
-- kendi başına duruyor; görsel yanında. Karartma katmanı
-- kalkıyor — o katman metni okunur kılmak için fotoğrafı
-- bastırıyordu ve ürünün kendisi görünmez oluyordu.
--
-- Kapak yüksekliği 689'dan 465 piksele iniyor: ilk ekranda
-- kapağın ALTINDAKİ içeriğe de yer kalıyor. Ticari sonucu bu —
-- müşteri açılışta yalnızca bir afiş değil, mağazayı görüyor.
--
-- GERİ ALINABİLİR: panelden "editorial-orbs"a tek seçimle
-- dönülüyor, eski düzen kodda duruyor.

update public.arc_store_themes t
   set config = coalesce(t.config, '{}'::jsonb)
                || jsonb_build_object('hero_style', 'split'),
       updated_at = now()
  from public.organizations o
 where o.id = t.organization_id
   and o.slug = 'arvoculture'
   and t.mode in ('published', 'draft');

do $$
declare
  v_deger text;
begin
  /* ArvoCulture kurumu yoksa blok hiç çalışmıyor: `npm run test:db`
     migration'ları boş bir PGlite veritabanına kuruyor ve orada bu
     mağaza yok. Canlıda davranış aynı — kurum orada var, blok yine
     sınıyor. */
  if not exists (
    select 1 from public.organizations o where o.slug = 'arvoculture'
  ) then
    return;
  end if;

  select t.config ->> 'hero_style' into v_deger
  from public.arc_store_themes t
  join public.organizations o on o.id = t.organization_id
  where o.slug = 'arvoculture' and t.mode = 'published'
  limit 1;

  if v_deger is distinct from 'split' then
    raise exception 'Kapak düzeni yazılamadı: %', coalesce(v_deger, '(yok)');
  end if;

  raise notice 'ArvoCulture kapağı split düzenine geçti.';
end;
$$;
