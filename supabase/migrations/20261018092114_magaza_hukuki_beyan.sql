-- magaza_hukuki_beyan
--
-- MAĞAZANIN KENDİ HUKUKİ BEYANI.
--
-- Yasal bildirim ve kullanım koşulları sayfalarında şu cümle KODDA
-- SABİT duruyor:
--
--   "ArvoCulture, LR Health & Beauty bağımsız iş ortağıdır. LR
--    markası ve ürün adları ilgili hak sahibine aittir."
--
-- İkinci bir kiracının hukuki sayfasında bu cümle YANLIŞ: o mağaza
-- LR iş ortağı değil ve olmayan bir ticari ilişkiyi beyan etmiş
-- oluyor.
--
-- SİLMEK DE ÇÖZÜM DEĞİL. Cümle ArvoCulture için bir uyum beyanı
-- (dağıtıcının bağımsızlığını bildirmesi) ve markanın hak
-- sahibine atfı. Koddan silmek, ArvoCulture'ın hukuki sayfasından
-- bir beyanı sessizce kaldırmak olurdu.
--
-- Bu yüzden beyan mağazanın AYARINA taşınıyor: olanı yazar,
-- olmayanda hiç basılmaz. ArvoCulture'ın bugünkü cümlesi
-- migration'da taşınıyor.
--
-- MARKA ATFI AYRI VE HERKESE BASILIYOR. "Sitede adı geçen üçüncü
-- taraf marka ve ürün adları ilgili hak sahiplerine aittir" cümlesi
-- her mağaza için doğru; o kodda kalıyor ve bu alana bağlı değil.
--
-- SERBEST METİN, HTML DEĞİL. E-posta şablonları ve tanıtım
-- sayfalarıyla aynı karar: kiracı METNİ yazar, biçimi değil.
-- Serbest HTML bir yazım hatasıyla hukuki sayfayı bozardı.

alter table public.arc_store_settings
  add column if not exists legal_disclosure text;

/*
  Uzunluk sınırı: birkaç cümlelik bir beyan. Sınırsız metin, hukuki
  sayfayı bir depo gibi kullanmanın kapısını açardı.
*/
alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_legal_disclosure_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_legal_disclosure_check
  check (legal_disclosure is null or length(legal_disclosure) <= 2000);

/*
  ArvoCulture'ın bugünkü beyanı taşınıyor. Yalnızca BOŞSA: migration
  ikinci kez çalıştırılırsa elle düzeltilmiş bir metni geri almasın.
*/
update public.arc_store_settings s
   set legal_disclosure =
         'ArvoCulture, LR Health & Beauty bağımsız iş ortağıdır. '
         || 'LR markası ve ürün adları ilgili hak sahibine aittir.'
 where s.legal_disclosure is null
   and exists (
     select 1 from public.organizations o
     where o.id = s.organization_id and o.slug = 'arvoculture'
   );

/*
  Vitrin okuması bu alanı da döndürüyor. Dönüş tipi genişlediği için
  önce drop: `create or replace` "cannot change return type" veriyor.
*/
drop function if exists public.arc_storefront_seller(text);

create function public.arc_storefront_seller(p_host text)
returns table(
  legal_name text,
  trade_name text,
  mersis_no text,
  tax_office text,
  tax_number text,
  trade_registry_no text,
  address_line text,
  address_district text,
  address_city text,
  address_country text,
  contact_email text,
  contact_phone text,
  whatsapp_number text,
  kep_address text,
  etbis_verified boolean,
  storefront_url text,
  bank_name text,
  bank_iban text,
  bank_account_holder text,
  bank_transfer_instructions text,
  parent_organization_name text,
  parent_organization_url text,
  legal_disclosure text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.legal_name,
    coalesce(s.trade_name, o.name) as trade_name,
    s.mersis_no,
    s.tax_office,
    s.tax_number,
    s.trade_registry_no,
    s.address_line,
    s.address_district,
    s.address_city,
    coalesce(s.address_country, 'Türkiye') as address_country,
    s.contact_email,
    s.contact_phone,
    s.whatsapp_number,
    s.kep_address,
    coalesce(s.etbis_verified, false) as etbis_verified,
    s.storefront_url,
    s.bank_name,
    s.bank_iban,
    /* Hesap sahibi boşsa unvana düşülüyor: çoğu mağazada ikisi
       aynı ve panelde boş bırakılmış olması "bilgi yok" demek
       değil. Yanlış bir ad YAZILMIYOR, yalnızca bilinen ad
       kullanılıyor. */
    coalesce(nullif(btrim(s.bank_account_holder), ''), s.legal_name) as bank_account_holder,
    s.bank_transfer_instructions,
    s.parent_organization_name,
    s.parent_organization_url,
    s.legal_disclosure
  from public.arc_store_settings s
  join public.organizations o
    on o.id = s.organization_id
  where s.organization_id = public.arc_storefront_org(p_host)
  limit 1;
$$;

revoke all on function public.arc_storefront_seller(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_seller(text) to anon, authenticated, service_role;

do $$
declare
  v_sayi int;
begin
  select count(*) into v_sayi
  from public.arc_storefront_seller('bilinmeyen-adres.example');

  if v_sayi <> 0 then
    raise exception 'Tanınmayan adres için % satır döndü.', v_sayi;
  end if;

  raise notice 'Hukuki beyan alanı hazır; boş bırakılan mağazada hiç basılmıyor.';
end;
$$;
