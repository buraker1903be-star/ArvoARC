-- arvoculture_arvo_stili
--
-- ARVOCULTURE ARVO EV STİLİNE GEÇİYOR.
--
-- Vitrin tarafı hazır ve canlıda: tipografi seçeneği ("modern")
-- ve sayfa zemini artık tema ayarından okunuyor. İkisi de daha
-- önce ÖLÜ AYARDI — gövdeye sınıf/değişken yazılıyor ama hiçbir
-- kural onları kullanmıyordu, yani panelden seçmek hiçbir şey
-- yapmıyordu (18.10.2026'da bulundu).
--
-- Değerler arvo-os.com ve akademikmerkez.com'da ÖLÇÜLDÜ; ikisi de
-- aynı dili kullanıyor:
--
--   zemin   #ffffff / #fbfbfd
--   metin   #1d1d1f (nötr koyu, siyah değil)
--   başlık  sans, 700, sıkı aralık
--   düğme   koyu, hap biçimi
--
-- "Elit" hissi süsten değil kısıttan geliyor.
--
-- GERİ ALINABİLİR: üç değer de panelden değiştirilebilir ve
-- "editorial" stili kodda duruyor. Beğenilmezse Tema ekranından
-- tek seçimle eski hâle dönülüyor.
--
-- VURGU RENGİNE DOKUNULMUYOR. `accent_color` bugün #D9FF43 (asit
-- yeşili) ve bu markanın kendi kararı; tipografi değişikliğiyle
-- ilgisi yok. Değiştirilecekse ayrı bir karar olarak
-- değiştirilmeli.

update public.arc_store_themes t
   set config = coalesce(t.config, '{}'::jsonb)
                || jsonb_build_object(
                     'typography', 'modern',
                     'background_color', '#FFFFFF',
                     'primary_color', '#1D1D1F'
                   ),
       updated_at = now()
  from public.organizations o
 where o.id = t.organization_id
   and o.slug = 'arvoculture'
   and t.mode in ('published', 'draft');

/*
  Kendini sınayan blok: yayındaki tema üç değeri de taşımalı.
  Taslak satırı yoksa sorun değil — her mağazada olmayabilir.

  ArvoCulture KURUMU yoksa blok hiç çalışmıyor. Önceden koşulsuzdu
  ve `npm run test:db` kırmızı yanıyordu: PGlite ortamı migration'ları
  boş bir veritabanına kuruyor, orada ArvoCulture diye bir mağaza
  yok ve "yayın teması bulunamadı" her koşuda patlıyordu. Canlıda
  davranış AYNI — orada kurum var, blok yine sınıyor; yani bu
  düzeltme uygulanmış migration'ın anlamını değiştirmiyor.
*/
do $$
declare
  v_config jsonb;
begin
  if not exists (
    select 1 from public.organizations o where o.slug = 'arvoculture'
  ) then
    return;
  end if;

  select t.config into v_config
  from public.arc_store_themes t
  join public.organizations o on o.id = t.organization_id
  where o.slug = 'arvoculture' and t.mode = 'published'
  limit 1;

  if v_config is null then
    raise exception 'ArvoCulture yayın teması bulunamadı.';
  end if;

  if v_config ->> 'typography' <> 'modern'
     or upper(v_config ->> 'background_color') <> '#FFFFFF'
     or upper(v_config ->> 'primary_color') <> '#1D1D1F' then
    raise exception 'Tema değerleri yazılamadı: %', v_config;
  end if;

  raise notice 'ArvoCulture Arvo ev stiline geçti (modern · #FFFFFF · #1D1D1F).';
end;
$$;
