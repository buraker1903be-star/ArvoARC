-- vitrin_govdeleri_tek_yerde
--
-- ON BEŞ ÇİFT DAHA TEK GÖVDEYE İNDİ.
--
-- 20261017141416 ile pilot yapılan desen (koleksiyon listesi)
-- ailenin geri kalanına uygulanıyor: gövde
-- `arc_vitrin_*(p_organization_id, …)` içinde BİR KEZ duruyor, çok
-- kiracılı `arc_storefront_*` ve ArvoCulture'a özel
-- `get_arvoculture_storefront_*` ince sarmalayıcıya iniyor.
--
-- NEDEN: 18 çift, yani her değişiklik iki kez yapılmak zorundaydı ve
-- 17.10.2026'da üç kez yapılmadı — arama dizini ile sitemap'in
-- sayfalaması ve varyant listesinin sınırı çok kiracılı ailede eski
-- kalmıştı. Üçü de "hata yok, eksik veri var" sınıfından: liste
-- sessizce kesiliyor. İkinci kiracı açılırken müşteri satın
-- alabildiği ürünü arayıp bulamayacaktı.
--
-- `npm run check:ikizler` ayrışmayı bugünden yakalıyor; bu migration
-- ayrışmanın mümkün olduğu yeri ortadan kaldırıyor.
--
-- GÖVDELER MEKANİK TAŞINDI. Kanonik olan ArvoCulture gövdesi
-- (vitrinin bugün çağırdığı); tek değişiklik kiracı kısıtının
-- parametreye bağlanması:
--   `o.slug = 'arvoculture'`  →  `o.id = p_organization_id`
-- Sarmalayıcıların adı, imzası, parametre adları ve dönüş tipi
-- AYNI kaldı — PostgREST çağrıları adlandırılmış parametreyle
-- gidiyor, bir ad değişse vitrin kırılırdı. Vitrin kodu
-- değişmiyor.
--
-- ÇEKİRDEKLER ANON'A KAPALI. Kurum kimliğini parametre alıyorlar;
-- anon'a açık kalsa tarayıcıdan başka bir mağazanın kimliği
-- geçilip verisi okunabilir, yani kiracı çözümü tamamen atlanırdı.
-- "revoke … from public" YETMİYOR: Supabase'in varsayılanı yeni
-- fonksiyonu doğrudan anon'a açık doğuruyor (19.09.2026'da ArvoARC'ta
-- siparişi "ödendi" yapan fonksiyon bu yüzden açık kalmıştı), bu
-- yüzden anon ve authenticated açıkça geri alınıyor.
-- tests/db/kiraci-sizintisi.test.mjs bunu veritabanından okuyarak
-- sınıyor, yani eklenen her çekirdeği kendiliğinden kapsıyor.
--
-- DIŞARIDA KALANLAR: kupon ve sipariş oluşturma zaten ortak gövde
-- kullanıyor (arc_check_coupon, arc_create_storefront_order). İade
-- talebi ikizi birebir aynı ama yazan ve oturum gerektiren bir
-- fonksiyon; ayrı bir adımda ele alınacak.

