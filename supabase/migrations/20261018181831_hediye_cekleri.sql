/*
  HEDİYE ÇEKİ — TANIM VE BAKİYE (18.10.2026)

  Vitrinde "Hediye çeklerim" diye bir ekran isteniyor ama bu
  veritabanında hediye çeki diye bir şey YOKTU: kupon
  (`arc_discounts`) bir KURAL — "%10", "500 TL", bir koşul ve bir
  kullanım hakkı. Hediye çeki ise PARA: bir bakiyesi var, parça
  parça harcanıyor ve harcandıkça azalıyor. Kuponu bakiyeli hale
  getirmeye çalışmak iki ayrı şeyi tek tabloya sıkıştırmak olurdu;
  `usage_count` kaç kez kullanıldığını sayar, ne kadar kaldığını
  değil.

  BU MIGRATION ÇEKİ TANIMLAR VE MÜŞTERİYE GÖSTERİR. Ödemede
  kullanmak (`arc_create_storefront_order` içinde düşme) BİLEREK
  ayrı bir adıma bırakıldı: o yol para yolu, vitrindeki
  `order-quote.ts` aynasıyla aynı gün değişmek zorunda ve tek
  başına yapılınca müşteri ödemede başka tutar görür (17 Eylül
  2026'da oldu). Kütük tablosu şimdiden burada; o adım yalnızca
  satır yazacak, tablo açmayacak.
*/

create table if not exists public.arc_gift_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  code text not null,
  /* Kuruş tamsayısı — bu projede para her yerde kuruş. */
  initial_amount bigint not null check (initial_amount > 0),
  balance bigint not null check (balance >= 0),
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  /*
    Çek KİME verildi. Siparişler de e-postayla hesaba bağlanıyor
    (`claim_arvoculture_orders`); aynı kapı, aynı anahtar. user_id
    tutulmuyor: çek çoğu zaman hesabı HENÜZ OLMAYAN birine
    veriliyor ve hesap açılınca görünmesi gerekiyor.
  */
  recipient_email text,
  recipient_name text,
  note text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* Harcanan, yüklenenden çok olamaz. */
  constraint arc_gift_cards_bakiye_tavani check (balance <= initial_amount)
);

/* Kod mağaza içinde tek ve büyük/küçük harf ayrımsız: müşteri
   "arvo-100" yazdığında "ARVO-100" bulunmalı. */
create unique index if not exists arc_gift_cards_kod_tek
  on public.arc_gift_cards (organization_id, upper(code));

create index if not exists arc_gift_cards_alici
  on public.arc_gift_cards (organization_id, lower(recipient_email));

/*
  KÜTÜK. Bakiyeyi tek bir sütunda tutup üstüne yazmak, "bu para
  nereye gitti" sorusunu yanıtsız bırakırdı — iade, itiraz ve
  muhasebe hep o soruyu soruyor. Her hareket burada; bakiye
  hareketlerin sonucu.

  amount POZİTİF harcama, NEGATİF iade. Sıfır hareket yok:
  hiçbir şey olmadıysa satır da olmamalı.
*/
create table if not exists public.arc_gift_card_uses (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null
    references public.arc_gift_cards(id) on delete cascade,
  /* Sipariş silinirse kütük kalır: para hareketi oldu. */
  order_id uuid references public.arc_orders(id) on delete set null,
  amount bigint not null check (amount <> 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists arc_gift_card_uses_cek
  on public.arc_gift_card_uses (gift_card_id, created_at desc);

/*
  RLS AÇIK, POLİTİKA YOK.

  Okuma ve yazma yalnızca aşağıdaki SECURITY DEFINER fonksiyonlardan
  geçiyor. Politikasız tablo, çağıranın yetkisiyle okunursa SESSİZCE
  BOŞ döner (bkz. `npm run check:rls` ve 17.10.2026'daki
  organization_modules olayı) — burada bu istenen davranış: tabloya
  doğrudan gelen hiç kimse bir şey görmemeli. Paneldeki okuma da
  servis anahtarıyla yapılacak.
*/
alter table public.arc_gift_cards enable row level security;
alter table public.arc_gift_card_uses enable row level security;

/* --------------------------------------------------------------
   MÜŞTERİNİN KENDİ ÇEKLERİ
   -------------------------------------------------------------- */

create or replace function public.arc_storefront_my_gift_cards(p_host text)
returns table (
  id uuid,
  code text,
  balance bigint,
  initial_amount bigint,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select g.id, g.code, g.balance, g.initial_amount, g.status, g.expires_at
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
    /*
      Süresi dolmuş çek gizlenmiyor: müşteri "nerede" diye
      aramasın. Ekranda solgun görünüyor ve ödemede zaten
      geçmeyecek.
    */
  order by (g.balance > 0) desc, g.created_at desc;
$function$;

revoke all on function public.arc_storefront_my_gift_cards(text)
  from public, anon, authenticated;
/* Yalnızca giriş yapmış müşteri: fonksiyon auth.uid() olmadan
   hiçbir satır döndürmüyor, anon'a açmak anlamsız olurdu. */
grant execute on function public.arc_storefront_my_gift_cards(text)
  to authenticated;
grant execute on function public.arc_storefront_my_gift_cards(text)
  to service_role;

/* --------------------------------------------------------------
   ÇEK TANIMLAMA (panel)
   -------------------------------------------------------------- */

create or replace function public.arc_gift_card_issue(
  p_organization_id uuid,
  p_code text,
  p_amount bigint,
  p_recipient_email text default null,
  p_recipient_name text default null,
  p_expires_at timestamptz default null,
  p_note text default null
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

  insert into public.arc_gift_cards (
    organization_id, code, initial_amount, balance,
    recipient_email, recipient_name, expires_at, note
  )
  values (
    p_organization_id, upper(trim(p_code)), p_amount, p_amount,
    nullif(trim(lower(p_recipient_email)), ''),
    nullif(trim(p_recipient_name), ''),
    p_expires_at,
    nullif(trim(p_note), '')
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
  uuid, text, bigint, text, text, timestamptz, text)
  from public, anon, authenticated;
/* Para yaratan bir çağrı: yalnızca sunucu. Panel kendi uçundan
   servis anahtarıyla çağırıyor. */
grant execute on function public.arc_gift_card_issue(
  uuid, text, bigint, text, text, timestamptz, text)
  to service_role;
