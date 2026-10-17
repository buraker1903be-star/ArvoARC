-- vitrin_birincil_adres
--
-- MAĞAZANIN BİRİNCİL ADRESİ.
--
-- Vitrin çok mağazalı olunca bir mağaza İKİ adresten açılabiliyor:
-- kendi alan adı (arvoculture.com) ve platform alt alan adı
-- (arvoculture.shop.arvo-os.com). İkisi de aynı sayfaları veriyor.
--
-- Kanonik adres isteğin geldiği adresten kurulsaydı, her iki adres
-- de kendini kanonik ilan ederdi: arama motoru için YİNELENEN
-- İÇERİK. Aynı sorun site haritasında ve robots'ta da çıkar —
-- "bu adresleri indeksle" diyen iki ayrı dosya.
--
-- Bu fonksiyon "hangi adresten gelirsen gel, bu mağazanın asıl
-- adresi şu" sorusunu yanıtlıyor. Sıra bilinçli: doğrulanmış kendi
-- alan adı > platform alt alan adı. Kendi alan adını bağlamış bir
-- mağazanın markası onun alan adıdır; platform adresi teknik bir
-- yedek.
--
-- Eşleşme yoksa null: vitrin o durumda zaten mağaza bulamıyor.

create or replace function public.arc_storefront_primary_host(p_host text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when s.domain_verified_at is not null and s.custom_domain is not null
             then lower(s.custom_domain)
           when s.platform_subdomain is not null
             then lower(s.platform_subdomain) || '.shop.arvo-os.com'
           else null
         end
  from public.arc_store_settings s
  where s.organization_id = public.arc_storefront_org(p_host)
  limit 1;
$$;

/*
  Vitrin bunu tarayıcıya açık anahtarla çağırıyor; adres zaten
  herkese görünür bir bilgi. Yine de Postgres'in PUBLIC varsayılanı
  ve Supabase'in anon yetkisi kaldırılıp yalnızca gerekenler
  veriliyor.
*/
revoke all on function public.arc_storefront_primary_host(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_primary_host(text) to anon, authenticated, service_role;

/*
  Kendini sınayan blok: adresi olan bir mağaza varsa, o adresten
  sorulduğunda birincil adres dönmeli ve boş olmamalı.
*/
do $$
declare
  v_konak text;
  v_birincil text;
begin
  select coalesce(
           case when domain_verified_at is not null then custom_domain end,
           platform_subdomain || '.shop.arvo-os.com'
         )
    into v_konak
  from public.arc_store_settings
  where (domain_verified_at is not null and custom_domain is not null)
     or platform_subdomain is not null
  limit 1;

  if v_konak is null then
    raise notice 'Adresi olan mağaza yok; doğrulama atlandı.';
    return;
  end if;

  v_birincil := public.arc_storefront_primary_host(v_konak);
  if v_birincil is null then
    raise exception 'Birincil adres çözülemedi (sorulan: %).', v_konak;
  end if;

  if public.arc_storefront_primary_host('bilinmeyen-adres.example') is not null then
    raise exception 'Tanınmayan adres için null dönmedi.';
  end if;

  raise notice 'Birincil adres hazır: % → %', v_konak, v_birincil;
end;
$$;
