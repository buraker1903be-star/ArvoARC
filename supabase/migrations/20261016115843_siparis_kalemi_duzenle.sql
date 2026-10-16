-- siparis_kalemi_duzenle
--
-- SİPARİŞ DÜZENLEME (16.10.2026, kurum sahibi: "stokta olmayan ürünün
-- siparişi iptal edilebilsin veya değiştirilebilsin").
--
-- Eskiden tek seçenek siparişin TAMAMINI iptal etmekti: beş kalemlik bir
-- siparişte tedarikçide biten tek ürün yüzünden müşteri dört ürününü de
-- kaybediyordu ya da kalem panelde "var" görünürken hiç gönderilmiyordu.
--
-- Tek işlev, üç iş: kalemi kaldır (p_adet = 0), adedini değiştir (aynı
-- varyant), başka bir varyantla değiştir (p_variant_id). Hepsi TEK
-- işlemde: eski stok geri, yeni stok düşer, ara toplam, toplam ve KDV
-- yeniden hesaplanır, olay kaydı yazılır. Panelde ayrı ayrı yapılsaydı
-- yarıda kalan bir adım stoğu ya da tutarı bozuk bırakırdı.
--
-- PARA KURALI. Ciro "total - refunded_amount" (lib/order-flow.ts).
--   * Ödenmemiş siparişte (havale bekleyen, manuel) toplam doğrudan
--     değişir; müşteri yeni tutarı öder.
--   * ÖDENMİŞ siparişte toplam yine siparişin GERÇEK içeriğine iner, ama
--     müşterinin fazla ödediği fark `duzenleme_alacagi` olarak yazılır.
--     Bu fark iade edildiğinde refunded_amount'a EKLENMEZ (panel işlemi
--     ayırıyor): toplam zaten düştüğü için eklemek ciroyu iki kez
--     düşürürdü. Ödenmiş siparişin tutarı ödenen tutarı AŞAMAZ — müşteriden
--     ek ödeme almanın bir yolu yok.
--   * KART ÖDEMESİ SÜRERKEN düzenleme yok: PayTR bildirimi ödenen tutarı
--     siparişin toplamıyla karşılaştırıyor (api/storefront/paytr-bildirim);
--     arada değişen toplam, ödenmiş siparişi "tutar uyuşmuyor" diye
--     ödenmemiş bırakırdı.
--
-- STOK HAREKETİ reference_type = 'order_status' ile yazılıyor: sipariş
-- silinince arc_delete_order bu türü temizliyor; ayrı bir tür, var
-- olmayan siparişi işaret eden hareket bırakırdı.
--
-- KDV tetikleyiciye bırakılıyor: tax = 0 yazılınca arc_orders_fill_tax
-- (AFTER UPDATE OF subtotal, total) kalem oranlarıyla ve indirim payıyla
-- yeniden hesaplıyor. İkinci bir KDV formülü yazmak, ikisinin ayrışması
-- demekti.

-- OLAY TÜRÜ KISITI GENİŞLİYOR. Kısıt yalnızca status_updated ve
-- fulfillment_updated türlerine izin veriyordu; oysa kod beş tür daha
-- yazıyor ve hepsi REDDEDİLİYORDU:
--   * payment_amount_mismatch, payment_settle_failed,
--     payment_session_failed (lib/siparis-olayi.ts): hata yalnızca
--     günlüğe düşüyor, sipariş geçmişinde hiç görünmüyordu — ödeme
--     sorununun izi panelde yoktu.
--   * stock_shortfall: arc_settle_storefront_order'ın İÇİNDE. Kartla
--     ödenmiş siparişte stok yetmediğinde ekleme düşüyor ve BÜTÜN işlem
--     geri alınıyordu: parası alınmış sipariş "ödendi" olamıyordu.
--     Tedarikçi stoğu satış anında oynadığı için olası bir durum.
--   * item_edited: aşağıdaki düzenleme işlevi.
alter table public.arc_order_events drop constraint if exists arc_order_events_event_type_check;
alter table public.arc_order_events add constraint arc_order_events_event_type_check check (event_type = any (array[
  'status_updated', 'fulfillment_updated', 'payment_amount_mismatch', 'payment_settle_failed',
  'payment_session_failed', 'stock_shortfall', 'item_edited'
]));

