/*
  KOLEKSİYON SAYISI SATILABİLİR ÜRÜNÜ SAYIYOR (19.10.2026)

  Menüdeki koleksiyon sayısı `p.status = 'active'` olan her ürünü
  sayıyordu — STOKA HİÇ BAKMADAN. Sonuç canlıda görüldü: Kürk
  menüsündeki ürünlerin hepsi tükenmiş ama menüde duruyor,
  müşteri tıklıyor ve karşısına baştan sona "Tükendi" rozetli bir
  liste çıkıyor. Boş koleksiyonu gizleyen `having > 0` kuralı
  vardı ama "boş" ile "hepsi tükenmiş" aynı şey sayılmıyordu.

  ÖLÇÜT HAM STOK DEĞİL `arc_variant_available`. Bu projede
  "satılabilir mi" sorusunun tek yanıtı o fonksiyon: tedarikçi
  tamponunu ve stoksuz satış iznini (`allow_backorder`) bilen tek
  yer orası. Ham `stock > 0` yazılsaydı LR ürünleri — stokları
  sıfır görünen ama stoksuz satışa açık olan bütün katalog —
  menüden silinirdi.

  İKİZ: `arc_storefront_collections` ve
  `get_arvoculture_storefront_collections` bu gövdeyi çağıran
  sarmalayıcılar; ikisi de kendiliğinden düzeliyor.
*/

create or replace function public.arc_vitrin_koleksiyonlar(p_organization_id uuid)
returns table (
  title text,
  slug text,
  description text,
  menu_group text,
  parent text,
  product_count integer
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
    count(distinct p.id)::integer as product_count
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
  group by c.id, c.title, c.slug, c.description, c.metadata
  /*
    Satılabilir ürünü kalmayan koleksiyon menüde YER KAPLAMIYOR.
    Önce yalnızca hiç ürünü olmayan koleksiyon eleniyordu.
  */
  having count(distinct p.id) > 0
  order by count(distinct p.id) desc;
$function$;

revoke all on function public.arc_vitrin_koleksiyonlar(uuid)
  from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyonlar(uuid) to service_role;
