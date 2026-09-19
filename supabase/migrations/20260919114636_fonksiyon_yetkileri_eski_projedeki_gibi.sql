-- ============================================================
-- Fonksiyon yetkileri: eski projedeki (ArvoOS'la paylaşılan) hâline dönüş
--
-- Neden: 19.09.2026'da ARC kendi projesine taşındığında kurulum betiği
-- fonksiyonları oluşturdu ama eski projedeki "revoke" satırlarını taşımadı.
-- Yeni Supabase projesi her yeni fonksiyonu varsayılan olarak anon ve
-- authenticated rollerine açıyor. Sonuç: yalnızca sunucunun (service_role)
-- çağırması gereken fonksiyonlar vitrinin herkese açık anahtarıyla
-- dışarıdan çağrılabilir hâle geldi. En ağırları:
--   arc_settle_storefront_order / settle_arvoculture_storefront_order
--     → siparişi ödeme almadan "ödendi" yapar, stok düşer
--   arc_bulk_update_supplier_stock / arc_reprice_supplier
--     → tedarikçi ürünlerinin fiyat ve stoğunu yazar
--   arc_create_storefront_order, check_arvoculture_coupon,
--   arc_categorize_supplier_products
-- Bunları çağıran kod yalnızca sunucuda, service_role anahtarıyla çalışıyor
-- (api/storefront/odeme, api/storefront/paytr-bildirim,
-- api/tedarikci/ice-aktar); vitrin herkese açık anahtarla yalnızca okuma
-- fonksiyonlarını ve oturumlu müşteri fonksiyonlarını çağırıyor.
--
-- Hedef yetkiler eski projenin canlı dökümünden (ArvoOS
-- supabase/schema/canli-sema.sql) birebir alındı. Oturum isteyen
-- fonksiyonlarda anon kaldırılıyor ama zararsızdı (auth.uid() boş).
-- Geçiş yardımcıları (arc_aktarim_*) zaten yalnızca service_role'deydi;
-- 04c-temizlik.sql ile silinecekler.
-- ============================================================

-- Yalnızca: service_role
revoke all on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) from public, anon, authenticated;
grant execute on function public.arc_bulk_update_supplier_stock(p_organization_id uuid, p_supplier text, p_rows jsonb) to service_role;
revoke all on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_categorize_supplier_products(p_supplier text, p_organization_id uuid) to service_role;
revoke all on function public.arc_count_coupon_use() from public, anon, authenticated;
grant execute on function public.arc_count_coupon_use() to service_role;
revoke all on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public, anon, authenticated;
grant execute on function public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;
revoke all on function public.arc_log_order_event() from public, anon, authenticated;
grant execute on function public.arc_log_order_event() to service_role;
revoke all on function public.arc_reprice_supplier(p_supplier text) from public, anon, authenticated;
grant execute on function public.arc_reprice_supplier(p_supplier text) to service_role;
revoke all on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public, anon, authenticated;
grant execute on function public.arc_settle_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;
revoke all on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) from public, anon, authenticated;
grant execute on function public.check_arvoculture_coupon(p_code text, p_subtotal bigint, p_email text) to service_role;
revoke all on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) from public, anon, authenticated;
grant execute on function public.create_arvoculture_storefront_order(p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text) to service_role;
revoke all on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) from public, anon, authenticated;
grant execute on function public.settle_arvoculture_storefront_order(p_order_id uuid, p_paid boolean, p_payment_reference text, p_failure_reason text) to service_role;

