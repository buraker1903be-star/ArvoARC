-- VİTRİN YAZMA YOLU DA KİRACIYA GÖRE: kupon, sipariş, iade talebi.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- 20260929062348 okuma tarafını kiracıya bağlamıştı; yazma tarafı hâlâ
-- tek kiracıdaydı. Bu üçü olmadan ikinci salonun mağazası ürün
-- gösterebilir ama SATIŞ YAPAMAZ.
--
-- YETKİLER ESKİSİYLE BİREBİR AYNI, ÇÜNKÜ PARA DOKUNUYOR:
--
--   kupon, sipariş      yalnızca service_role — vitrin bunları
--                       tarayıcıdan değil kendi sunucusundan çağırıyor
--   iade talebi         authenticated + service_role (auth.uid() şart)
--
-- anon'a açmak, sepeti tarayıcıdan doğrudan "sipariş oluştur"a
-- bağlamak demekti. Eski fonksiyonlar da böyle kurulmuş; bu dosya o
-- kararı aynen taşıyor, gevşetmiyor.
--
-- EKLEYEREK: eski check_arvoculture_coupon,
-- create_arvoculture_storefront_order ve
-- create_arvoculture_return_request yerinde duruyor; canlı mağaza
-- etkilenmiyor.

-- ---------- Kupon ----------
--
-- Gövde eskisiyle aynı; tek fark kurumun sabit slug yerine host'tan
-- çözülmesi. İç fonksiyon (arc_check_coupon) zaten kurum kimliği
-- alıyordu, yani burada yalnızca sarmalayıcı değişiyor.

