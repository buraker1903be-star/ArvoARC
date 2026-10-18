-- arvoculture_kapak_tam_genislik
--
-- KAPAK TAM GENİŞLİK SİNEMATİK DÜZENE DÖNÜYOR.
--
-- "split" düzeni (metin solda, görsel sağda) denendi ve yeterince
-- etkili bulunmadı: moda ve kozmetikte satışı yapan şey büyük
-- fotoğraf ve o düzende fotoğraf ekranın yarısında kalıyor.
--
-- "editorial-orbs" artık ESKİSİ GİBİ DEĞİL. Eski hâlinin sorunu
-- düz karartmaydı: fotoğrafın tamamı soldan sağa bastırılıyordu
-- (sol kenarda %72 siyah) ve model, ürün, ışık görünmüyordu.
-- Yeni hâlinde gradyan alttan yükseliyor, üst yarı temiz kalıyor,
-- kapak ekranın tamamını kaplıyor ve başlık 77 piksele çıkıyor.
--
-- Vitrin tarafı hazır ve canlıda; burada yalnızca seçim
-- değişiyor. Geri alınabilir: panelden "split"e dönülüyor.

update public.arc_store_themes t
   set config = coalesce(t.config, '{}'::jsonb)
                || jsonb_build_object('hero_style', 'editorial-orbs'),
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

  if v_deger is distinct from 'editorial-orbs' then
    raise exception 'Kapak düzeni yazılamadı: %', coalesce(v_deger, '(yok)');
  end if;

  raise notice 'ArvoCulture kapağı tam genişlik sinematik düzene geçti.';
end;
$$;
