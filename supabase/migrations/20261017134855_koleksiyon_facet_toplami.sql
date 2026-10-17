-- koleksiyon_facet_toplami
--
-- SÜZGEÇ YOKKEN BAŞLIK "3.225 / 3.228 ÜRÜN" DİYORDU.
--
-- Koleksiyon rafı ikiye ayrıldığında (20261017133904) süzgeçsiz
-- toplam, seçenekler fonksiyonundan gelmeye başladı. İki fonksiyon
-- aynı kümeyi saymıyordu: raf sorgusu varyant tablosuna INNER JOIN
-- ile bağlı (varyantı olmayan ürünün sayfası da yok), seçenekler
-- fonksiyonu ise varyant aramıyordu.
--
-- Sonuç, hiçbir süzgeç seçili olmadığı hâlde "N / M ürün" biçiminde
-- bir başlıktı: vitrin bu biçimi yalnızca liste daraldığında
-- kullanıyor, yani müşteriye olmayan bir süzgeci haber veriyordu.
-- Canlıda ölçüldü (17.10.2026): giyimde 3, kadında 2, çocukta 1
-- ürün bu yüzden fazla sayılıyordu.
--
-- Sayaç artık rafın saydığı kümeyi sayıyor.

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  /*
    SÜZGEÇ SEÇENEKLERİ AYRI ÇAĞRIDA (17.10.2026).

    Marka ve beden listesi koleksiyonun TAMAMI üzerinden
    hesaplanıyor; beden toplaması `jsonb_agg(distinct …)` ile grup
    başına sıralama gerektiriyor ve ağır kümede (giyim ~3.250 ürün,
    ~15.000 varyant) anon rolünün süre sınırını aşıyordu. Sayfa
    sorgusunun içinde dururken her sayfa görüntülemesinde yeniden
    hesaplanıyordu.

    Katalog sayfası zaten böyle çalışıyor: seçenekler
    get_arvoculture_storefront_facets'ten geliyor ve vitrin onu
    beş dakika önbellekte tutuyor. Koleksiyon rafı da aynı düzene
    geçti.

    Seçenekler SÜZGEÇTEN ÖNCEKİ kümeden: "Beden: XL" seçildiğinde
    marka listesi yalnızca XL'i olan markalara inmemeli, yoksa
    müşteri seçimini genişletemez.
  */
  with uyeler as (
    select p.id, p.organization_id,
           coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor
    from public.arc_products p
    join public.organizations o
      on o.id = p.organization_id and o.slug = 'arvoculture'
    where p.status = 'active'
      /*
        VARYANTI OLMAYAN ÜRÜN SAYILMIYOR (17.10.2026).

        Raf sorgusu varyant tablosuna INNER JOIN ile bağlı, yani
        varyantı olmayan ürünü hiç göstermiyor; bu sayaç ise onları
        da sayıyordu. Sonuç, süzgeç yokken bile "3.225 / 3.228 ürün"
        gibi bir başlıktı — müşteriye bir süzgecin listeyi
        daralttığını söylüyor, oysa daraltan bir şey yok. Canlıda
        ölçüldü: giyimde 3, kadında 2, çocukta 1 ürün.
      */
      and exists (
        select 1
        from public.arc_product_variants v
        where v.product_id = p.id
          and v.organization_id = p.organization_id
      )
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
  ),
  fiyat as (
    select u.id, min(v.price) as price
    from uyeler u
    join public.arc_product_variants v
      on v.product_id = u.id and v.organization_id = u.organization_id
    group by u.id
  )
  select
    coalesce((select jsonb_agg(distinct u.vendor) from uyeler u where u.vendor <> ''), '[]'::jsonb) as brands,
    coalesce((
      select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
      from uyeler u
      join public.arc_product_variants v
        on v.product_id = u.id and v.organization_id = u.organization_id
      where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    ), '[]'::jsonb) as sizes,
    coalesce((select max(price) from fiyat), 0)::bigint as max_price,
    (select count(*) from uyeler)::bigint as total_count;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_facets(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  /*
    SÜZGEÇ SEÇENEKLERİ AYRI ÇAĞRIDA (17.10.2026).

    Marka ve beden listesi koleksiyonun TAMAMI üzerinden
    hesaplanıyor; beden toplaması `jsonb_agg(distinct …)` ile grup
    başına sıralama gerektiriyor ve ağır kümede (giyim ~3.250 ürün,
    ~15.000 varyant) anon rolünün süre sınırını aşıyordu. Sayfa
    sorgusunun içinde dururken her sayfa görüntülemesinde yeniden
    hesaplanıyordu.

    Katalog sayfası zaten böyle çalışıyor: seçenekler
    get_arvoculture_storefront_facets'ten geliyor ve vitrin onu
    beş dakika önbellekte tutuyor. Koleksiyon rafı da aynı düzene
    geçti.

    Seçenekler SÜZGEÇTEN ÖNCEKİ kümeden: "Beden: XL" seçildiğinde
    marka listesi yalnızca XL'i olan markalara inmemeli, yoksa
    müşteri seçimini genişletemez.
  */
  with uyeler as (
    select p.id, p.organization_id,
           coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor
    from public.arc_products p
    join public.organizations o
      on o.id = p.organization_id and o.id = public.arc_storefront_org(p_host)
    where p.status = 'active'
      /*
        VARYANTI OLMAYAN ÜRÜN SAYILMIYOR (17.10.2026).

        Raf sorgusu varyant tablosuna INNER JOIN ile bağlı, yani
        varyantı olmayan ürünü hiç göstermiyor; bu sayaç ise onları
        da sayıyordu. Sonuç, süzgeç yokken bile "3.225 / 3.228 ürün"
        gibi bir başlıktı — müşteriye bir süzgecin listeyi
        daralttığını söylüyor, oysa daraltan bir şey yok. Canlıda
        ölçüldü: giyimde 3, kadında 2, çocukta 1 ürün.
      */
      and exists (
        select 1
        from public.arc_product_variants v
        where v.product_id = p.id
          and v.organization_id = p.organization_id
      )
      and exists (
        select 1
        from public.arc_collection_products cp
        join public.arc_collections c
          on c.id = cp.collection_id
         and c.organization_id = cp.organization_id
         and c.status = 'active'
        where cp.product_id = p.id
          and cp.organization_id = p.organization_id
          and (
            (p_collection_slugs is not null and c.slug = any (p_collection_slugs))
            or (
              p_menu_groups is not null
              and (c.metadata ->> 'menu_group') = any (p_menu_groups)
            )
          )
      )
  ),
  fiyat as (
    select u.id, min(v.price) as price
    from uyeler u
    join public.arc_product_variants v
      on v.product_id = u.id and v.organization_id = u.organization_id
    group by u.id
  )
  select
    coalesce((select jsonb_agg(distinct u.vendor) from uyeler u where u.vendor <> ''), '[]'::jsonb) as brands,
    coalesce((
      select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
      from uyeler u
      join public.arc_product_variants v
        on v.product_id = u.id and v.organization_id = u.organization_id
      where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    ), '[]'::jsonb) as sizes,
    coalesce((select max(price) from fiyat), 0)::bigint as max_price,
    (select count(*) from uyeler)::bigint as total_count;
$function$
;
