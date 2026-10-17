-- varyant_uygunlugu_tek_kural
--
-- VARYANT UYGUNLUĞU ARTIK TEK YERDEN: arc_variant_available.
--
-- Vitrinin okuduğu fonksiyonlar "stokta var mı" sorusunu İKİ AYRI
-- biçimde yanıtlıyordu:
--
--   * katalog listesi, katalog sayfası, varyant listesi ve arama
--     dizini  →  public.arc_variant_available(stock, allow_backorder, supplier)
--   * koleksiyon listesi, fırsatlar ve ÜRÜN SAYFASI
--                        →  (v.stock > 0 or v.allow_backorder)
--
-- İkinci biçim tedarikçi ürününü bilmiyor. arc_variant_available
-- tedarikçi ürününde "stok > tedarikçi tamponu" diyor (tampon
-- varsayılanı 5); ham biçim ise stok 1 olan ürünü de satılabilir
-- sayıyor. Sonuç, aynı ürün için birbirini tutmayan üç ekran:
--
--   - koleksiyon kartı "Sepete ekle" diyor, katalog listesi aynı
--     ürünü "Tükendi" gösteriyor;
--   - ürün sayfası sepete eklemeye izin veriyor;
--   - ama SİPARİŞ arc_variant_available ile denetleniyor
--     (arc_create_order, arc_siparise_kalem_ekle) ve adresini
--     girmiş müşteri ödeme adımında "Insufficient stock" alıyor.
--
-- Yani tampon kuralı satışı engelliyor ama müşteriye bunu en geç
-- anda söylüyordu. Altı fonksiyon da artık aynı yardımcıyı
-- çağırıyor; eşik tek yerden değişiyor.
--
-- Gövdeler 17.10.2026 dökümünden alındı, yalnızca bu ifade
-- değiştirildi. Dönüş tipleri aynı olduğu için CREATE OR REPLACE
-- yetiyor ve yetkiler korunuyor; yine de yetki satırları
-- AGENTS.md'deki kurala uyması için tekrarlandı.
--
-- AYRICA: get_arvoculture_storefront_variants'taki `limit 60`
-- kaldırıldı (200). Renk × beden birleşimi 60'ı geçen üründe
-- liste sessizce kesiliyordu.

CREATE OR REPLACE FUNCTION public.arc_storefront_collection_products(p_host text, p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
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
   and o.id = public.arc_storefront_org(p_host)
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

CREATE OR REPLACE FUNCTION public.arc_storefront_deals(p_host text, p_limit integer DEFAULT 12)
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
   and o.id = public.arc_storefront_org(p_host)
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

CREATE OR REPLACE FUNCTION public.arc_storefront_product(p_host text, p_slug text)
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
   and o.id = public.arc_storefront_org(p_host)
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collection_products(p_collection_slug text DEFAULT NULL::text, p_menu_groups text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200)
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
   and o.slug = 'arvoculture'
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

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_deals(p_limit integer DEFAULT 12)
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
   and o.slug = 'arvoculture'
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

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_product(p_slug text)
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
   and o.slug = 'arvoculture'
  where p.status = 'active'
    and p.slug = p_slug
    and p_slug ~ '^[a-z0-9][a-z0-9-]{0,199}$'
  group by p.id, p.slug, p.name, p.description, p.metadata
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_variants(p_slug text)
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
     and o.slug = 'arvoculture'
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
-- Yetkiler (CREATE OR REPLACE korur; kural gereği yine yazılıyor).
revoke all on function public.arc_storefront_collection_products(p_host text, p_collection_slug text, p_menu_groups text[], p_limit integer) from public;
grant execute on function public.arc_storefront_collection_products(p_host text, p_collection_slug text, p_menu_groups text[], p_limit integer) to anon;
grant execute on function public.arc_storefront_collection_products(p_host text, p_collection_slug text, p_menu_groups text[], p_limit integer) to authenticated;
grant execute on function public.arc_storefront_collection_products(p_host text, p_collection_slug text, p_menu_groups text[], p_limit integer) to service_role;

revoke all on function public.arc_storefront_deals(p_host text, p_limit integer) from public;
grant execute on function public.arc_storefront_deals(p_host text, p_limit integer) to anon;
grant execute on function public.arc_storefront_deals(p_host text, p_limit integer) to authenticated;
grant execute on function public.arc_storefront_deals(p_host text, p_limit integer) to service_role;

revoke all on function public.arc_storefront_product(p_host text, p_slug text) from public;
grant execute on function public.arc_storefront_product(p_host text, p_slug text) to anon;
grant execute on function public.arc_storefront_product(p_host text, p_slug text) to authenticated;
grant execute on function public.arc_storefront_product(p_host text, p_slug text) to service_role;

revoke all on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_collection_products(p_collection_slug text, p_menu_groups text[], p_limit integer) to service_role;

revoke all on function public.get_arvoculture_storefront_deals(p_limit integer) from public;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to anon;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to authenticated;
grant execute on function public.get_arvoculture_storefront_deals(p_limit integer) to service_role;

revoke all on function public.get_arvoculture_storefront_product(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_product(p_slug text) to service_role;

revoke all on function public.get_arvoculture_storefront_variants(p_slug text) from public;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to service_role;
