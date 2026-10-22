/*
  VİTRİN KARGO FİYATINI SORUYOR, HESAPLAMIYOR (22.10.2026)

  Vitrin yurtdışı kargosunu TypeScript'te kendisi hesaplıyordu
  (lib/kargo-bolgesi) ve bu, ArvoARC'ın SQL'deki hesabının ikiziydi.
  Ağırlık kademesi eklenirken ikizin bedeli görünür oldu: vitrin
  sepetteki ürünlerin AĞIRLIĞINI bilmiyor — kart ve sepet kalemi
  ağırlık taşımıyor — yani taban ücreti gösterecek, ArvoARC kademeli
  ücreti tahsil edecekti. Müşteri 22 $ görüp 45 $ ödeyecekti ve
  ekranla tahsilatın ayrışması bu depodaki en pahalı kusur
  (17 Eylül 2026).

  Ağırlığı kart payloaduna eklemek de çözüm değildi: on dört ürün
  listesi fonksiyonuna sütun eklemek, sepet kalemine alan eklemek ve
  müşterinin TARAYICISINDA duran eski sepetlerin ağırlıksız kalması
  demekti.

  O yüzden vitrin artık SORUYOR. Hesap tek yerde
  (`arc_kargo_senti`, 20261022191631) ve sipariş fonksiyonu da onu
  çağırıyor; ekranda görünen ile tahsil edilen aynı satırdan çıkıyor.

  ÜCRET SENT CİNSİNDEN DE DÖNÜYOR: vitrin dolar tutarını gösteriyor
  ve onu TL'den geri hesaplamak yuvarlama farkı üretirdi.
*/

drop function if exists public.arc_vitrin_kargo_fiyati(uuid, text, jsonb);

