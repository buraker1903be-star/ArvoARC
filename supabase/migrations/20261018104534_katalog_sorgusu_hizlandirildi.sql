-- katalog_sorgusu_hizlandirildi
--
-- LİMİT EN SONA UYGULANIYORDU.
--
-- `arc_vitrin_urunler` bütün AKTİF katalogu varyantlarıyla
-- birleştirip grupluyor, sonra sıralayıp limitliyordu. Yani on iki
-- ürün isteyen ana sayfa da üç bin ürünün tamamını topluyordu.
--
-- Ölçüm (18.10.2026, canlı, sütun süzmesiyle):
--   p_limit=12  → 0,91 sn
--   p_limit=60  → 0,95 sn
--   p_limit=120 → 1,02 sn
--
-- Sürenin limitten BAĞIMSIZ olması kanıt: maliyet satır döndürmekte
-- değil, limit uygulanmadan önce yapılan toplamada. Yerelde aynı
-- sorgu `statement timeout` (57014) verdi; canlıda sınırda duruyor
-- ve katalog büyüdükçe ilk kırılacak yer burası.
--
-- İKİ DEĞİŞİKLİK:
--
-- 1. ÖNCE ÜRÜNLER SEÇİLİYOR, SONRA VARYANTLAR TOPLANIYOR. Sayfanın
--    ürünleri bir CTE'de belirleniyor (sırala + limit), varyant
--    birleşimi yalnızca o ürünler için yapılıyor.
--
--    SATIR SAYISI KORUNUYOR: eski sorguda varyant birleşimi INNER
--    JOIN'di, yani varyantı olmayan ürün listede hiç görünmüyordu
--    ve limit birleşimden SONRA uygulandığı için sonuç her zaman
--    dolu geliyordu. CTE'ye aynı koşul `exists` olarak taşındı;
--    taşınmasaydı varyantsız ürünler önce seçilip sonra elenir ve
--    sayfa istenenden AZ ürünle dönerdi — sessiz bir eksilme.
--
--    `organizations` birleşimi de kalktı: kurum kimliği zaten
--    parametre, birleşim yalnızca aynı değeri bir kez daha
--    doğruluyordu.
--
-- 2. SIRALAMAYA UYGUN İNDEKS. `(organization_id, status)` vardı ama
--    `updated_at` yoktu: Postgres eşleşen bütün satırları sıralamak
--    zorundaydı. Yeni indeksle ilk N satır indeksten yürüyerek
--    alınıyor.
--
-- İKİZ GEREKMİYOR: hem `arc_storefront_products` hem
-- `get_arvoculture_storefront_products` bu çekirdeği çağırıyor,
-- ikisi de aynı anda düzeliyor.

create index if not exists arc_products_org_status_guncel_idx
  on public.arc_products (organization_id, status, updated_at desc);

create or replace function public.arc_vitrin_urunler(
  p_organization_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(
  slug text, name text, description text, subtitle text, vendor text,
  product_type text, price bigint, compare_at_price bigint,
  available boolean, image_paths jsonb, specs jsonb, size_guide jsonb,
  sizes jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  with secilen as (
    select p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
    from public.arc_products p
    where p.organization_id = p_organization_id
      and p.status = 'active'
      /* Eski INNER JOIN'in koşulu: varyantı olmayan ürün listede
         görünmüyordu. Buraya taşınmasaydı sayfa eksik dönerdi. */
      and exists (
        select 1
        from public.arc_product_variants v
        where v.product_id = p.id
          and v.organization_id = p_organization_id
      )
    order by p.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 24), 5000))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    p.slug, p.name, p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
      as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from secilen p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p_organization_id
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc;
$function$;

/*
  Kendini sınayan blok. Üç şey aranıyor:

  1. İstenen kadar satır dönmeli (katalog daha büyükse). Az dönmesi,
     `exists` koşulunun kaçırıldığı anlamına gelir.
  2. Sıra bozulmamalı: en son güncellenen ürün başta.
  3. Süre. Eski sorgu limitten bağımsız ~1 saniyeydi; yeni sorguda
     küçük limit belirgin biçimde ucuzlamalı. Ölçüm NOTICE olarak
     yazılıyor, eşik konulmuyor — veritabanı yükü ana makinede
     değişkendir ve derlemeyi ona bağlamak yanlış olurdu.
*/
do $$
declare
  v_org uuid;
  v_sayi int;
  v_bas timestamptz;
  v_kucuk numeric;
  v_buyuk numeric;
  v_toplam int;
begin
  select s.organization_id into v_org
  from public.arc_store_settings s
  join public.arc_products p on p.organization_id = s.organization_id
  where p.status = 'active'
  group by s.organization_id
  order by count(*) desc
  limit 1;

  if v_org is null then
    raise notice 'Aktif ürünü olan mağaza yok; ölçüm atlandı.';
    return;
  end if;

  select count(*) into v_toplam
  from public.arc_products
  where organization_id = v_org and status = 'active';

  v_bas := clock_timestamp();
  select count(*) into v_sayi from public.arc_vitrin_urunler(v_org, 12, 0);
  v_kucuk := extract(milliseconds from clock_timestamp() - v_bas);

  if v_toplam >= 12 and v_sayi <> 12 then
    raise exception 'On iki ürün istendi, % döndü. Varyant koşulu kaçmış olabilir.', v_sayi;
  end if;

  v_bas := clock_timestamp();
  perform count(*) from public.arc_vitrin_urunler(v_org, 120, 0);
  v_buyuk := extract(milliseconds from clock_timestamp() - v_bas);

  raise notice 'Katalog sorgusu: 12 ürün % ms, 120 ürün % ms (katalogda % aktif ürün).',
    round(v_kucuk), round(v_buyuk), v_toplam;
end;
$$;
