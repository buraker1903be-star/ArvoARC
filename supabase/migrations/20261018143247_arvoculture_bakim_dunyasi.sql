-- ArvoCulture: "Ana koleksiyonlar" bandının bakım dünyası.
--
-- Bölüm panelde 29.09.2026'dan beri duruyordu ve vitrin onu hiç
-- çizmiyordu; 18.10.2026'da vitrin tarafı yazıldı ve panele görsel
-- ile bağlantı alanları eklendi. Bu migration ArvoCulture'ın ilk
-- içeriğini koyuyor, yani bandın canlıda görünmesini sağlıyor.
--
-- GÖRSEL ŞİMDİLİK VİTRİN DEPOSUNDAN (`/dunya/l-recapin.jpg`).
-- Kategori görselleriyle aynı düzen. Panelden bir görsel
-- yüklendiği an tema o adrese geçer ve buradaki dosya kullanılmaz
-- olur — bu satır bir YEDEK değil, başlangıç değeri.
--
-- Giyim dünyası BİLEREK boş: görseli yok ve görselsiz dünya
-- çizilmiyor. Tek dünya kalınca bant tam genişlik oluyor.

update public.arc_store_themes t
   set config = coalesce(t.config, '{}'::jsonb)
                || jsonb_build_object(
                     'show_worlds', true,
                     'beauty_title', 'Dökülmeye karşı iki adım.',
                     'beauty_description',
                       'LR L-Recapin şampuan ve tonik: saç kökünü güçlendiren, her sabah iki dakikalık bir rutin.',
                     'beauty_href', '/koleksiyon/lr-l-recapin-sac-bakim-urunleri',
                     'beauty_image_url', '/dunya/l-recapin.jpg'
                   ),
       updated_at = now()
  from public.organizations o
 where o.id = t.organization_id
   and o.slug = 'arvoculture'
   and t.mode in ('published', 'draft');

do $$
declare
  v_config jsonb;
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

  select t.config into v_config
  from public.arc_store_themes t
  join public.organizations o on o.id = t.organization_id
  where o.slug = 'arvoculture' and t.mode = 'published'
  limit 1;

  if v_config is null then
    raise exception 'ArvoCulture yayın teması bulunamadı.';
  end if;

  /* Band ÜÇ alanın üçüne birden bağlı: biri eksikse vitrin bölümü
     hiç çizmiyor ve eksiğin nerede olduğu ekranda görünmüyor. */
  if coalesce(v_config ->> 'beauty_title', '') = ''
     or coalesce(v_config ->> 'beauty_image_url', '') = ''
     or (v_config ->> 'show_worlds') is distinct from 'true' then
    raise exception 'Bakım dünyası yazılamadı: %', v_config;
  end if;

  raise notice 'ArvoCulture bakım dünyası yazıldı (L-Recapin).';
end;
$$;
