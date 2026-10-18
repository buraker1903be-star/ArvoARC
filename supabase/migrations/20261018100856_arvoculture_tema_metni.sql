-- arvoculture_tema_metni
--
-- ARVOCULTURE'IN METNİ KENDİ SATIRINA TAŞINIYOR.
--
-- Vitrinin tema okuması ANAHTAR BAŞINA yedeğe düşüyor: mağazanın
-- kaydında olmayan her alan `lib/storefront-theme.ts`'teki
-- `defaultTheme` sabitinden geliyor. O sabit ArvoCulture'ın kendi
-- pazarlama metni — içinde ARVO10 kupon kodu, "2.000 TL üzeri
-- ücretsiz kargo" vaadi ve onların Shopify CDN'indeki hero görseli
-- var. Teması olmayan ikinci bir kiracı bunları OLDUĞU GİBİ
-- gösteriyor: başka bir mağazanın kuponunu ve kargo eşiğini
-- müşterisine vaat etmiş oluyor.
--
-- Sabit yansızlaştırılacak. ArvoCulture'ın kaydında 21 anahtar var,
-- varsayılanda kırk kadar; aradaki fark bugün yedekten geliyor.
-- Ama o farkın ÇOĞU VİTRİNDE HİÇ ÇİZİLMİYOR: manifest_*,
-- apparel_*, beauty_*, trust_* ve show_* alanları tipte ve
-- varsayılanda duruyor, hiçbir bileşen okumuyor (18.10.2026'da
-- arandı). Gerçekten çizilen ve yedekten gelen yalnızca iki alan:
--
--   hero_image_url  — ana sayfanın kapak görseli
--   footer_tagline  — altbilgideki tanıtım cümlesi
--
-- Bu ikisi taşınmazsa sabit temizlendiğinde ArvoCulture'ın kapak
-- görseli ve altbilgi cümlesi kaybolur. Taşındıktan sonra görünen
-- hiçbir şey değişmiyor; yalnızca kaynağı değişiyor.
--
-- YALNIZCA EKSİK ANAHTARLAR. `||` sağdaki değeri üste yazar, o
-- yüzden mevcut config SAĞDA: panelden düzenlenmiş bir değer geri
-- alınmıyor ve migration ikinci kez çalıştırılabiliyor.

update public.arc_store_themes t
   set config =
         jsonb_build_object(
           'hero_image_url',
           'https://cdn.shopify.com/s/files/1/0995/6740/3322/files/uN9qiyIinOoNTblcW4xwy_xsN8HDzN_00001.png?v=1782830698&width=1920',
           'footer_tagline',
           'Giyim, bakım ve gündelik ritüeller için seçilmiş bir yaşam kültürü.'
         ) || coalesce(t.config, '{}'::jsonb),
       updated_at = now()
  from public.organizations o
 where o.id = t.organization_id
   and o.slug = 'arvoculture';

/*
  Kendini sınayan blok: taşıma sonrası iki anahtar da kayıtta
  olmalı. Biri eksik kalırsa kod sabiti yansızlaştırıldığında o
  alan sessizce boşalır — kapak görseli olmayan bir ana sayfa ya
  da tanıtım cümlesi olmayan bir altbilgi.
*/
do $$
declare
  v_config jsonb;
  v_eksik text[];
begin
  select t.config into v_config
  from public.arc_store_themes t
  join public.organizations o on o.id = t.organization_id
  where o.slug = 'arvoculture'
  limit 1;

  if v_config is null then
    raise notice 'ArvoCulture temasında satır yok; taşıma atlandı.';
    return;
  end if;

  select array_agg(k) into v_eksik
  from unnest(array['hero_image_url', 'footer_tagline']) k
  where not (v_config ? k);

  if v_eksik is not null then
    raise exception 'Taşınamayan anahtarlar: %', v_eksik;
  end if;

  raise notice 'ArvoCulture tema metni kendi kaydında (% anahtar).',
    (select count(*) from jsonb_object_keys(v_config));
end;
$$;
