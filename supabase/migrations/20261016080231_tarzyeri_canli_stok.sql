/*
  TARZYERİ CANLI STOK (16.10.2026).

  Ödeme anında sepetteki Tarzyeri ürünleri tedarikçinin canlı ürün
  sayfasından doğrulanıyor (src/lib/supplier/tarzyeri-dogrulama.ts):
  on dakikalık tarama arasında tükenen ürün satılıyordu ve Tarzyeri'nin
  XML'i de canlı değil (25 dakikada tek sayı değişmedi).

  İki fonksiyon:
    - arc_set_supplier_links: ürünün Tarzyeri sayfa adresini metadata'ya
      yazar (supplier_link). Tarama her turda çağırıyor; yalnızca değişen
      adres yazılır.
    - arc_set_supplier_variant_stock: yalnızca STOK yazar. Ödemede öğrenilen
      canlı sayı bizde de hemen yazılsın diye: tükenen ürün sonraki taramayı
      beklemeden vitrinde kapanır. arc_bulk_update_supplier_stock maliyet ve
      fiyatı da yazdığı için burada kullanılamıyor.
*/
create or replace function public.arc_set_supplier_links(
  p_organization_id uuid,
  p_supplier text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_yazilan integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  with veri as (
    select distinct on (r ->> 'code')
           (r ->> 'code')::text as code,
           (r ->> 'link')::text as link
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
     where coalesce(r ->> 'code', '') <> ''
       and coalesce(r ->> 'link', '') like 'https://%'
  )
  update public.arc_products p
     set metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object('supplier_link', d.link)
    from veri d
   where p.organization_id = p_organization_id
     and p.supplier = p_supplier
     and p.supplier_product_code = d.code
     and (p.metadata ->> 'supplier_link') is distinct from d.link;

  get diagnostics v_yazilan = row_count;
  return v_yazilan;
end;
$function$;

revoke all on function public.arc_set_supplier_links(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.arc_set_supplier_links(uuid, text, jsonb) to service_role;

create or replace function public.arc_set_supplier_variant_stock(
  p_organization_id uuid,
  p_supplier text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_yazilan integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  with veri as (
    select (r ->> 'sku')::text as sku,
           greatest(0, (r ->> 'stock')::integer) as stock
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
     where coalesce(r ->> 'sku', '') <> ''
  )
  update public.arc_product_variants v
     set stock = d.stock,
         updated_at = now()
    from veri d
   where v.organization_id = p_organization_id
     and v.supplier = p_supplier
     and v.supplier_sku = d.sku
     and v.stock is distinct from d.stock;

  get diagnostics v_yazilan = row_count;
  return v_yazilan;
end;
$function$;

revoke all on function public.arc_set_supplier_variant_stock(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.arc_set_supplier_variant_stock(uuid, text, jsonb) to service_role;