CREATE OR REPLACE FUNCTION public.arc_vitrin_koleksiyon_secenekleri(p_organization_id uuid, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
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
      on o.id = p.organization_id and o.id = p_organization_id
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
  select * from public.arc_vitrin_koleksiyon_secenekleri(public.arc_storefront_org(p_host), p_collection_slugs, p_menu_groups);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_facets(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[])
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_secenekleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slugs, p_menu_groups);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_koleksiyon_urunleri(p_organization_id uuid, p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and (public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = p_organization_id
  join public.arc_collection_products cp
    on cp.product_id = p.id
  join public.arc_collections c
    on c.id = cp.collection_id
   and c.status = 'active'
  where p.status = 'active'
    and (
      (p_collection_slug is not null and c.slug = p_collection_slug)
      or (
        p_menu_groups is not null
        and (c.metadata ->> 'menu_group') = any (p_menu_groups)
      )
    )
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 5000));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products(p_host text, p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_urunleri(public.arc_storefront_org(p_host), p_collection_slug, p_menu_groups, p_limit);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products(p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_urunleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slug, p_menu_groups, p_limit);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_koleksiyon_sayfasi(p_organization_id uuid, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with aday as (
    /*
      UCUZ TOPLAMA. Yalnızca sıralama ve süzme için gereken üç
      toplam: en düşük fiyat, indirim karşılaştırması ve
      satılabilirlik. Beden listesi BURADA YOK — `jsonb_agg(distinct …)`
      koleksiyonun bütün varyantları üzerinde grup başına sıralama
      yapıyor ve ağır kümede anon rolünün süre sınırını aşan parça
      buydu (canlıda 57014). Beden yalnızca sayfaya giren 24 ürün
      için, aşağıda hesaplanıyor.
    */
    select
      p.id,
      p.slug,
      p.updated_at,
      min(v.price) as price,
      min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
      bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available
    from public.arc_products p
    join public.arc_product_variants v
      on v.product_id = p.id and v.organization_id = p.organization_id
    join public.organizations o
      on o.id = p.organization_id and o.id = p_organization_id
    where p.status = 'active'
      /* Koleksiyon üyeliği ürün başına bir kez: JOIN satırları
         varyant × koleksiyon kadar çoğaltıyordu. */
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
      /* Marka süzgeci toplamadan önce: ürün üstverisinde duruyor. */
      and (nullif(p_brand, '') is null or coalesce(p.metadata ->> 'vendor', 'ARVO') = p_brand)
      /*
        BEDEN SÜZGECİ DE EXISTS. Beden listesini toplayıp içinde
        aramak yerine "böyle bir varyant var mı" diye soruyor;
        sonuç aynı, maliyet grup başına sıralama değil.
      */
      and (
        nullif(p_size, '') is null
        or exists (
          select 1
          from public.arc_product_variants v2
          where v2.product_id = p.id
            and v2.organization_id = p.organization_id
            and upper(trim(split_part(v2.title, '/', 2))) = upper(trim(p_size))
            and public.arc_variant_available(v2.stock, v2.allow_backorder, v2.supplier)
        )
      )
    group by p.id
  ),
  puanli as (
    select
      a.*,
      case
        when a.compare_at_price is not null and a.compare_at_price > a.price
          then round(100.0 * (a.compare_at_price - a.price) / a.compare_at_price)::int
        else 0
      end as discount_percent
    from aday a
  ),
  suzulmus as (
    select * from puanli
    where (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
      and (not coalesce(p_only_available, false) or available)
      and (not coalesce(p_only_discounted, false) or discount_percent > 0)
  ),
  sayfa as (
    select s.*, count(*) over () as total_count
    from suzulmus s
    order by
      case when p_sort = 'ucuz'    then s.price            end asc  nulls last,
      case when p_sort = 'pahali'  then s.price            end desc nulls last,
      case when p_sort = 'indirim' then s.discount_percent end desc nulls last,
      case when p_sort = 'yeni'    then s.updated_at       end desc nulls last,
      -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then (case when s.available then 0 else 1 end) end asc  nulls last,
      case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
           then s.discount_percent end desc nulls last,
      s.updated_at desc,
      s.slug
    limit  greatest(1, least(coalesce(p_limit, 24), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    sf.slug,
    p.name,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    sf.price,
    sf.compare_at_price,
    sf.available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    /* Beden listesi yalnızca bu sayfanın ürünleri için. */
    coalesce(b.sizes, '[]'::jsonb) as sizes,
    sf.total_count
  from sayfa sf
  join public.arc_products p on p.id = sf.id
  left join lateral (
    select jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2)))) as sizes
    from public.arc_product_variants v
    where v.product_id = sf.id
      and v.organization_id = p.organization_id
      and trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
      and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  ) b on true
  order by
    case when p_sort = 'ucuz'    then sf.price            end asc  nulls last,
    case when p_sort = 'pahali'  then sf.price            end desc nulls last,
    case when p_sort = 'indirim' then sf.discount_percent end desc nulls last,
    case when p_sort = 'yeni'    then sf.updated_at       end desc nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then (case when sf.available then 0 else 1 end) end asc  nulls last,
    case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
         then sf.discount_percent end desc nulls last,
    sf.updated_at desc,
    sf.slug;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products_page(p_host text, p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_sayfasi(public.arc_storefront_org(p_host), p_collection_slugs, p_menu_groups, p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products_page(p_collection_slugs text[] DEFAULT NULL::text[], p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyon_sayfasi(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_collection_slugs, p_menu_groups, p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_firsatlar(p_organization_id uuid, p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths,
    coalesce(p.metadata -> 'specs', '[]'::jsonb) as specs,
    coalesce(p.metadata -> 'size_guide', '[]'::jsonb) as size_guide
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = p_organization_id
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata
  -- Yalnızca gerçekten indirimli ve stokta olanlar.
  having min(v.compare_at_price) filter (where v.compare_at_price > v.price)
         is not null
     and bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier))
  -- En yüksek indirim oranı başta.
  order by
    (
      min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      - min(v.price)
    )::numeric
    / nullif(
        min(v.compare_at_price) filter (where v.compare_at_price > v.price),
        0
      ) desc
  limit greatest(1, least(coalesce(p_limit, 12), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_deals(p_host text, p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_firsatlar(public.arc_storefront_org(p_host), p_limit);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_deals(p_limit integer DEFAULT 12)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_firsatlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_indirimler(p_organization_id uuid)
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d.id,d.name,d.code,d.discount_type,d.value,d.minimum_subtotal,d.combinable,
    coalesce(nullif(d.metadata ->> 'badge', ''), d.name) as badge
  from public.arc_discounts d
  join public.organizations o on o.id=d.organization_id
  where o.id = p_organization_id and d.status='active'
    and (d.starts_at is null or d.starts_at<=now())
    and (d.ends_at is null or d.ends_at>now())
    and (d.usage_limit is null or d.usage_count<d.usage_limit)
  order by d.code nulls first,d.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_discounts(p_host text)
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_indirimler(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_discounts()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, value bigint, minimum_subtotal bigint, combinable boolean, badge text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_indirimler(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_secenekler(p_organization_id uuid)
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    min(v.price) as price,
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = p_organization_id
  where p.status = 'active'
  group by p.id, p.metadata
)
select
  (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
     from (select distinct vendor as v from base where vendor <> '') b1) as brands,
  (select coalesce(jsonb_agg(s order by s), '[]'::jsonb)
     from (select distinct e as s
             from base, lateral jsonb_array_elements_text(base.sizes) e) b2) as sizes,
  (select coalesce(max(price), 0) from base) as max_price,
  (select count(*) from base) as total_count;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_facets(p_host text)
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_secenekler(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_facets()
 RETURNS TABLE(brands jsonb, sizes jsonb, max_price bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_secenekler(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urun(p_organization_id uuid, p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    p.description,
    coalesce(
      nullif(p.metadata ->> 'subtitle', ''),
      left(regexp_replace(coalesce(p.description, ''), '<[^>]*>', '', 'g'), 140)
    ) as subtitle,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price) as compare_at_price,
    bool_or(public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)) as available,
    coalesce(p.metadata -> 'image_paths', '[]'::jsonb) as image_paths
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = p_organization_id
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_product(p_host text, p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun(public.arc_storefront_org(p_host), p_slug);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product(p_slug text)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_slug);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urun_rozetleri(p_organization_id uuid)
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    nullif(p.metadata ->> 'badge', '') as badge,
    coalesce(nullif(p.metadata ->> 'badge_tone', ''), 'green') as badge_tone,
    exists (
      select 1
      from public.arc_collection_products cp
      join public.arc_collections c
        on c.id = cp.collection_id
       and c.organization_id = cp.organization_id
      where cp.organization_id = p.organization_id
        and cp.product_id = p.id
        and c.status = 'active'
        and c.title = 'Çok Satanlar'
    ) as is_best_seller,
    coalesce((
      select max(
        round(
          (1 - v.price::numeric / nullif(v.compare_at_price, 0)::numeric) * 100
        )
      )::integer
      from public.arc_product_variants v
      where v.organization_id = p.organization_id
        and v.product_id = p.id
        and v.compare_at_price > v.price
        and v.price >= 0
    ), 0) as discount_percent
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id
   and o.id = p_organization_id
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_product_badges(p_host text)
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_rozetleri(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_badges()
 RETURNS TABLE(slug text, badge text, badge_tone text, is_best_seller boolean, discount_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_rozetleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urun_sayisi(p_organization_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(distinct p.id)::integer
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id
   and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id
   and o.id = p_organization_id
  where p.status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_product_count(p_host text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_urun_sayisi(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.arc_vitrin_urun_sayisi(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urun_adresleri(p_organization_id uuid, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.slug, p.updated_at
  from public.arc_products p
  join public.organizations o
    on o.id = p.organization_id and o.id = p_organization_id
  where p.status = 'active'
    /*
      Varyantı olmayan ürünün sayfası da yok; sitemap'e girmemeli.
      Ama varyantları toplamaya gerek yok — varlık kontrolü yeter.
      Asıl fonksiyon burada group by yapıp fiyat ve beden
      hesaplıyor, sitemap ise hiçbirini kullanmıyor.
    */
    /*
      SATILABİLİR VARYANTI OLMAYAN ÜRÜN SITEMAP'E GİRMEZ (17.10.2026).
      Ürün sayfası stok yokken `noindex` veriyor (vitrin:
      robots.index = product.available !== false), sitemap ise aynı
      adresi "indeksle" diye bildiriyordu. 3.407 ürünün 508'i bu
      durumdaydı: Search Console bunları "noindex olarak işaretlenmiş
      gönderilmiş URL" diye raporluyor ve tarama bütçesi boşa
      gidiyor. Stok gelince ikisi birlikte geri dönüyor.
    */
    and exists (
      select 1
      from public.arc_product_variants v
      where v.product_id = p.id
        and v.organization_id = p.organization_id
        and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
    )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_product_slugs(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_adresleri(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product_slugs(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_adresleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urunler(p_organization_id uuid, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = p_organization_id
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_products(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urunler(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, description text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, specs jsonb, size_guide jsonb, sizes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urunler(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_urun_sayfasi(p_organization_id uuid, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with base as (
  select
    p.slug,
    p.name,
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
    coalesce(
      jsonb_agg(distinct upper(trim(split_part(v.title, '/', 2))))
        filter (
          where trim(coalesce(split_part(v.title, '/', 2), '')) <> ''
            and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
        ),
      '[]'::jsonb
    ) as sizes,
    p.updated_at
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = p_organization_id
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.description, p.metadata, p.updated_at
),
scored as (
  select
    b.*,
    case
      when b.compare_at_price is not null and b.compare_at_price > b.price
        then round(100.0 * (b.compare_at_price - b.price) / b.compare_at_price)::int
      else 0
    end as discount_percent
  from base b
),
narrowed as (
  select * from scored
  where (nullif(p_brand, '') is null or vendor = p_brand)
    and (coalesce(p_max_price, 0) <= 0 or price <= p_max_price)
    and (not coalesce(p_only_available, false) or available)
    and (nullif(p_size, '') is null or sizes ? upper(p_size))
    and (not coalesce(p_only_discounted, false) or discount_percent > 0)
)
select
  slug, name, subtitle, vendor, product_type,
  price, compare_at_price, available, image_paths, sizes,
  count(*) over () as total_count
from narrowed
order by
  case when p_sort = 'ucuz'    then price            end asc  nulls last,
  case when p_sort = 'pahali'  then price            end desc nulls last,
  case when p_sort = 'indirim' then discount_percent end desc nulls last,
  case when p_sort = 'yeni'    then updated_at       end desc nulls last,
  -- Önerilen (varsayılan): stokta olanlar önce, sonra en çok indirim.
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then (case when available then 0 else 1 end) end asc  nulls last,
  case when p_sort not in ('ucuz', 'pahali', 'indirim', 'yeni')
       then discount_percent end desc nulls last,
  updated_at desc
limit  greatest(1, least(coalesce(p_limit, 24), 200))
offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_products_page(p_host text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_sayfasi(public.arc_storefront_org(p_host), p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_products_page(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_brand text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_max_price bigint DEFAULT NULL::bigint, p_only_discounted boolean DEFAULT false, p_only_available boolean DEFAULT false, p_sort text DEFAULT 'onerilen'::text)
 RETURNS TABLE(slug text, name text, subtitle text, vendor text, product_type text, price bigint, compare_at_price bigint, available boolean, image_paths jsonb, sizes jsonb, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_urun_sayfasi(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset, p_brand, p_size, p_max_price, p_only_discounted, p_only_available, p_sort);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_arama_dizini(p_organization_id uuid, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.slug,
    p.name,
    coalesce(p.metadata ->> 'vendor', 'ARVO') as vendor,
    coalesce(p.metadata ->> 'product_type', '') as product_type,
    min(v.price) as price,
    min(v.compare_at_price) filter (where v.compare_at_price > v.price)
      as compare_at_price,
    /*
      Yalnızca ilk görsel. Arama sonucu tek küçük resim gösteriyor
      ama katalog fonksiyonu her ürünün tüm galerisini taşıyordu —
      3.400 ürün için tek başına 1,7 MB.
    */
    (p.metadata -> 'image_paths' ->> 0) as image_path
  from public.arc_products p
  join public.arc_product_variants v
    on v.product_id = p.id and v.organization_id = p.organization_id
  join public.organizations o
    on o.id = p.organization_id and o.id = p_organization_id
  where p.status = 'active'
  group by p.id, p.slug, p.name, p.metadata, p.updated_at
  /*
    Stokta olmayan ürün aramada zaten gösterilmiyordu; süzme
    uygulama tarafında yapılıyordu. Veritabanında yapmak hem
    satır sayısını hem taşınan veriyi düşürüyor.
  */
  having bool_or(
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
  )
  order by p.updated_at desc, p.slug
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_search_index(p_host text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_arama_dizini(public.arc_storefront_org(p_host), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_search_index(p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(slug text, name text, vendor text, product_type text, price bigint, compare_at_price bigint, image_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_arama_dizini(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_limit, p_offset);
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_ayarlar(p_organization_id uuid)
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3)
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.id = p_organization_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_settings(p_host text)
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_ayarlar(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_settings()
 RETURNS TABLE(shipping_fee bigint, free_shipping_threshold bigint, bank_transfer_enabled boolean, bank_transfer_discount_percent numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_ayarlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

CREATE OR REPLACE FUNCTION public.arc_vitrin_varyantlar(p_organization_id uuid, p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with hesaplanan as (
    select
      v.sku as v_sku,
      coalesce(nullif(trim(v.title), ''), v.sku) as v_title,
      /*
        Nitelikten okuma. order by ile SABİT: aynı varyantta hem
        "Renk" hem "Color" bulunursa sonuç turdan tura değişmesin.
      */
      coalesce(
        (select n.value from jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) n
          where lower(n.key) in ('renk', 'renkler', 'color', 'colour')
            and nullif(trim(n.value), '') is not null
          order by n.key limit 1),
        nullif(trim(split_part(coalesce(v.title, ''), '/', 1)), '')
      ) as v_color,
      coalesce(
        (select n.value from jsonb_each_text(coalesce(v.attributes, '{}'::jsonb)) n
          where lower(n.key) in ('beden', 'size', 'numara', 'ölçü', 'olcu')
            and nullif(trim(n.value), '') is not null
          order by n.key limit 1),
        nullif(trim(split_part(coalesce(v.title, ''), '/', 2)), '')
      ) as v_size,
      v.price as v_price,
      v.compare_at_price as v_compare,
      v.stock as v_stock,
      public.arc_variant_available(v.stock, v.allow_backorder, v.supplier) as v_available,
      /*
        Ürünün galerisinde OLMAYAN yol dönmüyor: elle yazılmış ya da
        görseli silinmiş varyant, vitrinde kırık resim demekti.
      */
      case
        when v.image_path is not null
         and coalesce(p.metadata -> 'image_paths', '[]'::jsonb) ? v.image_path
        then v.image_path
      end as v_image_path,
      coalesce(v.attributes, '{}'::jsonb) as v_attributes
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    join public.organizations o
      on o.id = p.organization_id
     and o.id = p_organization_id
    where p.status = 'active'
      and p.slug = p_slug
      and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  )
  select
    h.v_sku, h.v_title, h.v_color, h.v_size, h.v_price,
    h.v_compare, h.v_stock, h.v_available, h.v_image_path, h.v_attributes
  from hesaplanan h
  /* Beden sıralaması artık TÜRETİLMİŞ bedene bakıyor; eskiden başlığı
     ikinci kez bölüyordu ve nitelikten gelen beden sıralanamazdı. */
  order by
    case upper(trim(coalesce(h.v_size, '')))
      when 'XXS' then 1 when 'XS' then 2 when 'S' then 3
      when 'M' then 4 when 'L' then 5 when 'XL' then 6
      when '2XL' then 7 when 'XXL' then 7
      when '3XL' then 8 when '4XL' then 9
      else 50
    end,
    h.v_price,
    h.v_sku
  /* 60 YETMİYORDU: renk × beden birleşimi 60'ı geçen üründe liste
     SESSİZCE kesiliyordu — eksik ton/beden hiç görünmüyor, müşteri
     stokta olan varyantı seçemiyordu. Hata yok, eksik veri var
     (arama dizinindeki kesilmeyle aynı sınıf). */
  limit 200;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_variants(p_host text, p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_varyantlar(public.arc_storefront_org(p_host), p_slug);
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_variants(p_slug text)
 RETURNS TABLE(sku text, title text, color text, size text, price bigint, compare_at_price bigint, stock integer, available boolean, image_path text, attributes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_varyantlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1), p_slug);
$function$
;

revoke all on function public.arc_vitrin_koleksiyon_secenekleri(p_organization_id uuid, p_collection_slugs text[], p_menu_groups text[]) from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyon_secenekleri(p_organization_id uuid, p_collection_slugs text[], p_menu_groups text[]) to service_role;
revoke all on function public.arc_vitrin_koleksiyon_urunleri(p_organization_id uuid, p_collection_slug text, p_menu_groups text[], p_limit integer) from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyon_urunleri(p_organization_id uuid, p_collection_slug text, p_menu_groups text[], p_limit integer) to service_role;
revoke all on function public.arc_vitrin_koleksiyon_sayfasi(p_organization_id uuid, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyon_sayfasi(p_organization_id uuid, p_collection_slugs text[], p_menu_groups text[], p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;
revoke all on function public.arc_vitrin_firsatlar(p_organization_id uuid, p_limit integer) from public, anon, authenticated;
grant execute on function public.arc_vitrin_firsatlar(p_organization_id uuid, p_limit integer) to service_role;
revoke all on function public.arc_vitrin_indirimler(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_indirimler(p_organization_id uuid) to service_role;
revoke all on function public.arc_vitrin_secenekler(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_secenekler(p_organization_id uuid) to service_role;
revoke all on function public.arc_vitrin_urun(p_organization_id uuid, p_slug text) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urun(p_organization_id uuid, p_slug text) to service_role;
revoke all on function public.arc_vitrin_urun_rozetleri(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urun_rozetleri(p_organization_id uuid) to service_role;
revoke all on function public.arc_vitrin_urun_sayisi(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urun_sayisi(p_organization_id uuid) to service_role;
revoke all on function public.arc_vitrin_urun_adresleri(p_organization_id uuid, p_limit integer, p_offset integer) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urun_adresleri(p_organization_id uuid, p_limit integer, p_offset integer) to service_role;
revoke all on function public.arc_vitrin_urunler(p_organization_id uuid, p_limit integer, p_offset integer) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urunler(p_organization_id uuid, p_limit integer, p_offset integer) to service_role;
revoke all on function public.arc_vitrin_urun_sayfasi(p_organization_id uuid, p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) from public, anon, authenticated;
grant execute on function public.arc_vitrin_urun_sayfasi(p_organization_id uuid, p_limit integer, p_offset integer, p_brand text, p_size text, p_max_price bigint, p_only_discounted boolean, p_only_available boolean, p_sort text) to service_role;
revoke all on function public.arc_vitrin_arama_dizini(p_organization_id uuid, p_limit integer, p_offset integer) from public, anon, authenticated;
grant execute on function public.arc_vitrin_arama_dizini(p_organization_id uuid, p_limit integer, p_offset integer) to service_role;
revoke all on function public.arc_vitrin_ayarlar(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_ayarlar(p_organization_id uuid) to service_role;
revoke all on function public.arc_vitrin_varyantlar(p_organization_id uuid, p_slug text) from public, anon, authenticated;
grant execute on function public.arc_vitrin_varyantlar(p_organization_id uuid, p_slug text) to service_role;
