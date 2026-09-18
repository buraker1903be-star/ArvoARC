-- ============================================================
-- Satış ayarlarını vitrine açma
--
-- Kargo ücreti, ücretsiz kargo eşiği ve havale indirimi mağaza
-- panelinden değiştirilebilir hâle geldi (arc_store_settings), ama
-- vitrin (ArvoCulture-site) bunları okuyacak bir uç bulamadığı için
-- kodda sabit tutuyordu: 120 TL, 2.000 TL, %3. Mağaza sahibi paneldeki
-- ayarı değiştirse sepet bir tutar gösterecek, sipariş başka bir
-- tutarla oluşacaktı — 17 Eylül'deki sapmanın aynısı.
--
-- Bu fonksiyon yalnızca vitrinde zaten herkese gösterilen değerleri
-- döndürür (kargo tarifesi, havale indirimi). arc_store_settings'in geri
-- kalanı (IBAN, PayTR anahtarları, e-posta ayarları) açılmaz.
--
-- Varsayılanlar ARC'ın kendi hesabıyla aynı: ayar satırı yoksa sipariş
-- fonksiyonu 12000 / 200000 kuruş, ödeme ucu havaleyi açık ve %3 sayar
-- (bkz. 20260917150000_free_shipping_coupon.sql ve
-- src/app/api/storefront/odeme/route.ts).
--
-- Vitrin bu fonksiyon yoksa ya da boş dönerse kendi sabitlerine düşer;
-- yani bu migration vitrin dağıtımından önce ya da sonra uygulanabilir.
-- ============================================================

create or replace function public.get_arvoculture_storefront_settings()
returns table (
  shipping_fee bigint,
  free_shipping_threshold bigint,
  bank_transfer_enabled boolean,
  bank_transfer_discount_percent numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(s.shipping_fee, 12000),
    coalesce(s.free_shipping_threshold, 200000),
    coalesce(s.bank_transfer_enabled, true),
    coalesce(s.bank_transfer_discount_percent, 3)
  from public.organizations o
  left join public.arc_store_settings s
    on s.organization_id = o.id
  where o.slug = 'arvoculture'
  limit 1;
$$;

revoke all on function public.get_arvoculture_storefront_settings()
  from public;
grant execute on function public.get_arvoculture_storefront_settings()
  to anon, authenticated;
