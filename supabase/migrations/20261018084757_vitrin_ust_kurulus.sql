-- vitrin_ust_kurulus
--
-- ÜST KURULUŞ BİLGİSİ MAĞAZANIN AYARINDA OLSUN.
--
-- Vitrinin yapısal verisi (`lib/seo.ts` → `storeSchema`) mağazayı
-- bir holdinge bağlıyor ve bağ KODDA SABİT:
--
--   parentOrganization: { name: "ArvoCulture Group",
--                         url: "https://arvoculturegroup.com" }
--
-- İkinci bir kiracının sayfası arama motoruna "bu işletme
-- ArvoCulture Group'un parçası" diyor. Yanlış bir varlık bağı,
-- eksik bir bağdan kötü: arama motoru iki ayrı işletmeyi aynı
-- kuruluşa bağlıyor ve bu sinyal geri alınması zor.
--
-- Satır boş bırakılırsa bağ HİÇ BASILMIYOR; uydurma bir üst
-- kuruluş adı üretmiyoruz. ArvoCulture'ın bugünkü değeri de bu
-- migration'da yazılıyor — kodda sabit durduğu için zaten bilinen
-- bir veri ve taşınmazsa sinyal kaybolur.
--
-- ADRES ALANLARI EKLENMEDİ. `storeSchema` posta kodunu ve ilçeyi de
-- sabit basıyordu ("34524", "Beylikdüzü", "İstanbul"); ilçe ve il
-- için `address_district` / `address_city` ZATEN VAR, posta kodu
-- için kolon yok. Posta kodu schema.org'da zorunlu değil ve yanlış
-- bir posta kodu basmak, hiç basmamaktan kötü — o alan vitrinden
-- kaldırılıyor, yeni kolon açılmıyor.

alter table public.arc_store_settings
  add column if not exists parent_organization_name text,
  add column if not exists parent_organization_url text;

/*
  Uzunluk sınırı: ad bir kuruluş adı, adres bir URL. Sınırsız metin
  yapısal veriye uzun bir metin gömmenin kapısını açardı.

  UZUNLUK REGEX'TE DEĞİL. İlk yazımda desen
  `^https?://[^\s]{3,300}$` idi ve Postgres bunu REDDEDİYOR:
  "invalid repetition count(s)" — POSIX regex'te tekrar sayısı
  tavanı 255 (RE_DUP_MAX) ve 300 onu aşıyor. Uzunluk bu yüzden
  `length()` ile, desen yalnızca biçimle ilgileniyor.

  PGlite bu deseni KABUL ETMİŞTİ: `npm run test:db` yeşil geçti,
  hata ancak canlı Supabase'de çıktı. Yani yerel veritabanı testi
  regex uyumluluğunu sınamıyor; bu sınıf hata için tek kanıt
  canlıya uygulamak.
*/
alter table public.arc_store_settings
  drop constraint if exists arc_store_settings_parent_org_check;
alter table public.arc_store_settings
  add constraint arc_store_settings_parent_org_check
  check (
    (parent_organization_name is null or length(parent_organization_name) <= 200)
    and (
      parent_organization_url is null
      or (
        length(parent_organization_url) between 11 and 300
        and parent_organization_url ~ '^https?://[^[:space:]]+$'
      )
    )
  );

/*
  ArvoCulture'ın bugünkü bağı taşınıyor. Yalnızca BOŞSA yazılıyor:
  migration ikinci kez çalıştırılırsa elle düzeltilmiş bir değeri
  geri almasın.
*/
update public.arc_store_settings s
   set parent_organization_name = 'ArvoCulture Group',
       parent_organization_url = 'https://arvoculturegroup.com'
 where s.parent_organization_name is null
   and s.parent_organization_url is null
   and exists (
     select 1 from public.organizations o
     where o.id = s.organization_id and o.slug = 'arvoculture'
   );

/*
  Vitrin okuması bu iki alanı da döndürüyor. Dönüş tipi genişlediği
  için önce drop: `create or replace` "cannot change return type"
  veriyor.
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
  parent_organization_url text
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
    s.parent_organization_url
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

  raise notice 'Üst kuruluş alanı hazır; boş bırakılan mağazada bağ hiç basılmıyor.';
end;
$$;
