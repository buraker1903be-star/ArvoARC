/*
  KOLEKSİYON ADLARI İNGİLİZCE VİTRİNE AÇILIYOR (22.10.2026)

  `arc_collections.title_en` / `description_en` 20261022194731'de
  eklendi ama vitrine ULAŞMIYORDU: adı getiren fonksiyon yalnızca
  Türkçe başlığı döndürüyor. Sonuç, İngilizce vitrinin yarım
  kalması — ürün adları İngilizce, üstündeki menü ve koleksiyon
  başlığı Türkçe.

  DÖNÜŞ TİPİ DEĞİŞTİĞİ İÇİN ÜÇÜ DE AÇIKÇA DÜŞÜYOR. `cascade`
  sarmalayıcıları GÖRMÜYOR: Postgres, bir SQL fonksiyonunun
  gövdesinde çağırdığı başka bir fonksiyon için bağımlılık kaydı
  tutmuyor — bu canlıda bir kez 42P13 ile patladı (20261018221955).

  ÇEVİRİSİ OLMAYAN KOLEKSİYON `null` DÖNÜYOR, Türkçe başlık
  KOPYALANMIYOR. Vitrin `titleEn ?? title` ile düşüyor; burada
  `coalesce` yapmak "çevirisi var mı" sorusunu yanıtlanamaz
  kılardı ve panelin kapsam sayımı yanlış çıkardı.
*/

drop function if exists public.arc_storefront_collections(text);
drop function if exists public.get_arvoculture_storefront_collections();
drop function if exists public.arc_vitrin_koleksiyonlar(uuid);

create or replace function public.arc_vitrin_koleksiyonlar(p_organization_id uuid)
returns table (
  title text,
  slug text,
  description text,
  menu_group text,
  parent text,
  product_count integer,
  title_en text,
  description_en text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    c.title,
    c.slug,
    c.description,
    coalesce(c.metadata ->> 'menu_group', '') as menu_group,
    coalesce(c.metadata ->> 'parent', '') as parent,
    count(distinct p.id)::integer as product_count,
    c.title_en,
    c.description_en
  from public.arc_collections c
  join public.organizations o
    on o.id = c.organization_id
   and o.id = p_organization_id
  left join public.arc_collection_products cp
    on cp.collection_id = c.id
  left join public.arc_products p
    on p.id = cp.product_id
   and p.status = 'active'
   /*
     SATILABİLİR EN AZ BİR VARYANTI OLAN ÜRÜN. Tek bedeni kalan
     ürün sayılıyor; hepsi tükenmiş ürün sayılmıyor.
   */
   and exists (
     select 1
     from public.arc_product_variants v
     where v.product_id = p.id
       and public.arc_variant_available(v.stock, v.allow_backorder, v.supplier)
   )
  where c.status = 'active'
  group by c.id, c.title, c.slug, c.description, c.metadata, c.title_en, c.description_en
  /*
    Satılabilir ürünü kalmayan koleksiyon menüde YER KAPLAMIYOR.
    Önce yalnızca hiç ürünü olmayan koleksiyon eleniyordu.
  */
  having count(distinct p.id) > 0
  order by count(distinct p.id) desc;
$function$;

revoke all on function public.arc_vitrin_koleksiyonlar(uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyonlar(uuid) to service_role;

create or replace function public.arc_storefront_collections(p_host text)
returns table (
  title text,
  slug text,
  description text,
  menu_group text,
  parent text,
  product_count integer,
  title_en text,
  description_en text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_koleksiyonlar(public.arc_storefront_org(p_host));
$function$;

revoke all on function public.arc_storefront_collections(text) from public;
grant execute on function public.arc_storefront_collections(text) to anon, authenticated, service_role;

create or replace function public.get_arvoculture_storefront_collections()
returns table (
  title text,
  slug text,
  description text,
  menu_group text,
  parent text,
  product_count integer,
  title_en text,
  description_en text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_koleksiyonlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$;

revoke all on function public.get_arvoculture_storefront_collections() from public;
grant execute on function public.get_arvoculture_storefront_collections() to anon, authenticated, service_role;
