-- ============================================================
-- TANI 4 — ağırlık hangi parçada? (süre sınırını zorlamadan)
--
-- Önceki denemede statement_timeout'u 120 sn'ye çıkarmak işe
-- yaramadı; sınır Supabase tarafından dayatılıyor ve sorgu yine
-- düştü. Bu yüzden artık süre ölçmüyoruz: parçaları TEK TEK
-- çalıştırıp hangisinin sınırı aştığına bakıyoruz. Düşen sorgu
-- cevabın kendisi.
--
-- Salt okunurdur. Dört sorgu var; HER BİRİNİ AYRI AYRI çalıştırın
-- (editörde seçip Run) ve hangisi döndü, hangisi düştü yazın.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- 1) SAYFA: süzgeç seçenekleri çıkarılmış hâli. Dönerse,
--    ağırlık facet hesabındadır ve fonksiyon ikiye ayrılacak.
-- ─────────────────────────────────────────────────────────
with base as (
  select p.id, p.slug,
         min(v.price) as price,
         min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
         bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available,
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
        and (c.metadata ->> 'menu_group') = any (array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'])
    )
  group by p.id
)
select '1 sayfa (facet yok)' as parca, count(*) over () as toplam, slug
from base
order by (case when available then 0 else 1 end), updated_at desc
limit 3;

-- ─────────────────────────────────────────────────────────
-- 2) BEDEN TOPLAMASI: yalnızca sizes alanı. Fonksiyonun hem
--    satırlarında hem facet'inde bu var ve distinct toplama.
-- ─────────────────────────────────────────────────────────
select '2 beden toplaması' as parca, count(*) as urun
from (
  select p.id,
         coalesce(jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
           filter (where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
                     and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)), '[]'::jsonb) as sizes
  from public.arc_products p
  join public.arc_product_variants v on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o on o.id = p.organization_id and o.slug = 'arvoculture'
  where p.status = 'active'
    and exists (
      select 1 from public.arc_collection_products cp
      join public.arc_collections c
        on c.id = cp.collection_id and c.organization_id = cp.organization_id and c.status = 'active'
      where cp.product_id = p.id and cp.organization_id = p.organization_id
        and (c.metadata ->> 'menu_group') = any (array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'])
    )
  group by p.id
) q;

-- ─────────────────────────────────────────────────────────
-- 3) YALNIZCA ÜYELİK: kaç ürün bu gruplarda? EXISTS'in kendisi
--    pahalı mı?
-- ─────────────────────────────────────────────────────────
select '3 üyelik' as parca, count(*) as urun
from public.arc_products p
join public.organizations o on o.id = p.organization_id and o.slug = 'arvoculture'
where p.status = 'active'
  and exists (
    select 1 from public.arc_collection_products cp
    join public.arc_collections c
      on c.id = cp.collection_id and c.organization_id = cp.organization_id and c.status = 'active'
    where cp.product_id = p.id and cp.organization_id = p.organization_id
      and (c.metadata ->> 'menu_group') = any (array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'])
  );

-- ─────────────────────────────────────────────────────────
-- 4) PLAN (çalıştırmadan): fonksiyonun tam sorgusu neye benziyor?
--    `explain` ANALYZE'sız çalıştığı için düşmez.
-- ─────────────────────────────────────────────────────────
explain
select * from public.get_arvoculture_storefront_collection_products_page(
  null, array['Giyim','Üst Giyim','Alt Giyim','Dış Giyim','Alt Üst Takım','İç Giyim','Çocuk'],
  24, 0, null, null, null, false, false, 'onerilen');
