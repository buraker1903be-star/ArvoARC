-- ============================================================
-- Canlı şema denetiminden (18 Eylül 2026) çıkan üç düzeltme
-- ============================================================

-- ------------------------------------------------------------
-- 1) Yetkisiz çağrılabilen fonksiyonlar
-- ------------------------------------------------------------

-- arc_categorize_supplier_products: security definer, HİÇBİR yetki kontrolü
-- yok ve anon'a açıktı. Kimliksiz biri istediği kurum kimliğiyle çağırıp o
-- mağazada koleksiyon oluşturabiliyor, otomatik koleksiyonların başlığını ve
-- menü grubunu yeniden yazabiliyordu. Tek çağıran tedarikçi içe aktarma ucu
-- ve o service_role kullanıyor.
revoke all on function public.arc_categorize_supplier_products(text, uuid) from public, anon, authenticated;
grant execute on function public.arc_categorize_supplier_products(text, uuid) to service_role;

-- arc_reprice_supplier: security definer, yetki kontrolü yok, authenticated'a
-- açıktı. ArvoCulture'ın müşteri hesapları da aynı auth'ta olduğu için
-- vitrine giriş yapmış herhangi bir müşteri, bütün tedarikçi ürünlerinin
-- fiyatını kural fiyatına geri yazdırabiliyordu (elle verilmiş fiyatlar
-- silinir). Hiçbir uygulama çağırmıyor.
revoke all on function public.arc_reprice_supplier(text) from public, anon, authenticated;
grant execute on function public.arc_reprice_supplier(text) to service_role;

-- create_arvoculture_storefront_order ve check_arvoculture_coupon: vitrin
-- siparişi ve kupon kontrolü ARC'ın /api/storefront uçlarından geçiyor; o
-- uçlarda hız sınırı (sipariş 10/10 dk) ve origin kontrolü var. Bu iki eski
-- sarmalayıcı anon'a açıktı ve hiçbir uygulama çağırmıyor: PostgREST'ten
-- doğrudan çağırmak hız sınırını atlayıp sınırsız sipariş açmaya ve kupon
-- kodu taramaya izin veriyordu.
revoke all on function public.create_arvoculture_storefront_order(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_arvoculture_storefront_order(text, text, text, jsonb, jsonb, text) to service_role;
revoke all on function public.check_arvoculture_coupon(text, bigint, text) from public, anon, authenticated;
grant execute on function public.check_arvoculture_coupon(text, bigint, text) to service_role;

-- ------------------------------------------------------------
-- 2) Paneldeki "toplam stok" her mağazada ArvoCulture'ınkini gösteriyordu
-- ------------------------------------------------------------
-- Fonksiyon slug = 'arvoculture' ile sabitliydi. Panel ana sayfası ve stok
-- sayfası yanındaki bütün sayıları organization_id ile süzerken bu tek sayı
-- her mağazaya ArvoCulture'ın stok toplamını gösteriyordu (ve başka
-- mağazanın stok toplamını dışarı sızdırıyordu).
--
-- Kurum, panelin kendisiyle AYNI yoldan çözülür: arc_resolve_commerce_tenant
-- (src/lib/tenant.ts). İmza değişmediği için uygulama kodu değişmez; bu
-- migration ile uygulama dağıtımının sırası önemsizdir.
create or replace function public.arc_total_stock_units()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(v.stock), 0)::bigint
  from public.arc_product_variants v
  where v.organization_id = (
    select t.organization_id from public.arc_resolve_commerce_tenant() t limit 1
  );
$$;

-- Yetkiler açıkça yazılıyor (create or replace mevcut yetkiyi korur ama
-- varsayıma bırakılmıyor). Kimliksiz çağrı zaten 0 dönerdi: kiracı yok.
revoke all on function public.arc_total_stock_units() from public, anon;
grant execute on function public.arc_total_stock_units() to authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Kupon kullanım sınırı hiç işlemiyordu
-- ------------------------------------------------------------
-- arc_discounts.usage_count'u artıran hiçbir kod yoktu (ne SQL'de ne
-- uygulamada). Kupon kontrolü ve sipariş fonksiyonu "usage_count <
-- usage_limit" diye bakıyor, ama sayaç hep 0 kaldığı için "100 kişiyle
-- sınırlı" bir kod sınırsız kullanılıyordu; panel de "0/100 kullanım"
-- gösteriyordu.
--
-- Sayaç, sipariş ÖDENDİĞİ anda bir artar: vitrin kartla ödemede
-- arc_settle_storefront_order, havalede panelden onay (arc_update_order_status)
-- üzerinden. Tetikleyici ikisini birden kapsar. Ödenmemiş (terk edilmiş)
-- sipariş hak yakmaz — arc_check_coupon'daki kişi başı kuralla aynı ilke.
-- İade/kısmi iade durumundan tekrar "paid"e çekilen sipariş ikinci kez
-- sayılmaz.
--
-- Bilinen sınır: kontrol sipariş açılırken, sayım ödemede yapılıyor; aynı
-- anda ödeme ekranında olan birkaç müşteri sınırı birkaç kullanım aşabilir.
create or replace function public.arc_count_coupon_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(upper(trim(coalesce(new.metadata ->> 'coupon_code', ''))), '');
begin
  if v_code is not null
     and new.payment_status = 'paid'
     and coalesce(old.payment_status, '') not in ('paid', 'partially_refunded', 'refunded') then
    update public.arc_discounts d
       set usage_count = d.usage_count + 1,
           updated_at = now()
     where d.organization_id = new.organization_id
       and upper(d.code) = v_code;
  end if;
  return new;
end;
$$;

revoke all on function public.arc_count_coupon_use() from public, anon, authenticated;
grant execute on function public.arc_count_coupon_use() to service_role;

drop trigger if exists arc_orders_count_coupon_use on public.arc_orders;
create trigger arc_orders_count_coupon_use
  after update of payment_status on public.arc_orders
  for each row execute function public.arc_count_coupon_use();

-- İSTEĞE BAĞLI — geçmişi saymak için. Bilerek otomatik çalıştırılmıyor:
-- sınırı olan bir kod geçmiş kullanımlar sayılınca HEMEN kapanabilir.
-- Panelde kullanım sayılarını gerçek hâle getirmek isterseniz ayrıca
-- çalıştırın:
--
-- update public.arc_discounts d
--    set usage_count = (
--      select count(*) from public.arc_orders o
--      where o.organization_id = d.organization_id
--        and upper(coalesce(o.metadata ->> 'coupon_code', '')) = upper(d.code)
--        and o.payment_status in ('paid', 'partially_refunded', 'refunded')
--    )
--  where d.code is not null;