create or replace function public.arc_vitrin_kargo_fiyati(
  p_organization_id uuid,
  p_country text,
  p_items jsonb
)
returns table (
  /* Kargo ücreti (USD sent). null = bu ülkeye gönderim yok. */
  fee_cents bigint,
  /* Tahsil edilecek kargo (kuruş). */
  fee_try bigint,
  /* Sepetin gönderi ağırlığı (gram) — "neden bu kadar" sorusunun yanıtı. */
  weight_grams bigint,
  /* Kâr paylı mal bedeli (kuruş): vitrin özetiyle birebir tutsun. */
  goods_try bigint,
  /* Engel sebebi: 'mod' | 'kur' | 'bolge' | null. */
  engel text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_international boolean;
  v_usd_rate numeric;
  v_usd_margin numeric;
  v_varsayilan integer;
  v_ulke text;
  v_item jsonb;
  v_qty integer;
  v_key text;
  v_variant record;
  v_mal bigint := 0;
  v_agirlik bigint := 0;
  v_usd_sent bigint := 0;
  v_senti bigint;
begin
  select coalesce(s.international_enabled, false),
         s.usd_rate,
         coalesce(s.usd_margin_percent, 0),
         coalesce(s.default_shipping_weight_grams, 500)
    into v_international, v_usd_rate, v_usd_margin, v_varsayilan
  from public.arc_store_settings s
  where s.organization_id = p_organization_id;

  /*
    ÜLKE KODU TEK BİÇİMDE — sipariş fonksiyonundaki listenin aynısı.
    Biri "Türkiye"yi yurtdışı sayarsa vitrin yurtdışı tarifesi
    gösterir, sipariş yurt içi kargosu tahsil eder.
  */
  v_ulke := upper(trim(coalesce(p_country, 'TR')));
  if v_ulke in ('TURKIYE', 'TÜRKIYE', 'TÜRKİYE', 'TURKEY', 'TURKIYE CUMHURIYETI') then
    v_ulke := 'TR';
  end if;
  if v_ulke = '' then v_ulke := 'TR'; end if;

  if v_ulke = 'TR' then
    /* Yurt içi tarifeyi vitrin kendisi hesaplıyor (ayar
       fonksiyonundan gelen ücret ve eşikle); burada yanıt yok. */
    return query select null::bigint, null::bigint, null::bigint, null::bigint, null::text;
    return;
  end if;

  if not coalesce(v_international, false) then
    return query select null::bigint, null::bigint, null::bigint, null::bigint, 'mod'::text;
    return;
  end if;
  if v_usd_rate is null or v_usd_rate <= 0 then
    return query select null::bigint, null::bigint, null::bigint, null::bigint, 'kur'::text;
    return;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_key := v_item ->> 'sku';
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_key is null or v_qty < 1 then continue; end if;

    /*
      SKU ÇÖZÜMÜ SİPARİŞ FONKSİYONUYLA AYNI SIRADA: sku, sonra ürün
      slug'ı; stokta olan ve en ucuz varyant önce. Farklı bir sıra,
      vitrinin başka bir varyantın ağırlığıyla fiyat göstermesi
      olurdu.
    */
    select v.price, p.shipping_weight_grams
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    where v.organization_id = p_organization_id
      and p.status = 'active'
      and (v.sku = v_key or p.slug = v_key)
    order by (v.sku = v_key) desc, (v.stock > 0) desc, v.price asc
    limit 1;

    if not found then continue; end if;

    /* Kâr payı yurtdışı fiyatının içinde (20261022190527). */
    v_mal := v_mal + round(v_variant.price * (1 + v_usd_margin / 100))::bigint * v_qty;
    v_agirlik := v_agirlik + coalesce(v_variant.shipping_weight_grams, v_varsayilan)::bigint * v_qty;
  end loop;

  /* Dolar tutarı = TL ÷ kur; çevrimde kâr payı YOK, mal bedeli onu
     zaten içeriyor. */
  v_usd_sent := ceil((v_mal::numeric / 100 / v_usd_rate) * 100);

  v_senti := public.arc_kargo_senti(p_organization_id, v_ulke, v_agirlik, v_usd_sent);

  if v_senti is null then
    return query select null::bigint, null::bigint, v_agirlik, v_mal, 'bolge'::text;
    return;
  end if;

  return query select
    v_senti,
    round(v_senti * v_usd_rate)::bigint,
    v_agirlik,
    v_mal,
    null::text;
end;
$function$;

revoke all on function public.arc_vitrin_kargo_fiyati(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.arc_vitrin_kargo_fiyati(uuid, text, jsonb) to service_role;

/* --------------------------------------------------------------
   SARMALAYICILAR

   YALNIZCA service_role: vitrin bunu SUNUCU tarafından çağırıyor
   (ödeme adımı dinamik bir rota). Tarayıcıdaki anon anahtarına
   açılsaydı fiyat sorgusu sepet içeriğiyle serbestçe çağrılabilir
   ve katalog fiyatları toplu okunabilirdi — kupon ve sipariş
   fonksiyonlarıyla aynı gerekçe.
   -------------------------------------------------------------- */

drop function if exists public.arc_storefront_shipping_quote(text, text, jsonb);

create or replace function public.arc_storefront_shipping_quote(
  p_host text,
  p_country text,
  p_items jsonb
)
returns table (
  fee_cents bigint,
  fee_try bigint,
  weight_grams bigint,
  goods_try bigint,
  engel text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_kargo_fiyati(
    public.arc_storefront_org(p_host), p_country, p_items);
$function$;

revoke all on function public.arc_storefront_shipping_quote(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.arc_storefront_shipping_quote(text, text, jsonb) to service_role;

drop function if exists public.get_arvoculture_storefront_shipping_quote(text, jsonb);

create or replace function public.get_arvoculture_storefront_shipping_quote(
  p_country text,
  p_items jsonb
)
returns table (
  fee_cents bigint,
  fee_try bigint,
  weight_grams bigint,
  goods_try bigint,
  engel text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_kargo_fiyati(
    (select id from public.organizations where slug = 'arvoculture' limit 1),
    p_country, p_items);
$function$;

revoke all on function public.get_arvoculture_storefront_shipping_quote(text, jsonb) from public, anon, authenticated;
grant execute on function public.get_arvoculture_storefront_shipping_quote(text, jsonb) to service_role;
