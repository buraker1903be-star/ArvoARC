-- Ödenmemiş sipariş kuponun müşteri hakkını yakmıyor.
--
-- SORUN
-- Müşteri başına kullanım sayımı arc_orders üzerinde yapılıyor ve yalnızca
-- iptal/iade edilenleri eliyordu. Sipariş satırı ise ödemeden ÖNCE 'pending'
-- olarak yazılıyor (arc_create_storefront_order).
--
-- Tetikleyen durum: müşteri "ILK10" ile ödemeye geçer, PayTR ekranını
-- kapatır (kartını bulamaz, fikir değiştirir, sayfa kapanır), sonra tekrar
-- dener → "Bu indirim kodunu daha önce kullandınız." Kendi kodunu bir daha
-- kullanamaz ve nedenini anlamaz. "İlk alışverişe özel" kodlarda bu, satışı
-- doğrudan kaybettiriyor.
--
-- ÇÖZÜM
-- Sayılanlar: parası geçmiş siparişler ve hâlâ akıştaki taze denemeler.
-- 30 dakikalık pencere aynı anda iki sekmeden kupon yakmayı engellerken
-- terk edilmiş ödemeyi serbest bırakıyor.
--
-- Fonksiyonun geri kalanı 20260916210000'deki hâliyle birebir aynı.

create or replace function public.arc_check_coupon(
  p_organization_id uuid,
  p_code text,
  p_subtotal bigint default null,
  p_email text default null
)
returns table(valid boolean, message text, discount_type text, value numeric, minimum_subtotal bigint, discount_amount bigint)
language plpgsql
stable
security definer
set search_path to ''
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

  return query select true, 'Kod uygulandı.'::text, v_d.discount_type,
    v_d.value, v_d.minimum_subtotal, v_amount;
end;
$function$;
