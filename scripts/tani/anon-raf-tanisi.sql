-- ============================================================
-- TANI 2 — raf fonksiyonu ANON rolüyle ve zaman sınırıyla
--
-- Salt okunurdur. Supabase → SQL Editor'de TAMAMINI çalıştırın ve
-- çıkan tabloyu (ya da düşerse HATA METNİNİ) paylaşın.
--
-- Neden: fonksiyon SQL editöründe (postgres rolü, sınırsız süre)
-- 'erkek' için 200 satır döndürüyor, ama vitrin aynı çağrıda boş
-- liste alıyor. Vitrin anon anahtarıyla ve PostgREST üzerinden
-- çağırıyor; fark ya YETKİ ya SÜRE. Supabase anon rolüne kısa bir
-- statement_timeout veriyor.
--
-- Her satır kendi bloğunda: biri düşerse ötekiler yine görünür.
-- ============================================================

-- A) Anon bu fonksiyonu çağırabiliyor mu?
select
  'A: anon yetkisi' as ne,
  has_function_privilege('anon',
    'public.get_arvoculture_storefront_collection_products_page(text[],text[],integer,integer,text,text,bigint,boolean,boolean,text)',
    'EXECUTE')::text as sonuc;

-- B) Anon rolünün süre sınırı ne?
select 'B: anon statement_timeout' as ne,
       coalesce((select setconfig::text from pg_db_role_setting s
                   join pg_roles r on r.oid = s.setrole
                  where r.rolname = 'anon' limit 1), '(ayar yok)') as sonuc;

-- C) ANON rolüyle, anon'un süre sınırıyla: 'erkek' rafı.
--    Düşerse hata metni cevabın kendisidir.
do $$
declare
  t0 timestamptz := clock_timestamp();
  n integer;
begin
  set local role anon;
  perform set_config('statement_timeout', '3s', true);
  select count(*) into n from public.get_arvoculture_storefront_collection_products_page(
    array['erkek'], null, 24, 0, null, null, null, false, false, 'onerilen');
  raise notice 'C: erkek rafı (anon, 3s) = % satır, % ms', n,
    round(extract(milliseconds from clock_timestamp() - t0));
exception when others then
  raise notice 'C: erkek rafı (anon, 3s) DÜŞTÜ: % / %', sqlstate, sqlerrm;
end $$;

-- D) Aynısı ESKİ fonksiyonla: karşılaştırma.
do $$
declare
  t0 timestamptz := clock_timestamp();
  n integer;
begin
  set local role anon;
  perform set_config('statement_timeout', '3s', true);
  select count(*) into n from public.get_arvoculture_storefront_collection_products('erkek', null, 200);
  raise notice 'D: erkek rafı ESKİ (anon, 3s) = % satır, % ms', n,
    round(extract(milliseconds from clock_timestamp() - t0));
exception when others then
  raise notice 'D: erkek rafı ESKİ (anon, 3s) DÜŞTÜ: % / %', sqlstate, sqlerrm;
end $$;

-- E) Giyim grupları (en ağır küme, ~3.200 ürün).
do $$
declare
  t0 timestamptz := clock_timestamp();
  n integer;
begin
  set local role anon;
  perform set_config('statement_timeout', '3s', true);
  select count(*) into n from public.get_arvoculture_storefront_collection_products_page(
    null, array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'],
    24, 0, null, null, null, false, false, 'onerilen');
  raise notice 'E: giyim grupları (anon, 3s) = % satır, % ms', n,
    round(extract(milliseconds from clock_timestamp() - t0));
exception when others then
  raise notice 'E: giyim grupları (anon, 3s) DÜŞTÜ: % / %', sqlstate, sqlerrm;
end $$;
