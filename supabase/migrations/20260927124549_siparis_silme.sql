-- SİPARİŞ SİLME.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Neden fonksiyon: siparişi doğrudan DELETE etmek STOĞU BOZUYOR.
-- Vitrin satışı stoğu düşürürken hareket kaydı YAZMIYOR
-- (arc_settle_storefront_order doğrudan arc_product_variants.stock
-- güncelliyor); stok yalnızca iptal yolunda geri veriliyor. Dolayısıyla
-- iptal edilmemiş bir siparişi silmek, düşen stoğu kalıcı olarak düşük
-- bırakıyor ve hangi siparişten düştüğü de artık bulunamıyor — çünkü
-- arc_inventory_movements siparişe yabancı anahtarla değil, METİN
-- referansıyla bağlı (reference_id = sipariş id'si).
--
-- Bu yüzden silme iki adımı tek işlemde yapıyor:
--   1. Sipariş açıksa arc_update_order_status ile İPTAL ediliyor. Kendi
--      stok mantığımı yazmak yerine kanıtlanmış yol kullanılıyor: o
--      fonksiyon stoğu geri veriyor ve hareket kaydını yazıyor.
--   2. Siparişin hareket kayıtları siliniyor, sonra siparişin kendisi.
--      Kalemler, olaylar, gönderiler ve iade talepleri CASCADE ile
--      gidiyor.
--
-- PayTR ödeme kaydı (arc_payment_orders) SİLİNMİYOR: siparişe yabancı
-- anahtarla bağlı değil, merchant_oid ile duruyor ve tahsilatın kanıtı
-- o. Muhasebe kaydını silmek istemiyoruz.
--
-- YETKİ: yalnızca mağaza sahibi ve yönetici (admin). Silme geri
-- alınamaz; manager rolü sipariş durumunu değiştirebilir ama kaydı yok
-- edemez.

create or replace function public.arc_delete_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
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
    eden satırlar kalıyor. İptal sırasında yazılan geri verme kaydı da
    buna dâhil; net etki sıfır olduğu için stok doğru kalıyor.
  */
  delete from public.arc_inventory_movements
   where organization_id = v_order.organization_id
     and reference_type = 'order_status'
     and reference_id = p_order_id::text;

  delete from public.arc_orders
   where id = p_order_id
     and organization_id = v_order.organization_id;

  return v_order.order_number;
end
$function$;

-- Postgres yeni fonksiyonu PUBLIC'e açık oluşturuyor, Supabase ayrıca
-- anon'a EXECUTE veriyor (AGENTS.md). Silme yalnızca panelden çağrılır.
revoke all on function public.arc_delete_order(uuid) from public, anon, authenticated;
grant execute on function public.arc_delete_order(uuid) to authenticated;
