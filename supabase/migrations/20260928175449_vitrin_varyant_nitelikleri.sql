-- VİTRİN RENK VE BEDENİ NİTELİKLERDEN OKUYOR, BAŞLIKTAN TAHMİN ETMİYOR.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Fonksiyon rengi varyant BAŞLIĞINI "/" ile bölüp birinci parçayı
-- alarak buluyordu. Kod tabanında rengi türeten tek yer burası ve
-- varsayım üç yerde kırılıyor:
--
--   - seçenekler renk/beden değilse ("Hacim / Koku") renk diye hacim
--     gösteriliyordu;
--   - renk adında "/" varsa ("Siyah/Beyaz Çizgili") başlık yanlış
--     bölünüyordu;
--   - seçenek sırası farklıysa ("M / Siyah") beden renk sanılıyordu.
--     Panel tarafında matris artık renk seçeneğini başa alıyor, ama o
--     yalnızca panelden üretilen varyantları kurtarıyordu.
--
-- Oysa doğru veri ZATEN VAR: hem varyant matrisi hem Shopify aktarımı
-- attributes'a {"Renk":"Siyah","Beden":"M"} yazıyor. Artık önce oraya
-- bakılıyor, yoksa eski bölme yöntemine düşülüyor — eski kayıtların
-- niteliği boş olabilir ve onları kaybetmek vitrinde beden seçicisini
-- yok ederdi.
--
-- attributes DA DÖNÜYOR: renk/beden dışında seçeneği olan ürünlerde
-- (hacim, koku, kalıp) vitrin kendi gruplarını çizebilsin. Böylece bu
-- fonksiyonu dördüncü kez düşürmek gerekmeyecek.
--
-- DÜŞÜRME YETKİLERİ SİLİYOR ve Postgres yeni fonksiyonu PUBLIC'e (anon
-- dahil) açık oluşturuyor; aşağıdaki revoke/grant bu yüzden zorunlu.
-- 19.09.2026'da ARC'ta siparişi "ödendi" yapan fonksiyon tam bu
-- sebeple herkese açık kalmıştı. tests/db/yetki.test.mjs sabitliyor.

drop function if exists public.get_arvoculture_storefront_variants(text);

create function public.get_arvoculture_storefront_variants(p_slug text)
 returns table(sku text, title text, color text, size text, price bigint,
               compare_at_price bigint, stock integer, available boolean,
               image_path text, attributes jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
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
  limit 60;
$function$;

revoke all on function public.get_arvoculture_storefront_variants(p_slug text) from public, anon, authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to service_role;

-- Geri almak için: 20260928172019_varyant_gorseli.sql'deki hâli yeniden uygulayın.
