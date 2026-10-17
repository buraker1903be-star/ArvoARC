-- tampon_esigi_panel_ile_ayni
--
-- TEDARİKÇİ TAMPONU: EŞİK, REZERV DEĞİL.
--
-- Panelde alanın açıklaması şu: "Tedarikçi stoğu bu değerin ALTINA
-- DÜŞERSE ürün satışa kapanır." İçe aktarım bu sözleşmeyi birebir
-- uyguluyor (lib/supplier-stock.ts `sellableStock`): tampon 5 iken
-- tedarikçide 5 adet varsa stok 5 yazılıyor, 4 adet varsa 0 yazılıyor.
-- Testi de bunu sabitlemiş (`sellableStock(5, 5) === 5`).
--
-- arc_variant_available ise `stok > tampon` diyordu. Yani tam sınırda
-- (stok = tampon) iki kural çelişiyordu:
--
--   - içe aktarım "satılabilir" deyip stoğu 5 olarak yazıyor,
--   - panelin stok ekranı 5 adet gösteriyor,
--   - vitrin ürünü HİÇ göstermiyor ve sipariş reddediyor.
--
-- Ürün panelde stokta, müşteride yok. Sessiz: kimse hata görmüyor,
-- yalnızca satış olmuyor.
--
-- Doğru olan panelin yazdığı kuraldır, çünkü tampon bir eşik: "bu
-- değerin altına düşmesin". Fonksiyon ona uyduruldu.
--
-- TAMPON 0 KURALI DEVRE DIŞI BIRAKIR ve bu yüzden `>=` tek başına
-- yetmiyor: `stok >= 0` her miktarı satılabilir yapar, stoksuz
-- tedarikçi ürünü bile satılırdı. Bu yüzden iki koşul birlikte:
-- stok sıfırdan büyük OLMALI ve tamponun altına düşmemiş olmalı.
--
-- Kendi ürünümüzün kuralı değişmedi (stok > 0 ya da stoksuz satış).

CREATE OR REPLACE FUNCTION public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    -- Tedarikçi ürünü: tampon kuralı (eşik, rezerv değil)
    when p_supplier is not null then
      coalesce(p_stock, 0) > 0
      and coalesce(p_stock, 0) >= coalesce(
        (select stock_buffer from public.arc_suppliers
         where code = p_supplier limit 1),
        5
      )
    -- Kendi ürünümüz
    else coalesce(p_stock, 0) > 0 or coalesce(p_allow_backorder, false)
  end;
$function$
;

revoke all on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) from public;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to anon;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to authenticated;
grant execute on function public.arc_variant_available(p_stock integer, p_allow_backorder boolean, p_supplier text) to service_role;
