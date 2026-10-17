-- magaza_sayfalari
--
-- TANITIM SAYFALARININ METNİ KİRACININ OLSUN.
--
-- Barındırılan vitrinde üç sayfa var: hakkımızda, SSS, iletişim.
-- Metinleri kodda sabit ve ArvoCulture'ın kendi anlatısı —
-- "ArvoCulture; giyim, kişisel bakım ve koku dünyasını…". İkinci bir
-- kiracı bu sayfalarla yayına GİREMEZ: müşterisine başka bir
-- markanın hikâyesini gösterir.
--
-- E-posta şablonlarıyla aynı tasarım (arc_email_templates):
-- KİRACI METNİ DÜZENLER, HTML'İ DÜZENLEMEZ. Sayfanın düzeni,
-- başlıkları ve bağlantıları kodda kalıyor; buradan yalnızca metin
-- geliyor ve kaçırılarak basılıyor. Serbest HTML bir yazım
-- hatasıyla sayfayı bozar ve müşteriye giden bir yüzeye kod enjekte
-- etme kapısı açardı.
--
-- SATIR YOKSA YANSIZ VARSAYILAN. Tablo boş olan mağaza, hiçbir
-- markaya ait olmayan genel bir metin görür — ArvoCulture'ınkini
-- değil. Bugünkü ArvoCulture metinleri panele elle girilecek;
-- otomatik taşımadım çünkü o metinler sayfanın kendi düzenine
-- (bölümler, listeler) gömülü ve düz metne çevirmek sessiz kayıplar
-- üretirdi.
--
-- SSS BİLEREK LİSTEDE: sorular her mağaza için geçerli ve kargo
-- yanıtı zaten mağaza ayarlarından üretiliyor, yani varsayılanı
-- doğru. Yine de kendi sorularını yazmak isteyen kiracı
-- yazabilmeli.

create table if not exists public.arc_store_pages (
  organization_id uuid not null,
  page_key text not null,
  title text not null default '',
  body text not null default '',
  updated_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.arc_store_pages
  drop constraint if exists arc_store_pages_pkey;
alter table public.arc_store_pages
  add constraint arc_store_pages_pkey primary key (organization_id, page_key);

alter table public.arc_store_pages
  drop constraint if exists arc_store_pages_organization_id_fkey;
alter table public.arc_store_pages
  add constraint arc_store_pages_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

/*
  Anahtar serbest metin DEĞİL: koddaki kayıtla eşleşmek zorunda.
  Yoksa panelde yazım hatasıyla kaydedilen bir anahtar hiç
  kullanılmaz ve kiracı "neden değişmedi" diye sorar.
*/
alter table public.arc_store_pages
  drop constraint if exists arc_store_pages_key_check;
alter table public.arc_store_pages
  add constraint arc_store_pages_key_check
  check (page_key in ('hakkimizda', 'sss', 'iletisim'));

/*
  Uzunluk sınırı: başlık bir sayfa başlığı, gövde birkaç paragraf.
  Sınırsız metin hem sayfayı bozar hem tabloyu depo gibi kullanmanın
  kapısını açar. SSS'in gövdesi daha uzun olabiliyor (soru-cevap
  blokları), o yüzden tavan e-posta şablonundan yüksek.
*/
alter table public.arc_store_pages
  drop constraint if exists arc_store_pages_uzunluk_check;
alter table public.arc_store_pages
  add constraint arc_store_pages_uzunluk_check
  check (length(title) <= 200 and length(body) <= 8000);

alter table public.arc_store_pages enable row level security;

/*
  Okuma ÜYELERE açık, yazma yönetime. Vitrin bu tabloyu kendi
  anahtarıyla okumuyor: sayfalar sunucuda çiziliyor ve servis
  anahtarıyla okunuyor (RLS atlanıyor). Anon'a açmak, yayınlanmamış
  bir metni de görünür kılardı.
*/
drop policy if exists arc_store_pages_select on public.arc_store_pages;
create policy arc_store_pages_select on public.arc_store_pages
  for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_store_pages.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  ));

drop policy if exists arc_store_pages_write on public.arc_store_pages;
create policy arc_store_pages_write on public.arc_store_pages
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_store_pages.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner', 'admin', 'manager')
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = arc_store_pages.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner', 'admin', 'manager')
  ));

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arc_store_pages') then
    raise exception 'arc_store_pages politikasız kaldı.';
  end if;
  raise notice 'Mağaza sayfaları hazır (hakkimizda, sss, iletisim).';
end;
$$;
