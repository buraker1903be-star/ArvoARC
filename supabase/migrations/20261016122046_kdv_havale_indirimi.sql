-- kdv_havale_indirimi
--
-- KDV HAVALE İNDİRİMİNİ DÜŞÜYOR (16.10.2026). Havale siparişinde müşteri
-- mal tutarından %3 (mağaza ayarı) indirimli öder; indirim
-- metadata.transfer_discount'ta. arc_fill_order_tax yalnızca kupon
-- indirimini (metadata.discount) düşüyordu: havale siparişlerinin KDV'si
-- indirimsiz tutar üzerinden, yani ~%3 FAZLA hesaplanıyordu — tahsil
-- edilmeyen tutarın vergisini beyan etmek demek. AC261015-D0A35A'da
-- ölçüldü: ₺1.816,52 toplamda KDV ₺170,25 yazıyordu.
--
-- İkinci yarısı panelde: havale indirimi sipariş oluştuktan SONRA
-- uygulanıyor (api/storefront/odeme) ve bu tetikleyici yalnızca tax = 0
-- iken hesaplıyor. Rota artık indirimle birlikte tax = 0 yazıyor; aksi
-- hâlde düzeltilmiş işlev bile hiç çalışmazdı.
--
-- Gövde canlı şemadan (supabase/schema/canli-sema.sql), tek fark indirim
-- toplamına transfer_discount'un eklenmesi.

CREATE OR REPLACE FUNCTION public.arc_fill_order_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rate numeric;
  v_tax bigint := 0;
  v_discount bigint := 0;
  v_gross bigint := 0;
begin
  -- Yalnızca yeni siparişte ve vergi girilmemişse hesapla.
  if coalesce(new.tax, 0) <> 0 then
    return new;
  end if;

  select coalesce(s.default_tax_rate, 20) into v_rate
  from public.arc_store_settings s
  where s.organization_id = new.organization_id;

  /*
    Her kalem kendi ürününün oranıyla hesaplanır. Ürün
    bulunamazsa mağaza varsayılanı kullanılır.
  */
  select coalesce(sum(
    public.arc_extract_vat(i.total, coalesce(p.tax_rate, v_rate, 20))
  ), 0)
  into v_tax
  from public.arc_order_items i
  left join public.arc_product_variants v
    on v.organization_id = i.organization_id
   and v.sku = i.sku
  left join public.arc_products p
    on p.id = v.product_id
  where i.order_id = new.id;

  -- Kargo da KDV'ye tabidir; genel oranla hesaplanır.
  v_tax := v_tax + public.arc_extract_vat(
    coalesce(new.shipping, 0),
    coalesce(v_rate, 20)
  );

  /*
    İndirim payı düşülür: kupon (discount) ve havale indirimi
    (transfer_discount). Müşteri indirimli tutarı ödüyor; indirim
    düşülmezse devlete fazla vergi beyan edilir. İndirim toplam üzerinden
    orantılı dağıtılıyor: hangi kaleme ait olduğu bilinmiyor.
  */
  v_discount := coalesce((new.metadata ->> 'discount')::bigint, 0)
              + coalesce((new.metadata ->> 'transfer_discount')::bigint, 0);
  v_gross := coalesce(new.subtotal, 0) + coalesce(new.shipping, 0);

  if v_discount > 0 and v_gross > 0 then
    v_tax := round(v_tax * (1 - least(v_discount, v_gross)::numeric / v_gross))::bigint;
  end if;

  update public.arc_orders
  set tax = v_tax
  where id = new.id;

  return new;
end;
$function$;

revoke all on function public.arc_fill_order_tax() from public, anon, authenticated;

-- GERİYE DÖNÜK: havale indirimli siparişlerin KDV'si yeniden hesaplanıyor.
-- Tetikleyici "UPDATE OF subtotal, total" ile çalışıyor; total kendine
-- yazılınca tetikleniyor, tax = 0 hesaplamayı açıyor.
update public.arc_orders
   set tax = 0, total = total
 where metadata ? 'transfer_discount'
   and coalesce((metadata ->> 'transfer_discount')::bigint, 0) > 0;
