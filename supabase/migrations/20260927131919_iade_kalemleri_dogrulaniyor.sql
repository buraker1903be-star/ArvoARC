-- İADE TALEBİNİN KALEMLERİ DOĞRULANIYOR.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Gelen jsonb olduğu gibi saklanıyordu: coalesce(p_items, '[]'::jsonb).
-- Yani müşterinin tarayıcısından istenen SKU, istenen adet ve istenen
-- TUTAR gönderilebiliyordu.
--
-- Para tarafı korunuyordu (panel iade tutarını sipariş toplamı eksi
-- daha önce iade edilenle sınırlıyor), ama:
--   - panelde yanlış ürün ve yanlış tutar görünüyordu,
--   - 27.09.2026'da eklenen "iade edileni stoğa geri ekle" adımı bu
--     adede güveniyordu; {sku:"X", quantity:9999} stoğu şişirirdi.
--
-- Artık istemciden yalnızca HANGİ SKU ve KAÇ ADET alınıyor; ürün adı ve
-- tutar siparişin kendi kaydından (arc_order_items) yazılıyor. Siparişte
-- olmayan SKU elenir; hiçbir kalem eşleşmezse talep açılmaz.
--
-- Not: panel tarafında da bağımsız bir sınır var (lib/iade-stok.ts);
-- bu migration uygulanmasa bile stok şişmez. İki koruma bilerek ayrı:
-- biri kaydın doğruluğunu, öteki stoğun doğruluğunu güvenceye alıyor.

CREATE OR REPLACE FUNCTION public.create_arvoculture_return_request(p_order_number text, p_items jsonb, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    on org.id = o.organization_id and org.slug = 'arvoculture'
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
$function$
;

revoke all on function public.create_arvoculture_return_request(text, jsonb, text, text) from public, anon;
grant execute on function public.create_arvoculture_return_request(text, jsonb, text, text) to authenticated;
grant execute on function public.create_arvoculture_return_request(text, jsonb, text, text) to service_role;
