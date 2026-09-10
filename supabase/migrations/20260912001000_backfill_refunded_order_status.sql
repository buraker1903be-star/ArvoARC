-- ============================================================
-- İade edilmiş siparişlerin durumunu düzeltme
--
-- Kısmi iadede sipariş durumu hiç değişmiyor, ödeme durumu da
-- "paid" bırakılıyordu. Sonuç: parası müşteriye geri gitmiş
-- sipariş listede "Bekliyor · Ödendi" görünüyor ve "Onayla →"
-- düğmesiyle hazırlanmaya davet ediliyordu.
--
-- Kod tarafı düzeltildi. Bu migration, düzeltmeden ÖNCE iade
-- edilmiş kayıtları aynı kurala getiriyor:
--
--   tam iade            → refunded / refunded
--   kısmi + kargolandı  → durum korunur / partially_refunded
--   kısmi + kargolanmadı→ cancelled / partially_refunded
--
-- Kargoya verilmemiş bir siparişin iadesi pratikte iptaldir;
-- kargoya verilmişse ürün yola çıkmıştır, durumu "fulfilled"
-- kalır ve iade yalnızca ödeme tarafında görünür.
-- ============================================================

update public.arc_orders
set
  payment_status = case
    when coalesce((metadata ->> 'refunded_amount')::bigint, 0) >= total
      then 'refunded'
    else 'partially_refunded'
  end,
  status = case
    when coalesce((metadata ->> 'refunded_amount')::bigint, 0) >= total
      then 'refunded'
    when status = 'fulfilled'
      then status
    else 'cancelled'
  end,
  updated_at = now()
where
  metadata ->> 'refunded_at' is not null
  -- Zaten doğru duruma alınmış kayıtlara dokunulmuyor.
  and payment_status not in ('refunded', 'partially_refunded');
