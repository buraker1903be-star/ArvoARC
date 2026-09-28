-- hayalet varyantlar temizlenir ve kimlik skuya baglanir
--
-- NE OLDU. Shopify CSV içe aktarımı (importActiveProducts) varyant
-- kimliğini CSV'deki SIRADAN üretiyordu: external_id = '<handle>:<n>'
-- ve upsert anahtarı da buydu. Ayıklama anahtarı ise seçenek
-- değerlerini KIRPMADAN alıyor, nitelikler ise kırpılarak okunuyordu:
-- yalnızca boşlukla ayrılan satırlar ayrı varyant sayılıyor ama
-- nitelikleri boş kaldığı için "Default" başlıkla yazılıyordu.
--
-- 20.08.2026'daki tek bir içe aktarımda on beş ürünün her birine 4-5
-- HAYALET varyant yazıldı: aynı SKU, boş attributes, "Default" başlık,
-- external_id <handle>:1 … <handle>:6. Kusur ancak 28.09.2026'da fiyat
-- aktarımı tek satır gösterip altı kayda yazınca görüldü.
--
-- Kod tarafı lib/shopify-varyant.ts'e taşındı ve testlendi. Bu
-- migration mevcut veriyi onarır ve aynı şeyin tekrarını kısıtla
-- engeller.
--
-- SIRA ÖNEMLİ: önce bağlantılar taşınır, sonra hayaletler silinir,
-- sonra kimlik yazılır, en son kısıt eklenir. Kısıt önce eklenseydi
-- mevcut yinelemeler yüzünden düşerdi.

-- 1) Sipariş kalemleri, hayalet kaydın yerine KALAN kayda taşınır.
--    Yabancı anahtar ON DELETE SET NULL: taşımadan silmek, geçmiş
--    siparişin hangi varyanta ait olduğunu sessizce kaybetmek olurdu.
--
--    Kalan kaydı seçen sorgu her adımda TEKRARLANIYOR, geçici tabloya
--    alınmıyor: migration'lar SQL Editor'den elle uygulanıyor ve her
--    ifade kendi işleminde koşabiliyor; geçici tablo aradan kaybolsa
--    2. ve 3. adım sessizce hiçbir şey yapmazdı. Sıralama
--    belirlenimci olduğu için tekrar aynı kaydı seçiyor.
with kalanlar as (
  /*
    KALACAK kayıt: nitelik taşıyan tercih edilir, eşitlikte en eski, o
    da eşitse en küçük kimlik. Sıralama belirlenimci olduğu için aynı
    sorgu her adımda aynı kaydı seçer.
  */
  select v.id,
         v.organization_id,
         first_value(v.id) over (
           partition by v.organization_id, v.product_id, v.sku
           order by (v.attributes <> '{}'::jsonb) desc, v.created_at, v.id
         ) as kalan_id
    from public.arc_product_variants v
),
hayaletler as (
  select id, organization_id, kalan_id from kalanlar where id <> kalan_id
)
update public.arc_order_items oi
   set variant_id = h.kalan_id
  from hayaletler h
 where oi.variant_id = h.id
   and oi.organization_id = h.organization_id;

-- 2) Stok hareketleri de taşınır.
--    Burada yabancı anahtar ON DELETE CASCADE: taşımadan silmek stok
--    geçmişini tamamen yok ederdi.
with kalanlar as (
  /*
    KALACAK kayıt: nitelik taşıyan tercih edilir, eşitlikte en eski, o
    da eşitse en küçük kimlik. Sıralama belirlenimci olduğu için aynı
    sorgu her adımda aynı kaydı seçer.
  */
  select v.id,
         v.organization_id,
         first_value(v.id) over (
           partition by v.organization_id, v.product_id, v.sku
           order by (v.attributes <> '{}'::jsonb) desc, v.created_at, v.id
         ) as kalan_id
    from public.arc_product_variants v
),
hayaletler as (
  select id, organization_id, kalan_id from kalanlar where id <> kalan_id
)
update public.arc_inventory_movements im
   set variant_id = h.kalan_id
  from hayaletler h
 where im.variant_id = h.id
   and im.organization_id = h.organization_id;

-- 3) Hayalet kayıtlar silinir. (Yukarıdaki iki adım koşmadan bu adım
--    koşarsa sipariş bağlantısı boşalır, stok geçmişi silinir.)
with kalanlar as (
  /*
    KALACAK kayıt: nitelik taşıyan tercih edilir, eşitlikte en eski, o
    da eşitse en küçük kimlik. Sıralama belirlenimci olduğu için aynı
    sorgu her adımda aynı kaydı seçer.
  */
  select v.id,
         v.organization_id,
         first_value(v.id) over (
           partition by v.organization_id, v.product_id, v.sku
           order by (v.attributes <> '{}'::jsonb) desc, v.created_at, v.id
         ) as kalan_id
    from public.arc_product_variants v
),
hayaletler as (
  select id, organization_id, kalan_id from kalanlar where id <> kalan_id
)
delete from public.arc_product_variants v
 using hayaletler h
 where v.id = h.id;

-- 4) "Default" başlıkları anlamlı hale getirilir.
--    Nitelik varsa ondan kurulur, yoksa SKU yazılır. "Default", aynı
--    üründe birkaç kez görününce hangi varyantın hangisi olduğunu
--    ekranda da veride de okunamaz hale getiriyordu.
update public.arc_product_variants v
   set title = coalesce(
         nullif((select string_agg(deger.value, ' / ' order by deger.ordinality)
                   from jsonb_each_text(v.attributes) with ordinality as deger(key, value, ordinality)), ''),
         v.sku
       ),
       updated_at = now()
 where coalesce(v.title, '') in ('', 'Default');

-- 5) Kimlik SKU'ya bağlanır: '<handle>:<sku>'.
--    Yalnızca içe aktarımdan gelen (external_id dolu) satırlar; elle
--    eklenen varyantlarda external_id zaten null.
--    arc_products(organization_id, slug) benzersiz olduğu için
--    '<slug>:<sku>' de benzersizdir.
update public.arc_product_variants v
   set external_id = p.slug || ':' || v.sku,
       updated_at = now()
  from public.arc_products p
 where p.id = v.product_id
   and v.external_id is not null
   and v.external_id <> p.slug || ':' || v.sku;

-- 6) Tekrarı kısıt engeller.
--    Ürün kapsamlı: iki AYRI ürünün aynı SKU'yu taşıması ayrı bir
--    sorun (canlıda "The Society Collection" öyleydi) ve o ürünler
--    arşivlendi; burada engellenen, tek ürün içinde aynı SKU'nun
--    birden çok kez bulunması.
create unique index if not exists arc_variants_product_sku_uniq
  on public.arc_product_variants (organization_id, product_id, sku);