create or replace function public.arc_storefront_coupon(p_host text, p_code text, p_subtotal bigint default 0, p_email text default null)
 returns table(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select * from public.arc_check_coupon(
    public.arc_storefront_org(p_host), p_code, p_subtotal, p_email)
$function$;

revoke all on function public.arc_storefront_coupon(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.arc_storefront_coupon(text, text, bigint, text) to service_role;

-- ---------- Sipariş oluşturma ----------

create or replace function public.arc_storefront_create_order(p_host text, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text default null)
 returns table(order_id uuid, order_number text, total bigint)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org_id uuid;
begin
  v_org_id := public.arc_storefront_org(p_host);
  /*
    Mesaj eskisinden AÇIK: "Organizasyon bulunamadı" derken sorun
    kurumda sanılıyordu, oysa sebep adresin bir mağazaya bağlı
    olmaması (alan adı doğrulanmamış ya da alt alan adı atanmamış).
  */
  if v_org_id is null then
    raise exception 'Bu adres bir mağazaya bağlı değil: %', coalesce(p_host, '(boş)');
  end if;
  return query select * from public.arc_create_storefront_order(
    v_org_id, p_email, p_name, p_phone, p_address, p_items, p_coupon_code);
end;
$function$;

revoke all on function public.arc_storefront_create_order(text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.arc_storefront_create_order(text, text, text, text, jsonb, jsonb, text) to service_role;
create or replace function public.arc_storefront_return_request(p_host text, p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
as $function$
declare
  v_order public.arc_orders%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days integer;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  select * into v_order
  from public.arc_orders o
  join public.organizations org
    on org.id = o.organization_id and org.id = public.arc_storefront_org(p_host)
  where o.order_number = p_order_number
    and o.user_id = v_uid
  limit 1;

  if v_order.id is null then
    raise exception 'Sipariş bulunamadı.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Ödemesi tamamlanmamış sipariş için iade talebi açılamaz.';
  end if;

  /*
    Cayma süresi. Teslim tarihi kayıtlı değilse sipariş
    tarihinden sayılıyor; müşteri lehine geniş yorum.
  */
  v_days := extract(day from now() - v_order.created_at);

  if v_days > 30 then
    raise exception 'İade süresi dolmuş.';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'İade sebebi belirtilmeli.';
  end if;

  /*
    KALEMLER SİPARİŞTEN YENİDEN KURULUYOR, gelen jsonb olduğu gibi
    saklanmıyor. Önce coalesce(p_items,'[]') ile doğrudan yazılıyordu:
    istemci istediği SKU'yu, adedi ve tutarı gönderebiliyordu. Para
    tarafı sipariş toplamıyla sınırlı olduğu için korunuyordu ama
    panelde yanlış kalem ve yanlış tutar görünüyordu; stoğa geri ekleme
    de bu adede güveniyor.

    İstemciden yalnızca HANGİ SKU ve KAÇ ADET bilgisi alınıyor; ad ve
    tutar siparişin kendi kaydından yazılıyor.
  */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'sku', oi.sku,
             'name', oi.product_name,
             /* Adet SİPARİŞTEKİ adetle sınırlı. */
             'quantity', least(k.adet, oi.quantity),
             /* Tutar siparişin birim fiyatından; istemciden alınmıyor. */
             'total', oi.unit_price * least(k.adet, oi.quantity)
           )
         ), '[]'::jsonb)
    into v_items
  from (
    select
      nullif(trim(x.sku), '') as sku,
      /* Eksi, sıfır ve boş adet 1 sayılıyor: kutucuğu işaretleyen
         müşteri en az bir adet iade ediyor demektir. */
      greatest(1, coalesce(x.quantity, 1)) as adet
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(sku text, quantity int)
    where nullif(trim(x.sku), '') is not null
  ) k
  join lateral (
    /* Siparişte olmayan SKU eleniyor. */
    select o.sku, o.product_name, o.unit_price, o.quantity
    from public.arc_order_items o
    where o.order_id = v_order.id
      and o.sku = k.sku
    limit 1
  ) oi on true;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'İade edilecek ürün seçilmedi.';
  end if;

  insert into public.arc_return_requests
    (organization_id, order_id, user_id, items, reason, note)
  values
    (v_order.organization_id, v_order.id, v_uid,
     v_items, trim(p_reason), nullif(trim(p_note), ''))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Bu sipariş için zaten açık bir iade talebiniz var.';
end;
$function$;

revoke all on function public.arc_storefront_return_request(text, text, jsonb, text, text) from public, anon;
grant execute on function public.arc_storefront_return_request(text, text, jsonb, text, text) to authenticated;
grant execute on function public.arc_storefront_return_request(text, text, jsonb, text, text) to service_role;


-- ---------- Tedarikçi yeniden fiyatlama ----------
--
-- arc_reprice_supplier kurumu sabit yazıyordu, yani ikinci salonun
-- tedarikçi fiyatları hiç güncellenmezdi.
--
-- KARDEŞİYLE AYNI KALIP: arc_categorize_supplier_products zaten
-- p_organization_id alıyor ve sabit slug'ı yalnızca parametre
-- verilmediğinde yedek olarak kullanıyor (eski çağıranlar için).
-- Aynı biçim burada da kuruldu: parametre kazanır, yoksa eski
-- davranış sürer. Böylece imza GENİŞLİYOR ama mevcut çağrılar
-- olduğu gibi çalışmaya devam ediyor.

create or replace function public.arc_reprice_supplier(p_supplier text, p_organization_id uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rule record;
  v_count integer;
begin
  select s.* into v_rule
  from public.arc_suppliers s
  where s.code = p_supplier
    and s.organization_id = coalesce(
      p_organization_id,
      (select id from public.organizations where slug = 'arvoculture' limit 1)
    )
  limit 1;

  if not found then
    raise exception 'Tedarikçi bulunamadı: %', p_supplier;
  end if;

  update public.arc_product_variants v
     set price = public.arc_sale_price(
           v.cost_price,
           v_rule.margin_percent,
           v_rule.shipping_markup,
           v_rule.round_to_kurus
         ),
         updated_at = now()
   where v.organization_id = v_rule.organization_id
     and v.supplier = p_supplier
     and v.cost_price is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Yeni imza yeni bir fonksiyon: yetkileri eskisiyle aynı (yalnızca
-- servis anahtarı — toplu fiyat yazan bir iş kullanıcıya açılmaz).
revoke all on function public.arc_reprice_supplier(text, uuid) from public, anon, authenticated;
grant execute on function public.arc_reprice_supplier(text, uuid) to service_role;

-- ---------- KUSUR DÜZELTMESİ: geçerli kupon hata veriyordu ----------
--
-- Çok kiracılı sarmalayıcıyı sınarken çıktı ve çok kiracılıkla
-- ilgisi yok: arc_check_coupon'ın BAŞARI dalı düşüyordu.
--
--   arc_discounts.value          bigint
--   fonksiyonun çıktı sütunu     numeric
--
-- RETURN QUERY yapısal eşleşme istiyor, örtük dönüşüm uygulamıyor.
-- Reddeden dalların hepsi null::numeric yazdığı için onlar temiz
-- dönüyordu; yalnızca "valid = true" dönen iki dal hata veriyordu.
--
-- Görünen sonuç: müşteri GEÇERLİ bir kupon kodu giriyor ve indirim
-- uygulanmıyor. Sipariş oluşturma bu fonksiyonu çağırmıyor (kuponu
-- doğrudan tablodan okuyor), yani ödeme akışı bozulmuyor — bozulan,
-- ödemeden önceki "Kupon uygula" doğrulaması.
--
-- PGlite'ta beş dalın tamamı tek tek üretildi; düzeltmenin ardından
-- geçerli kupon da temiz dönüyor (tests/db/vitrin-yazma-kiraci).
-- İmza değişmiyor, yalnızca gövde; canlı çağıranlar etkilenmiyor.

create or replace function public.arc_check_coupon(p_organization_id uuid, p_code text, p_subtotal bigint DEFAULT NULL::bigint, p_email text DEFAULT NULL::text)
 RETURNS TABLE(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
as $function$
declare
  v_d public.arc_discounts%rowtype;
  v_used integer := 0;
  v_amount bigint := 0;
begin
  if p_organization_id is null then
    return query select false, 'Mağaza bulunamadı.'::text, null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    return query select false, 'Kupon kodu girin.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  select * into v_d
  from public.arc_discounts d
  where d.organization_id = p_organization_id
    and upper(d.code) = upper(trim(p_code))
  limit 1;

  if v_d.id is null then
    return query select false, 'Bu kod geçerli değil.'::text, null::text,
      null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.status <> 'active' then
    return query select false, 'Bu kampanya artık geçerli değil.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.starts_at is not null and v_d.starts_at > now() then
    return query select false, 'Bu kampanya henüz başlamadı.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  if v_d.ends_at is not null and v_d.ends_at < now() then
    return query select false, 'Bu kampanyanın süresi dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /* Toplam kullanım hakkı. */
  if v_d.usage_limit is not null
     and coalesce(v_d.usage_count, 0) >= v_d.usage_limit then
    return query select false, 'Bu kampanyanın kullanım hakkı dolmuş.'::text,
      null::text, null::numeric, null::bigint, 0::bigint;
    return;
  end if;

  /*
    Müşteri başına kullanım. "İlk alışverişe özel" kodlarda kritik:
    aynı müşteri ikinci kez kullanamamalı.
  */
  if v_d.per_customer_limit is not null and p_email is not null then
    select count(*) into v_used
    from public.arc_orders o
    where o.organization_id = p_organization_id
      and lower(o.customer_email) = lower(trim(p_email))
      and upper(coalesce(o.metadata ->> 'coupon_code', '')) = upper(trim(p_code))
      and o.status not in ('cancelled', 'refunded')
      /*
        Ödenmemiş sipariş hakkı YAKMAZ. Sipariş satırı ödemeden ÖNCE
        'pending' olarak yazılıyor; müşteri PayTR ekranını kapatıp tekrar
        denediğinde kendi kodunu kullanamaz hale geliyordu.

        Sayılanlar: ödenmiş siparişler (kısmi iade dahil, para geçmiş) ve
        hâlâ akıştaki taze denemeler. 30 dakikalık pencere, aynı anda iki
        sekmeden kupon yakmayı engellerken terk edilmiş ödemeyi serbest
        bırakıyor. Havale siparişi onaylanınca 'paid' oluyor, zaten sayılır.
      */
      and (
        o.payment_status in ('paid', 'partially_refunded')
        or o.created_at > now() - interval '30 minutes'
      );

    if v_used >= v_d.per_customer_limit then
      return query select false,
        'Bu indirim kodunu daha önce kullandınız.'::text,
        null::text, null::numeric, null::bigint, 0::bigint;
      return;
    end if;
  end if;

  /*
    Alt limit yalnızca ara toplam BİLİNİYORSA kontrol edilir. Bilinmiyorsa
    (p_subtotal null) bu kural atlanır; sipariş oluşturulurken gerçek ara
    toplamla zaten uygulanıyor.
  */
  if p_subtotal is not null
     and v_d.minimum_subtotal is not null
     and p_subtotal < v_d.minimum_subtotal then
    return query select false,
      format('Bu kod %s TL ve üzeri siparişlerde geçerli.',
             to_char(v_d.minimum_subtotal / 100.0, 'FM999G999D00'))::text,
      null::text, null::numeric, v_d.minimum_subtotal, 0::bigint;
    return;
  end if;

  /*
    İndirim tutarı. Sabit indirimde value zaten kuruş (panel
    Math.round(tutar*100) ile yazıyor). Ara toplam bilinmiyorsa tutar
    hesaplanamaz; 0 dönülür, kodun geçerliliği yine bildirilir.
  */
  if p_subtotal is null then
    v_amount := 0;
  elsif v_d.discount_type = 'percentage' then
    v_amount := round(p_subtotal * v_d.value / 100);
  else
    v_amount := least(v_d.value::bigint, p_subtotal);
  end if;

  /*
    v_d.value BIGINT, çıktı sütunu NUMERIC. RETURN QUERY yapısal
    eşleşme istiyor ve örtük dönüşüm uygulamıyor; cast olmadan bu
    satır "structure of query does not match function result type"
    veriyordu. Reddeden dallar null::numeric yazdığı için onlar
    çalışıyor, YALNIZCA geçerli kupon düşüyordu.
  */
  return query select true, 'Kod uygulandı.'::text, v_d.discount_type,
    v_d.value::numeric, v_d.minimum_subtotal, v_amount;
end;
$function$;

-- İmza aynı kaldığı için yetkiler korunuyor; yine de açıkça yazılıyor.
revoke all on function public.arc_check_coupon(uuid, text, bigint, text) from public, anon;
grant execute on function public.arc_check_coupon(uuid, text, bigint, text) to authenticated;
grant execute on function public.arc_check_coupon(uuid, text, bigint, text) to service_role;
