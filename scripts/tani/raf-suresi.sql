-- ============================================================
-- TANI 3 — raf sorgusu NE KADAR sürüyor ve ağırlık nerede?
--
-- Salt okunurdur. Supabase → SQL Editor'de TAMAMINI çalıştırın,
-- "Messages/Notices" sekmesindeki satırları paylaşın.
--
-- Süre sınırı bilerek 120 sn'ye çıkarılıyor: amaç düşmesini
-- engellemek değil, GERÇEK süreyi görmek. Üç ölçüm:
--   A) raf fonksiyonu (giyim grupları)
--   B) katalog sayfası fonksiyonu — çalışan karşılaştırma
--   C) raf sorgusunun süzgeç seçenekleri (facet) ÇIKARILMIŞ hâli
-- ============================================================
do $$
declare
  t0 timestamptz;
  n bigint;
  gruplar text[] := array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'];
begin
  perform set_config('statement_timeout', '120s', true);

  -- A) Raf fonksiyonu, olduğu gibi
  t0 := clock_timestamp();
  select count(*) into n from public.get_arvoculture_storefront_collection_products_page(
    null, gruplar, 24, 0, null, null, null, false, false, 'onerilen');
  raise notice 'A raf fonksiyonu       : % satır, % ms', n, round(extract(milliseconds from clock_timestamp() - t0));

  -- B) Katalog sayfası fonksiyonu (3.407 ürün) — çalışan karşılaştırma
  t0 := clock_timestamp();
  select count(*) into n from public.get_arvoculture_storefront_products_page(
    24, 0, null, null, null, false, false, 'onerilen');
  raise notice 'B katalog fonksiyonu   : % satır, % ms', n, round(extract(milliseconds from clock_timestamp() - t0));

  -- C) Aynı raf sorgusu, süzgeç seçenekleri çıkarılmış
  t0 := clock_timestamp();
  select count(*) into n from (
    with base as (
      select p.slug, min(v.price) as price,
             min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
             bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available,
             coalesce(jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
               filter (where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
                         and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)), '[]'::jsonb) as sizes,
             p.updated_at
      from public.arc_products p
      join public.arc_product_variants v on v.product_id = p.id and v.organization_id = p.organization_id
      join public.organizations o on o.id = p.organization_id and o.slug = 'arvoculture'
      where p.status = 'active'
        and exists (
          select 1 from public.arc_collection_products cp
          join public.arc_collections c
            on c.id = cp.collection_id and c.organization_id = cp.organization_id and c.status = 'active'
          where cp.product_id = p.id and cp.organization_id = p.organization_id
            and (c.metadata ->> 'menu_group') = any (gruplar)
        )
      group by p.id
    )
    select slug, count(*) over () as total_count from base
    order by (case when available then 0 else 1 end) asc, updated_at desc
    limit 24
  ) q;
  raise notice 'C facet çıkarılmış hâli: % satır, % ms', n, round(extract(milliseconds from clock_timestamp() - t0));
exception when others then
  raise notice 'DÜŞTÜ: % / %', sqlstate, sqlerrm;
end $$;
