/*
  HEDİYE ÇEKİNİN ÖDEMEDE KULLANILMASI (18.10.2026)

  Çek tanımlanıyor ve müşteri bakiyesini görüyordu
  (20261018181831) ama harcanamıyordu.

  ÇEK EN SONA UYGULANIR ve bu yüzden sipariş fonksiyonunun
  içinde değil, ödeme ucundan çağrılır. Sipariş fonksiyonu kuponu
  ve kargoyu hesaplayıp bitiriyor; HAVALE İNDİRİMİ ise ondan
  SONRA, ödeme ucunda uygulanıyor (api/storefront/odeme). Çeki
  sipariş fonksiyonunun içine koysaydık havale indiriminden ÖNCE
  düşülürdü: müşterinin çekinden hak ettiğinden fazlası yakılır,
  tahsil edilen tutar da yanlış çıkardı.

  ASGARİ SEPET TUTARI. Çek kuponla aynı korumaya muhtaç: 500 TL'lik
  bir çek 50 TL'lik siparişe uygulanırsa kargo bedeli satıştan
  büyük olabiliyor ve bakiye on ayrı küçük siparişe dağılıyor.
  Alan kuponunkiyle AYNI adı taşıyor (`minimum_subtotal`, kuruş)
  ve ölçüt de aynı: SEPETİN ARA TOPLAMI — kupon düşülmüş tutar
  değil. "500 TL ve üzeri siparişlerde geçerli" cümlesi sepetin
  büyüklüğü hakkında, çekin tabanı hakkında değil.

  Varsayılan 0: eskiden tanımlanmış çeklerde kural yok ve
  olmayan bir kuralı geriye dönük uydurmak, müşterinin elindeki
  çeki değersizleştirirdi.
*/

alter table public.arc_gift_cards
  add column if not exists minimum_subtotal bigint not null default 0;

/* --------------------------------------------------------------
   ÇEKİN SİPARİŞTE HARCANMASI
   -------------------------------------------------------------- */

