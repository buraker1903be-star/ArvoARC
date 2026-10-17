-- vitrin_koleksiyonlari_tek_govde
--
-- ÇOĞALTMAYI BİTİRMENİN PİLOTU.
--
-- Vitrin fonksiyonlarının iki ailesi var ve gövdeleri birebir aynı
-- olmak zorunda: çok kiracılı `arc_storefront_*` ile ArvoCulture'a
-- özel `get_arvoculture_storefront_*`. 18 çift, yani her değişiklik
-- iki kez yapılmak zorunda — ve 17.10.2026'da üç kez yapılmadı
-- (arama dizini, sitemap sayfalaması, varyant sınırı). Ayrışmayı
-- artık `npm run check:ikizler` yakalıyor, ama asıl çözüm gövdeyi
-- bir kez yazmak.
--
-- DESEN: gövde `arc_vitrin_*(p_organization_id, …)` içinde bir kez
-- duruyor; iki aile ince sarmalayıcıya iniyor. Kupon ve iade
-- talebinde bu desen zaten vardı (arc_check_coupon,
-- arc_create_storefront_order) — yani uydurulmuş bir yapı değil,
-- var olanın yayılması.
--
-- VİTRİN KODU DEĞİŞMİYOR: iki sarmalayıcının adı, imzası ve dönüş
-- tipi aynı kaldı. Bu yüzden canlıya etkisi yok ve geri alınması da
-- tek migration.
--
-- ÇEKİRDEK ANON'A KAPALI. `arc_vitrin_*` kurum kimliğini
-- PARAMETRE olarak alıyor; anon'a açılsa tarayıcıdan başka bir
-- mağazanın kimliği geçilip verisi okunabilirdi. Sarmalayıcılar
-- kiracıyı kendileri çözüyor ve SECURITY DEFINER oldukları için
-- çekirdeği çağırabiliyorlar.
--
-- Pilot bilerek tek çift: koleksiyon listesi, salt okunur ve
-- menüyü besliyor. Doğrulandıktan sonra kalan 17 çift tek
-- migration ile gelecek.

CREATE OR REPLACE FUNCTION public.arc_vitrin_koleksiyonlar(p_organization_id uuid)
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.title,
    c.slug,
    c.description,
    coalesce(c.metadata ->> 'menu_group', '') as menu_group,
    coalesce(c.metadata ->> 'parent', '') as parent,
    count(distinct p.id)::integer as product_count
  from public.arc_collections c
  join public.organizations o
    on o.id = c.organization_id
   and o.id = p_organization_id
  left join public.arc_collection_products cp
    on cp.collection_id = c.id
  left join public.arc_products p
    on p.id = cp.product_id
   and p.status = 'active'
  where c.status = 'active'
  group by c.id, c.title, c.slug, c.description, c.metadata
  -- Boş koleksiyon menüde yer kaplamasın.
  having count(distinct p.id) > 0
  order by count(distinct p.id) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.arc_storefront_collections(p_host text)
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyonlar(public.arc_storefront_org(p_host));
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_collections()
 RETURNS TABLE(title text, slug text, description text, menu_group text, parent text, product_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.arc_vitrin_koleksiyonlar(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$
;

-- Çekirdek: yalnızca sarmalayıcılar ve sunucu anahtarı çağırabilir.
--
-- ANON VE AUTHENTICATED DE AÇIKÇA GERİ ALINIYOR. Supabase'in
-- varsayılanı yeni fonksiyonu anon'a AÇIK doğuruyor; "from public"
-- tek başına yetmiyor çünkü yetki PUBLIC'e değil doğrudan o rollere
-- veriliyor. 19.09.2026'da ArvoARC'ta siparişi "ödendi" yapan
-- fonksiyon bu yüzden anon'a açık kalmıştı.
revoke all on function public.arc_vitrin_koleksiyonlar(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_koleksiyonlar(p_organization_id uuid) to service_role;

-- Sarmalayıcıların yetkileri değişmedi; kural gereği yazılıyor.
revoke all on function public.arc_storefront_collections(p_host text) from public;
grant execute on function public.arc_storefront_collections(p_host text) to anon, authenticated, service_role;

revoke all on function public.get_arvoculture_storefront_collections() from public;
grant execute on function public.get_arvoculture_storefront_collections() to anon, authenticated, service_role;
