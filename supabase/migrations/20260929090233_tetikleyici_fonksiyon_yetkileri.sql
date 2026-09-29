-- TETİKLEYİCİ FONKSİYONLARINDA GEREKSİZ EXECUTE YETKİSİ
--
-- private ve public şemasındaki 13 tetikleyici fonksiyonunun 10'u anon'a
-- açıktı. Bir kısmı bilerek "grant" edilmişti, gerekçe olarak "satırı
-- yazan rolün çalıştırabilmesi gerekiyor" yazılmıştı (20260929065948'de
-- ben de önceki guard'lara bakarak aynısını yazdım); geri kalanı ise
-- hiç dokunulmadığı için Postgres'in varsayılanıyla PUBLIC kalmıştı —
-- AGENTS.md'nin uyardığı tam o durum.
--
-- GEREKÇE YANLIŞTI. PostgreSQL, tetikleyici tetiklenirken fonksiyonun
-- EXECUTE yetkisini DENETLEMİYOR. 29.09.2026'da PGlite'ta ölçüldü:
-- yetki tamamen kaldırıldıktan sonra (proacl yalnızca postgres=X/postgres)
-- INSERT çalıştı ve tetikleyici önek ile alt alan adını yine üretti.
--
-- Doğrudan çağrı da bir yol değil: tetikleyici dönen bir fonksiyon
-- tetikleyici dışında çağrıldığında Postgres hata veriyor. Yani bu bir
-- açık değil, ama gerekmeyen yetki bir sonraki fonksiyonu yazanın
-- kopyalayacağı kalıp oluyor — ARC'ta siparişi "ödendi" yapan fonksiyonun
-- anon'a açık kalması da böyle olmuştu (19.09.2026).
--
-- service_role ve postgres'e dokunulmuyor: onlar zaten sunucu tarafı ve
-- daraltmanın kazancı yok; buradaki soru istemciden erişilebilen roller.
--
-- tests/db/yetki.test.mjs artık bunu sabitliyor: eski denetim
-- "prorettype <> trigger" ile tetikleyicileri eliyordu, boşluk oradaydı.

revoke all on function private.arc_guard_payment_settings() from public, anon, authenticated;
revoke all on function private.arc_guard_store_domains() from public, anon, authenticated;
revoke all on function private.arc_magaza_varsayilanlari() from public, anon, authenticated;
revoke all on function private.arc_order_item_cost() from public, anon, authenticated;
revoke all on function private.arvo_arc_shipment_item_guard() from public, anon, authenticated;
revoke all on function private.arvo_arc_shipment_source_guard() from public, anon, authenticated;
revoke all on function private.arvo_arc_shipment_touch() from public, anon, authenticated;
revoke all on function public.arc_address_before_write() from public, anon, authenticated;
revoke all on function public.arc_check_supplier_stock() from public, anon, authenticated;
revoke all on function public.arc_count_coupon_use() from public, anon, authenticated;
revoke all on function public.arc_fill_order_tax() from public, anon, authenticated;
revoke all on function public.arc_log_order_event() from public, anon, authenticated;
revoke all on function public.attach_arvoculture_order_owner() from public, anon, authenticated;

-- Geri almak için (davranışı değiştirmez, yalnızca eski hâle döner):
-- grant execute on function private.arc_magaza_varsayilanlari() to public;
-- … diğerleri için de aynı biçim.
