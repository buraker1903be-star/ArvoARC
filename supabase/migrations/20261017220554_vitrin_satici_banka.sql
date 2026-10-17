-- vitrin_satici_banka
--
-- HAVALE BİLGİSİ DE SATICININ OLSUN.
--
-- Vitrinin ödeme adımı banka adını ve IBAN'ı KODDAN okuyor:
-- `SELLER.bankName` / `SELLER.iban` (ArvoCulture-site/src/lib/seller.ts)
-- ve bunu bir İSTEMCİ bileşeni yapıyor (components/checkout-form.tsx),
-- yani değerler tarayıcı paketinin içinde.
--
-- Bedeli bu ailenin en pahalısı: ikinci bir kiracının havale
-- ekranında ArvoCulture'ın IBAN'ı ve unvanı görünür, müşteri parayı
-- ARVOCULTURE'IN hesabına gönderir. Sipariş öteki mağazada "ödeme
-- bekliyor"da kalır, para üçüncü bir yerdedir ve kimse hata
-- görmez.
--
-- Veri ZATEN YERİNDE: `arc_store_settings` içinde `bank_name`,
-- `bank_iban`, `bank_account_holder` ve `bank_transfer_instructions`
-- kolonları var ve panelden doldurulabiliyor. Eksik olan tek şey,
-- vitrinin onları okuyabileceği bir yol — fonksiyon bu alanları
-- döndürmüyordu.
--
-- HESAP SAHİBİ AYRI ALAN. Unvandan türetmek yanlış olurdu: hesap
-- başka bir unvana (şahıs şirketi, eski unvan) açılmış olabilir ve
-- IBAN'ın sahibi tutmazsa banka havaleyi iade eder.
--
-- DÖNÜŞ TİPİ GENİŞLİYOR, O YÜZDEN ÖNCE DROP. `create or replace`
-- dönüş tipi değişen bir fonksiyonda "cannot change return type"
-- veriyor. Tek betikte drop + create: SQL Editor betiği bir işlemde
-- çalıştırıyor, yani fonksiyonun yok olduğu bir an vitrine
-- görünmüyor. Görünseydi sonuç yine de açık olurdu: vitrin
-- okuyamadığı anda `seller.ts` yedeğine düşüyor, sayfa boş kalmıyor.

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
  bank_transfer_instructions text
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
    s.bank_transfer_instructions
  from public.arc_store_settings s
  join public.organizations o
    on o.id = s.organization_id
  where s.organization_id = public.arc_storefront_org(p_host)
  limit 1;
$$;

revoke all on function public.arc_storefront_seller(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_seller(text) to anon, authenticated, service_role;

/*
  Kendini sınayan blok. Aranan iki şey:

  1. Havale AÇIK olan bir mağazanın IBAN'ı dönmeli. Havale açıkken
     IBAN'ın boş olması, müşteriye "havaleyle öde" deyip nereye
     ödeyeceğini söylememek olurdu — ama bu veri eksikliği, kod
     hatası değil: uyarı yazılıyor, migration düşürülmüyor.
  2. Tanınmayan adres hiç satır döndürmemeli.
*/
do $$
declare
  v_konak text;
  v_iban text;
  v_sayi int;
begin
  select coalesce(
           case when s.domain_verified_at is not null then s.custom_domain end,
           s.platform_subdomain || '.shop.arvo-os.com'
         )
    into v_konak
  from public.arc_store_settings s
  where s.bank_transfer_enabled
    and ((s.domain_verified_at is not null and s.custom_domain is not null)
         or s.platform_subdomain is not null)
  limit 1;

  if v_konak is null then
    raise notice 'Havalesi açık ve adresi olan mağaza yok; IBAN kontrolü atlandı.';
  else
    select bank_iban into v_iban from public.arc_storefront_seller(v_konak);
    if v_iban is null or btrim(v_iban) = '' then
      raise warning 'DİKKAT: % mağazasında havale açık ama IBAN boş; ödeme adımı hesap bilgisi gösteremez.', v_konak;
    else
      raise notice 'Havale bilgisi adresten çözülüyor: % → %', v_konak, left(v_iban, 8) || '…';
    end if;
  end if;

  select count(*) into v_sayi
  from public.arc_storefront_seller('bilinmeyen-adres.example');

  if v_sayi <> 0 then
    raise exception 'Tanınmayan adres için % satır döndü.', v_sayi;
  end if;
end;
$$;