-- Yalnızca: authenticated, service_role
revoke all on function public.arc_address_line(p_addr jsonb) from public, anon, authenticated;
grant execute on function public.arc_address_line(p_addr jsonb) to authenticated;
grant execute on function public.arc_address_line(p_addr jsonb) to service_role;
revoke all on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) from public, anon, authenticated;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to authenticated;
grant execute on function public.arc_adjust_inventory(p_variant_id uuid, p_quantity integer, p_kind text, p_reference_type text, p_reference_id text, p_note text) to service_role;
revoke all on function public.arc_baslik(p_text text) from public, anon, authenticated;
grant execute on function public.arc_baslik(p_text text) to authenticated;
grant execute on function public.arc_baslik(p_text text) to service_role;
revoke all on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) from public, anon, authenticated;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to authenticated;
grant execute on function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint, p_email text) to service_role;
revoke all on function public.arc_clean(p_value text) from public, anon, authenticated;
grant execute on function public.arc_clean(p_value text) to authenticated;
grant execute on function public.arc_clean(p_value text) to service_role;
revoke all on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) from public, anon, authenticated;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to authenticated;
grant execute on function public.arc_create_order(p_customer_name text, p_customer_email text, p_items jsonb, p_source text) to service_role;
revoke all on function public.arc_find_address(p_meta jsonb) from public, anon, authenticated;
grant execute on function public.arc_find_address(p_meta jsonb) to authenticated;
grant execute on function public.arc_find_address(p_meta jsonb) to service_role;
revoke all on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) from public, anon, authenticated;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to authenticated;
grant execute on function public.arc_first_text(p_source jsonb, VARIADIC p_keys text[]) to service_role;
revoke all on function public.arc_normalize_address(p_addr jsonb) from public, anon, authenticated;
grant execute on function public.arc_normalize_address(p_addr jsonb) to authenticated;
grant execute on function public.arc_normalize_address(p_addr jsonb) to service_role;
revoke all on function public.arc_resolve_commerce_tenant() from public, anon, authenticated;
grant execute on function public.arc_resolve_commerce_tenant() to authenticated;
grant execute on function public.arc_resolve_commerce_tenant() to service_role;
revoke all on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) from public, anon, authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin integer, p_shipping bigint, p_round integer) to service_role;
revoke all on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) from public, anon, authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to authenticated;
grant execute on function public.arc_sale_price(p_cost bigint, p_margin numeric, p_shipping bigint, p_round integer, p_service bigint) to service_role;
revoke all on function public.arc_slugify(p_text text) from public, anon, authenticated;
grant execute on function public.arc_slugify(p_text text) to authenticated;
grant execute on function public.arc_slugify(p_text text) to service_role;
revoke all on function public.arc_total_stock_units() from public, anon, authenticated;
grant execute on function public.arc_total_stock_units() to authenticated;
grant execute on function public.arc_total_stock_units() to service_role;
revoke all on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) from public, anon, authenticated;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to authenticated;
grant execute on function public.arc_update_order_status(p_order_id uuid, p_status text, p_payment_status text) to service_role;
revoke all on function public.claim_arvoculture_orders() from public, anon, authenticated;
grant execute on function public.claim_arvoculture_orders() to authenticated;
grant execute on function public.claim_arvoculture_orders() to service_role;
revoke all on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) from public, anon, authenticated;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to authenticated;
grant execute on function public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text) to service_role;
revoke all on function public.get_arvoculture_my_orders() from public, anon, authenticated;
grant execute on function public.get_arvoculture_my_orders() to authenticated;
grant execute on function public.get_arvoculture_my_orders() to service_role;
revoke all on function public.get_arvoculture_my_returns() from public, anon, authenticated;
grant execute on function public.get_arvoculture_my_returns() to authenticated;
grant execute on function public.get_arvoculture_my_returns() to service_role;
revoke all on function public.update_arvoculture_profile(p_full_name text, p_phone text) from public, anon, authenticated;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to authenticated;
grant execute on function public.update_arvoculture_profile(p_full_name text, p_phone text) to service_role;

-- Bundan sonra oluşturulan fonksiyonlar kendiliğinden anon'a açılmasın:
-- her migration gereken rolü açıkça "grant" etmeli (AGENTS.md). Unutulursa
-- fonksiyon kapalı kalır ve hata görünür olur; açık kalıp sessizce
-- sızdırmaz.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
