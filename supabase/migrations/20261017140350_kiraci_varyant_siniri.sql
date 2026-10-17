-- kiraci_varyant_siniri
--
-- ÇOK KİRACILI VARYANT LİSTESİ 60'TA KESİLİYORDU.
--
-- arc_storefront_variants, ArvoCulture ikizi 20261017120705 ile
-- 200'e çıkarılırken dışarıda kaldı. 60 renk × beden birleşimini
-- geçen üründe liste SESSİZCE kesiliyor: eksik ton ya da beden hiç
-- görünmüyor, müşteri stokta olan varyantı seçemiyor. Hata yok,
-- eksik veri var.
--
-- Bugün bu fonksiyonu çağıran kiracı yok; ikinci kiracı açılırken
-- yaşanacaktı. Yeni eklenen `npm run check:ikizler` denetimi bunu
-- yakaladı — ikizler arasındaki ayrışmanın insan gözüne kalmaması
-- için yazılmıştı ve ilk koşusunda işe yaradı.

CREATE OR REPLACE FUNCTION public.arc_storefront_variants(p_host text, p_slug text)
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
     and o.id = public.arc_storefront_org(p_host)
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
     stokta olan varyantı seçemiyordu. ArvoCulture ikizinde
     20261017120705 ile 200'e çıkarıldı; bu aile o düzeltmenin
     dışında kalmıştı. */
  limit 200;
$function$
;

revoke all on function public.arc_storefront_variants(p_host text, p_slug text) from public;
grant execute on function public.arc_storefront_variants(p_host text, p_slug text) to anon, authenticated, service_role;
