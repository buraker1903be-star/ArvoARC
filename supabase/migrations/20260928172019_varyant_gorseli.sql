-- VARYANT BAŞINA GÖRSEL: renk seçilince fotoğraf da değişiyor.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Ürünün sekiz görseli var ve müşteri "Siyah"ı seçtiğinde vitrin hâlâ
-- kapaktaki beyaz ürünü gösteriyordu. Renk varyantı olan her üründe
-- müşteri aldığı şeyi göremiyor.
--
-- YENİ GÖRSEL YÜKLENMİYOR, ÜRÜNÜNKİNE İŞARET EDİLİYOR. Varyantın kendi
-- deposu olsaydı aynı fotoğraf hem galeride hem varyantta iki kez
-- durur, biri silinince öteki kalırdı. image_path, ürünün
-- metadata->image_paths listesindeki bir yol; panel başka bir değer
-- yazılmasına izin vermiyor (CHECK yazılamıyor: kısıt alt sorgu
-- içeremez).
--
-- NULL: varyantın kendi görseli yok, kapak kullanılıyor.

alter table public.arc_product_variants
  add column if not exists image_path text;

comment on column public.arc_product_variants.image_path is
  'Ürünün image_paths listesindeki bir yol. NULL: kapak görseli kullanılır.';

-- ---------- Vitrin varyant listesi ----------
--
-- Dönüş şekli değiştiği için DÜŞÜRÜLÜP yeniden kuruluyor: Postgres
-- "create or replace" ile dönüş tipini değiştirmiyor.
--
-- DÜŞÜRME YETKİLERİ DE SİLİYOR ve Postgres yeni fonksiyonu PUBLIC'e
-- (anon dahil) açık oluşturuyor. Aşağıdaki revoke/grant bu yüzden
-- zorunlu; 19.09.2026'da ARC'ta siparişi "ödendi" yapan fonksiyon tam
-- bu sebeple herkese açık kalmıştı. tests/db/yetki.test.mjs bu
-- fonksiyonun anon'a açık olduğunu sabitliyor (vitrin okuması).

drop function if exists public.get_arvoculture_storefront_variants(text);

create function public.get_arvoculture_storefront_variants(p_slug text)
 returns table(sku text, title text, color text, size text, price bigint,
               compare_at_price bigint, stock integer, available boolean, image_path text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    v.sku,
    coalesce(nullif(trim(v.title), ''), v.sku) as title,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 1)), '') as color,
    nullif(trim(split_part(coalesce(v.title, ''), '/', 2)), '') as size,
    v.price,
    v.compare_at_price,
    v.stock,
    public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
      as available,
    /*
      Ürünün galerisinde OLMAYAN bir yol dönmüyor: elle yazılmış ya da
      görsel silindikten sonra kalmış bir yol, vitrinde kırık resim
      demekti. Kalmadıysa vitrin kapağa düşüyor.
    */
    case
      when v.image_path is not null
       and coalesce(p.metadata -> 'image_paths', '[]'::jsonb) ? v.image_path
      then v.image_path
    end as image_path
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
  order by
    case upper(trim(split_part(coalesce(v.title, ''), '/', 2)))
      when 'XXS' then 1 when 'XS' then 2 when 'S' then 3
      when 'M' then 4 when 'L' then 5 when 'XL' then 6
      when '2XL' then 7 when 'XXL' then 7
      when '3XL' then 8 when '4XL' then 9
      else 50
    end,
    v.price,
    v.sku
  limit 60;
$function$;

revoke all on function public.get_arvoculture_storefront_variants(p_slug text) from public, anon, authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to anon;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to authenticated;
grant execute on function public.get_arvoculture_storefront_variants(p_slug text) to service_role;

-- Geri almak için: bu dosyanın önceki hâli canli-sema.sql:3243'te.
-- alter table public.arc_product_variants drop column if exists image_path;