create or replace function public.arc_siparis_kalemi_duzenle(
  p_order_id uuid,
  p_item_id uuid,
  p_adet integer,
  p_variant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_order record;
  v_item record;
  v_var record;
  v_hedef uuid;
  v_islem text;
  v_eski_toplam bigint;
  v_ara bigint;
  v_indirim bigint;
  v_toplam bigint;
  v_alacak bigint;
  v_yontem text;
  v_yeni_sku text;
  v_havale bigint;
  v_havale_orani numeric;
begin
  if v_user is null then
    raise exception 'Oturum gerekli' using errcode = 'insufficient_privilege';
  end if;
  if p_adet is null or p_adet < 0 or p_adet > 999 then
    raise exception 'Geçersiz adet' using errcode = 'check_violation';
  end if;

  select * into v_order from public.arc_orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  if not exists (
    select 1 from public.organization_memberships m
     where m.organization_id = v_order.organization_id
       and m.user_id = v_user
       and m.is_active = true
       and m.role::text in ('owner', 'admin', 'manager')
  ) then
    raise exception 'Sipariş düzenleme yetkiniz yok' using errcode = 'insufficient_privilege';
  end if;

  if v_order.status not in ('pending', 'confirmed', 'processing') then
    raise exception 'Kargoya verilmiş ya da kapanmış sipariş düzenlenemez' using errcode = 'check_violation';
  end if;
  if v_order.payment_status in ('refunded', 'partially_refunded') then
    raise exception 'İadesi yapılmış sipariş düzenlenemez' using errcode = 'check_violation';
  end if;
  v_yontem := lower(coalesce(v_order.metadata ->> 'payment_method', ''));
  if v_order.payment_status in ('pending', 'authorized') and v_yontem <> '' and position('havale' in v_yontem) = 0 then
    raise exception 'Kart ödemesi tamamlanmadan sipariş düzenlenemez' using errcode = 'check_violation';
  end if;

  select * into v_item
    from public.arc_order_items
   where id = p_item_id and order_id = v_order.id and organization_id = v_order.organization_id
   for update;
  if not found then
    raise exception 'Kalem bulunamadı';
  end if;

  -- Gönderiye girmiş kalem düzenlenmez: paketteki adet ile siparişteki
  -- adet ayrışırdı. Önce gönderi iptal edilir.
  if exists (
    select 1 from public.arc_shipment_items si
      join public.arc_shipments s on s.id = si.shipment_id
     where si.order_item_id = v_item.id and s.status <> 'cancelled'
  ) then
    raise exception 'Bu kalem bir gönderide; önce gönderiyi iptal edin' using errcode = 'check_violation';
  end if;

  v_eski_toplam := v_order.total;

  -- Eski stok geri.
  if v_item.variant_id is not null then
    update public.arc_product_variants
       set stock = stock + v_item.quantity, updated_at = now()
     where id = v_item.variant_id and organization_id = v_order.organization_id;
    if found then
      insert into public.arc_inventory_movements
        (organization_id, variant_id, kind, quantity, reference_type, reference_id, note, created_by)
      values
        (v_order.organization_id, v_item.variant_id, 'return', v_item.quantity, 'order_status', v_order.id::text,
         'Sipariş düzenlendi: ' || v_order.order_number || ' · ' || v_item.sku, v_user);
    end if;
  end if;

  if p_adet = 0 then
    if not exists (
      select 1 from public.arc_order_items
       where order_id = v_order.id and organization_id = v_order.organization_id and id <> v_item.id
    ) then
      raise exception 'Siparişte tek kalem var; kaldırmak yerine siparişi iptal edin' using errcode = 'check_violation';
    end if;
    delete from public.arc_order_items where id = v_item.id;
    v_islem := 'kaldirildi';
  else
    v_hedef := coalesce(p_variant_id, v_item.variant_id);
    if v_hedef is null then
      -- Katalogda olmayan manuel kalem: yalnızca adet, stok yok.
      update public.arc_order_items
         set quantity = p_adet, total = unit_price * p_adet
       where id = v_item.id;
      v_islem := 'adet';
    else
      select v.id, v.sku, v.price, v.stock, v.allow_backorder, v.supplier, p.name as urun
        into v_var
        from public.arc_product_variants v
        join public.arc_products p on p.id = v.product_id and p.organization_id = v.organization_id
       where v.id = v_hedef and v.organization_id = v_order.organization_id
       for update of v;
      if not found then
        raise exception 'Varyant bulunamadı';
      end if;
      -- Stok, eski adet geri verildikten SONRA ölçülüyor: aynı kalemin
      -- adedini artırmak kendi ayırdığı stoğu da sayıyor.
      if not public.arc_variant_available(v_var.stock, v_var.allow_backorder, v_var.supplier)
         or (not coalesce(v_var.allow_backorder, false) and v_var.stock < p_adet) then
        raise exception 'Stok yetersiz: % (stok %)', v_var.sku, v_var.stock using errcode = 'check_violation';
      end if;

      if v_hedef = v_item.variant_id then
        -- Aynı ürün: satış anındaki fiyat korunur.
        update public.arc_order_items
           set quantity = p_adet, total = unit_price * p_adet
         where id = v_item.id;
        v_islem := 'adet';
      else
        delete from public.arc_order_items where id = v_item.id;
        insert into public.arc_order_items
          (organization_id, order_id, variant_id, product_name, sku, quantity, unit_price, total)
        values
          (v_order.organization_id, v_order.id, v_var.id, v_var.urun, v_var.sku, p_adet, v_var.price, v_var.price * p_adet);
        v_islem := 'degisti';
        v_yeni_sku := v_var.sku;
      end if;

      update public.arc_product_variants
         set stock = stock - p_adet, updated_at = now()
       where id = v_var.id;
      insert into public.arc_inventory_movements
        (organization_id, variant_id, kind, quantity, reference_type, reference_id, note, created_by)
      values
        (v_order.organization_id, v_var.id, 'sale', -p_adet, 'order_status', v_order.id::text,
         'Sipariş düzenlendi: ' || v_order.order_number || ' · ' || v_var.sku, v_user);
    end if;
  end if;

  select coalesce(sum(total), 0) into v_ara
    from public.arc_order_items
   where order_id = v_order.id and organization_id = v_order.organization_id;
  -- Kupon indirimi tutar olarak saklı; yeni ara toplamı aşamaz.
  v_indirim := least(coalesce((v_order.metadata ->> 'discount')::bigint, 0), v_ara);
  /*
    HAVALE İNDİRİMİ (api/storefront/odeme): kupondan sonraki mal
    tutarının yüzdesi, `transfer_discount` olarak saklı. Toplama
    girmezse havale siparişini düzenlemek müşterinin indirimini sessizce
    silerdi. Oran saklı değilse eski tutarın eski mal tutarına oranı.
  */
  if v_order.metadata ? 'transfer_discount' then
    v_havale_orani := coalesce(
      (v_order.metadata ->> 'transfer_discount_percent')::numeric,
      case when coalesce(v_order.subtotal, 0) - coalesce((v_order.metadata ->> 'discount')::bigint, 0) > 0
        then (v_order.metadata ->> 'transfer_discount')::numeric * 100
             / (v_order.subtotal - coalesce((v_order.metadata ->> 'discount')::bigint, 0))
        else 0 end
    );
    v_havale := round(greatest(v_ara - v_indirim, 0) * v_havale_orani / 100)::bigint;
  else
    v_havale := 0;
  end if;
  v_toplam := greatest(v_ara - v_indirim - v_havale, 0) + coalesce(v_order.shipping, 0);
  v_alacak := coalesce((v_order.metadata ->> 'duzenleme_alacagi')::bigint, 0);

  if v_order.payment_status = 'paid' then
    v_alacak := v_alacak + (v_eski_toplam - v_toplam);
    if v_alacak < 0 then
      raise exception 'Ödenmiş siparişin tutarı ödenen tutarı aşamaz (% kuruş fazla)', -v_alacak
        using errcode = 'check_violation';
    end if;
  end if;

  update public.arc_orders
     set subtotal = v_ara,
         total = v_toplam,
         tax = 0,
         metadata = v_order.metadata
           || case when v_order.metadata ? 'discount' then jsonb_build_object('discount', v_indirim) else '{}'::jsonb end
           || case when v_order.metadata ? 'transfer_discount' then jsonb_build_object('transfer_discount', v_havale) else '{}'::jsonb end
           || case when v_order.payment_status = 'paid' then jsonb_build_object('duzenleme_alacagi', v_alacak) else '{}'::jsonb end,
         updated_at = now()
   where id = v_order.id;

  insert into public.arc_order_events (organization_id, order_id, event_type, event_data, created_by)
  values (v_order.organization_id, v_order.id, 'item_edited', jsonb_build_object(
    'islem', v_islem,
    'urun', v_item.product_name,
    'eski_sku', v_item.sku,
    'yeni_sku', v_yeni_sku,
    'eski_adet', v_item.quantity,
    'yeni_adet', p_adet,
    'eski_toplam', v_eski_toplam,
    'yeni_toplam', v_toplam,
    'alacak', case when v_order.payment_status = 'paid' then v_alacak else null end
  ), v_user);

  return jsonb_build_object('islem', v_islem, 'eski_toplam', v_eski_toplam, 'yeni_toplam', v_toplam,
    'alacak', case when v_order.payment_status = 'paid' then v_alacak else 0 end);
end
$function$;

revoke all on function public.arc_siparis_kalemi_duzenle(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.arc_siparis_kalemi_duzenle(uuid, uuid, integer, uuid) to authenticated;
