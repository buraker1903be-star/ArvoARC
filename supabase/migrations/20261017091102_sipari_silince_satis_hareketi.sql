-- SİPARİŞ SİLİNİNCE SATIŞ HAREKETİ DE SİLİNİYOR (17.10.2026).
--
-- Deneme siparişi uçtan uca izlenirken görüldü: sipariş silindikten
-- sonra stok doğru (0) ama stok geçmişinde "'20319 · Satış · Sipariş
-- ARC-20261017-120702-A43646 · -1" satırı duruyor — işaret ettiği
-- sipariş artık yok. Fonksiyonun kendi yorumu tam bunu engellediğini
-- söylüyordu.
--
-- Sebep: hareket silme YALNIZCA reference_type='order_status' olanı
-- süpürüyordu, yani iptal sırasında yazılan geri verme kaydını.
-- Satışın kendi kaydını ise arc_create_order,
-- reference_type='order' ile yazıyor.
--
-- Neden bugüne kadar görünmedi: 'order' türündeki kaydı YALNIZCA
-- arc_create_order (manuel sipariş) yazıyor, vitrin satışı stoğu
-- hareket kaydı yazmadan düşürüyor. Manuel sipariş de dün akşama
-- kadar canlıda hiç oluşturulamıyordu (20261017085818, modül satırı
-- RLS yüzünden görünmüyordu). İki hata birbirini örtmüş.
--
-- İADE HAREKETİ de ekleniyor: iade talepleri sipariş silinince
-- CASCADE ile gidiyor, stoğa geri ekleme kaydı ise
-- reference_type='return_request' + talebin kimliğiyle yazıldığı için
-- arkada kalıyordu. Üçünün de net etkisi sıfır (satış −n, iptal ya da
-- iade +n), yani stok yine doğru kalıyor.
--
-- Gövde canlı anlık görüntüden alındı; değişen tek şey silme ifadesi.

CREATE OR REPLACE FUNCTION public.arc_delete_order(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
begin
  select id, organization_id, order_number, status, payment_status
    into v_order
    from public.arc_orders
   where id = p_order_id
   for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  if not private.arvo_is_org_admin(v_order.organization_id) then
    raise exception 'Sipariş silmek için mağaza sahibi ya da yönetici olmalısınız'
      using errcode = 'insufficient_privilege';
  end if;

  /*
    STOK ÖNCE GERİ VERİLİYOR. Zaten iptal/iade edilmiş siparişte stok
    geri verilmiş durumda; ikinci kez iptal etmek stoğu şişirirdi.
  */
  if v_order.status not in ('cancelled', 'refunded') then
    perform public.arc_update_order_status(p_order_id, 'cancelled', v_order.payment_status);
  end if;

  /*
    Hareket kayıtları siliniyor: yabancı anahtar olmadığı için CASCADE
    onlara ulaşmıyor ve silinmezlerse var olmayan bir siparişi işaret
    eden satırlar kalıyor. ÜÇ TÜR de siliniyor ve net etkileri sıfır
    olduğu için stok doğru kalıyor:
      order_status → iptalde yazılan geri verme (+n),
      order        → manuel siparişin satış kaydı (−n),
      return_request → iadede stoğa geri ekleme (+n); talep siparişle
                       birlikte CASCADE ile gittiği için sahipsiz kalırdı.
  */
  delete from public.arc_inventory_movements
   where organization_id = v_order.organization_id
     and (
       (reference_type in ('order_status', 'order') and reference_id = p_order_id::text)
       or (reference_type = 'return_request'
           and reference_id in (select r.id::text from public.arc_return_requests r where r.order_id = p_order_id))
     );

  delete from public.arc_orders
   where id = p_order_id
     and organization_id = v_order.organization_id;

  return v_order.order_number;
end
$function$
;

revoke all on function public.arc_delete_order(p_order_id uuid) from public, anon, authenticated;
grant execute on function public.arc_delete_order(p_order_id uuid) to authenticated;
grant execute on function public.arc_delete_order(p_order_id uuid) to service_role;

-- ESKİDEN KALAN SAHİPSİZ SATIŞ KAYDI (tek seferlik temizlik).
--
-- 'order' türündeki kaydı yalnızca manuel sipariş yazıyor ve manuel
-- sipariş canlıda ilk kez 17.10.2026'da oluşturulabildi; yani bu
-- koşula uyan satır, bugünkü deneme siparişinin arkasında bıraktığı
-- kayıttır. Stok etkisi iptalle zaten sıfırlanmıştı.
delete from public.arc_inventory_movements m
 where m.reference_type = 'order'
   and not exists (select 1 from public.arc_orders o where o.id::text = m.reference_id);
