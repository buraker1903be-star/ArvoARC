-- MEDYA KİTAPLIĞI: kurumun bütün ürün görselleri tek listede.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Görseller ürün ürün yükleniyor ve yüklendikten sonra yalnızca o
-- ürünün sayfasından görülebiliyordu: "bu fotoğrafı daha önce hangi
-- ürüne koymuştuk" sorusunun ekranda karşılığı yoktu.
--
-- TABLO AÇILMADI. Depodaki nesneleri listelemek için Supabase'in
-- list çağrısı özyinelemeli değil; 3.400 ürün klasörünü tek tek
-- dolaşmak gerekirdi. Bir arc_media tablosu da düşünüldü ama gereksiz:
-- kullanımdaki her görsel ZATEN arc_products.metadata->image_paths
-- içinde duruyor. İkinci bir yere yazmak, iki kaynağın ayrışması
-- demekti — bu projede bugün tam olarak o kusuru birkaç kez temizledik.
--
-- PostgREST jsonb dizisini satırlara açamıyor, fonksiyon bu yüzden var.
--
-- SECURITY INVOKER (tanımlayıcı DEĞİL). Fonksiyon çağıranın haklarıyla
-- çalışıyor, yani arc_products üzerindeki RLS olduğu gibi geçerli:
-- başka salonun görsellerini istemek boş liste döndürür. Tanımlayıcı
-- yapılsaydı kurum kısıtını fonksiyonun kendisi doğrulamak zorunda
-- kalır, unutulduğunda bütün kurumların görselleri açılırdı.
--
-- ARAMA METNİ: joker karakterler (% _) çağıran tarafta temizleniyor
-- (lib/panel-arama.ts terimiTemizle). Metin bağlı parametre olarak
-- geliyor, yani enjeksiyon değil yalnızca joker sorunu olurdu.

create or replace function public.arc_medya_listesi(
  p_organization_id uuid,
  p_arama text default null,
  p_limit integer default 60,
  p_offset integer default 0
)
 returns table(yol text, urun_id uuid, urun_adi text, urun_durumu text,
               sira integer, toplam bigint)
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  with gorseller as (
    select
      p.id as g_urun_id,
      p.name as g_urun_adi,
      p.status as g_urun_durumu,
      p.created_at as g_eklendi,
      k.yol as g_yol,
      k.sira::integer as g_sira
    from public.arc_products p
    cross join lateral jsonb_array_elements_text(
      coalesce(p.metadata -> 'image_paths', '[]'::jsonb)
    ) with ordinality as k(yol, sira)
    where p.organization_id = p_organization_id
      and (
        p_arama is null or btrim(p_arama) = ''
        or p.name ilike '%' || p_arama || '%'
      )
  )
  select
    g.g_yol, g.g_urun_id, g.g_urun_adi, g.g_urun_durumu, g.g_sira,
    /* Pencere işlevi LIMIT'ten ÖNCE hesaplanıyor: sayfalama için
       toplam sayı ikinci bir sorgu gerektirmiyor. */
    count(*) over () as g_toplam
  from gorseller g
  order by g.g_eklendi desc, g.g_urun_id, g.g_sira
  limit greatest(0, least(coalesce(p_limit, 60), 200))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

comment on function public.arc_medya_listesi(uuid, text, integer, integer) is
  'Kurumun ürün görselleri; kullanımdaki yollar metadata->image_paths''ten açılır.';

-- Postgres yeni fonksiyonu PUBLIC'e (anon dahil) açık oluşturuyor.
-- Panel okuması: anon'a KAPALI. 19.09.2026'da ARC'ta bu satırlar
-- unutulduğu için siparişi "ödendi" yapan fonksiyon herkese açıktı.
revoke all on function public.arc_medya_listesi(uuid, text, integer, integer) from public, anon;
grant execute on function public.arc_medya_listesi(uuid, text, integer, integer) to authenticated;
grant execute on function public.arc_medya_listesi(uuid, text, integer, integer) to service_role;

-- Geri almak için:
-- drop function if exists public.arc_medya_listesi(uuid, text, integer, integer);
