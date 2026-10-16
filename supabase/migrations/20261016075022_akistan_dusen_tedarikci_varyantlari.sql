/*
  AKIŞTAN DÜŞEN TEDARİKÇİ VARYANTLARI SATIŞA KAPANIR (16.10.2026).

  Tarzyeri satışa kapattığı ürünü XML'den tamamen çıkarıyor. Stok turu
  (arc_bulk_update_supplier_stock) yalnızca akışta gelen SKU'ları yazdığı
  için çıkarılan ürün bizde son görülen miktarla AÇIK kalıyordu: o gün iki
  sipariş Tarzyeri'de kapanmış ürünlere düştü (bizde 92 ve 1000 adet).
  Akışta 14.902 varyant varken katalogda 15.365 tedarikçi varyantı vardı.

  Bu fonksiyon akışın TAM SKU listesini alır ve listede olmayan, hâlâ
  stoklu görünen varyantların stoğunu 0'a çeker. Kayıt silinmez: ürün
  akışa geri dönerse bir sonraki stok turu miktarını yeniden yazar,
  sipariş geçmişi de bağlantısını korur.

  Boş liste reddedilir — boş akış "her şey tükendi" demek değil, kesinti
  demek. Akışın yeterince tam olup olmadığına çağıran karar verir
  (src/lib/supplier-stock.ts → akisTamMi).
*/
create or replace function public.arc_close_missing_supplier_variants(
  p_organization_id uuid,
  p_supplier text,
  p_skus text[]
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kapanan integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;
  if p_supplier is null or btrim(p_supplier) = '' then
    raise exception 'Tedarikçi belirtilmedi';
  end if;
  if p_skus is null or coalesce(array_length(p_skus, 1), 0) = 0 then
    raise exception 'Akış SKU listesi boş; hiçbir varyant kapatılmadı';
  end if;

  /*
    not exists + unnest karşıt birleştirme olarak işliyor; "<> all(dizi)"
    15 bin × 15 bin karşılaştırma demekti.
  */
  update public.arc_product_variants v
     set stock = 0,
         updated_at = now()
   where v.organization_id = p_organization_id
     and v.supplier = p_supplier
     and v.supplier_sku is not null
     and coalesce(v.stock, 0) <> 0
     and not exists (
       select 1 from unnest(p_skus) as s(sku) where s.sku = v.supplier_sku
     );

  get diagnostics v_kapanan = row_count;
  return v_kapanan;
end;
$function$;

revoke all on function public.arc_close_missing_supplier_variants(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.arc_close_missing_supplier_variants(uuid, text, text[]) to service_role;

/*
  Stok turu artık parçalı değil, her çalıştırmada kataloğun tamamını
  işliyor; imleç yalnızca elle başlatılan TAM aktarımın. Eski stok
  turunun bıraktığı imleç sıfırlanır, yoksa bir sonraki tam aktarım
  ortadan başlardı.
*/
update public.arc_suppliers
   set sync_cursor = 0
 where coalesce(last_sync_note, '') like 'stok%';