create or replace function public.arc_gift_card_apply(
  p_organization_id uuid,
  p_order_id uuid,
  p_code text,
  p_max bigint
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_card public.arc_gift_cards%rowtype;
  v_onceki bigint;
  v_tutar bigint;
  v_ara_toplam bigint;
begin
  if p_organization_id is null or p_order_id is null then
    return 0;
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    return 0;
  end if;

  /*
    AYNI SİPARİŞ İÇİN İKİNCİ KEZ ÇAĞRILDIYSA bakiyeye dokunmadan
    ilk uygulanan tutar dönüyor: ödeme ucu yeniden çağrılabiliyor
    (müşteri PayTR ekranını kapatıp tekrar deniyor). Yükleme
    hareketi (negatif) hesaba katılmıyor; yalnızca harcamalar.
  */
  select coalesce(sum(u.amount), 0) into v_onceki
  from public.arc_gift_card_uses u
  where u.order_id = p_order_id
    and u.amount > 0;

  if v_onceki > 0 then
    return v_onceki;
  end if;

  /* SATIR KİLİTLENİR: iki sekmeden aynı anda ödeme denenirse
     bakiye iki kez harcanabilirdi. */
  select * into v_card
  from public.arc_gift_cards g
  where g.organization_id = p_organization_id
    and upper(g.code) = upper(trim(p_code))
  limit 1
  for update;

  if v_card.id is null then return 0; end if;
  if v_card.status <> 'active' then return 0; end if;
  if v_card.expires_at is not null and v_card.expires_at < now() then
    return 0;
  end if;
  if coalesce(v_card.balance, 0) <= 0 then return 0; end if;

  /*
    ASGARİ SEPET TUTARI. Ölçüt ARA TOPLAM: kupon düşülmüş tutar
    değil, sepetin kendi büyüklüğü — kupondaki kuralla aynı
    (`v_subtotal >= d.minimum_subtotal`). Sipariş okunamazsa çek
    uygulanmıyor: bilinmeyen bir sepete kural uygulanmış sayılamaz.
  */
  if coalesce(v_card.minimum_subtotal, 0) > 0 then
    select o.subtotal into v_ara_toplam
    from public.arc_orders o
    where o.id = p_order_id
      and o.organization_id = p_organization_id;

    if v_ara_toplam is null then return 0; end if;
    if v_ara_toplam < v_card.minimum_subtotal then return 0; end if;
  end if;

  /* Ödenecek tutardan fazlası harcanmaz: çek para, fazlası
     müşterinin hakkı olarak çekte kalır. */
  v_tutar := least(v_card.balance, greatest(coalesce(p_max, 0), 0));
  if v_tutar <= 0 then return 0; end if;

  update public.arc_gift_cards
     set balance = balance - v_tutar,
         updated_at = now()
   where id = v_card.id;

  insert into public.arc_gift_card_uses (gift_card_id, order_id, amount, note)
  values (v_card.id, p_order_id, v_tutar, 'Siparişte kullanıldı');

  return v_tutar;
end;
$function$;

revoke all on function public.arc_gift_card_apply(uuid, uuid, text, bigint)
  from public, anon, authenticated;
/*
  YALNIZCA SUNUCU. Tarayıcıdaki anon anahtarla çağrılabilseydi
  müşteri kendi çekini istediği siparişe, istediği tutarla
  yazabilirdi — kupon ve sipariş oluşturma da aynı gerekçeyle
  yalnızca service_role'a açık.
*/
grant execute on function public.arc_gift_card_apply(uuid, uuid, text, bigint)
  to service_role;

/* --------------------------------------------------------------
   MÜŞTERİNİN ÇEKLERİ — asgari tutar da dönüyor

   Ekran "500 TL ve üzeri siparişlerde geçerli" diyebilmeli;
   kuralı yalnızca ödeme anında öğrenmek, müşteriyi sepeti
   hazırladıktan sonra duvara toslatmak olurdu. Dönüş tipi
   değiştiği için önce drop (Postgres create or replace ile
   dönüş tablosunu değiştirmiyor).
   -------------------------------------------------------------- */

drop function if exists public.arc_storefront_my_gift_cards(text);

create or replace function public.arc_storefront_my_gift_cards(p_host text)
returns table (
  id uuid,
  code text,
  balance bigint,
  initial_amount bigint,
  status text,
  expires_at timestamptz,
  minimum_subtotal bigint
)
language sql
stable
security definer
set search_path to ''
as $function$
  select g.id, g.code, g.balance, g.initial_amount, g.status, g.expires_at,
         coalesce(g.minimum_subtotal, 0)
  from public.arc_gift_cards g
  where g.organization_id = public.arc_storefront_org(p_host)
    and g.status = 'active'
    /*
      Oturumdaki e-posta. auth.uid() üzerinden okunuyor; istemcinin
      gönderdiği bir parametreye bakılsaydı herkes başkasının
      e-postasını yazıp onun bakiyesini görürdü.
    */
    and lower(g.recipient_email) = lower((
      select u.email from auth.users u where u.id = auth.uid()
    ))
  order by (g.balance > 0) desc, g.created_at desc;
$function$;

revoke all on function public.arc_storefront_my_gift_cards(text)
  from public, anon, authenticated;
grant execute on function public.arc_storefront_my_gift_cards(text)
  to authenticated;
grant execute on function public.arc_storefront_my_gift_cards(text)
  to service_role;

/* --------------------------------------------------------------
   ÇEK TANIMLAMA — asgari tutar parametresiyle
   -------------------------------------------------------------- */

create or replace function public.arc_gift_card_issue(
  p_organization_id uuid,
  p_code text,
  p_amount bigint,
  p_recipient_email text default null,
  p_recipient_name text default null,
  p_expires_at timestamptz default null,
  p_note text default null,
  p_minimum_subtotal bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Hediye çeki tutarı sıfırdan büyük olmalı.';
  end if;

  if p_code is null or length(trim(p_code)) < 4 then
    raise exception 'Hediye çeki kodu en az dört karakter olmalı.';
  end if;

  if coalesce(p_minimum_subtotal, 0) < 0 then
    raise exception 'Asgari sepet tutarı eksi olamaz.';
  end if;

  insert into public.arc_gift_cards (
    organization_id, code, initial_amount, balance,
    recipient_email, recipient_name, expires_at, note, minimum_subtotal
  )
  values (
    p_organization_id, upper(trim(p_code)), p_amount, p_amount,
    nullif(trim(lower(p_recipient_email)), ''),
    nullif(trim(p_recipient_name), ''),
    p_expires_at,
    nullif(trim(p_note), ''),
    coalesce(p_minimum_subtotal, 0)
  )
  returning id into v_id;

  /*
    Yükleme de bir hareket: bakiyenin nereden geldiği kütükte
    görünsün. Negatif, çünkü harcama pozitif.
  */
  insert into public.arc_gift_card_uses (gift_card_id, amount, note)
  values (v_id, -p_amount, 'Çek tanımlandı');

  return v_id;
end;
$function$;

revoke all on function public.arc_gift_card_issue(
  uuid, text, bigint, text, text, timestamptz, text, bigint)
  from public, anon, authenticated;
/* Para yaratan bir çağrı: yalnızca sunucu. */
grant execute on function public.arc_gift_card_issue(
  uuid, text, bigint, text, text, timestamptz, text, bigint)
  to service_role;

/* Eski imza (asgari tutarsız) kalkıyor: iki sürüm yan yana
   durursa panel hangisini çağırdığını bilmeden kuralı atlayabilir. */
drop function if exists public.arc_gift_card_issue(
  uuid, text, bigint, text, text, timestamptz, text);
