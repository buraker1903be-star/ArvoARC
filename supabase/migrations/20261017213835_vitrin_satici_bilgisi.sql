-- vitrin_satici_bilgisi
--
-- SATICI KİM? SORUSU ADRESTEN YANITLANSIN.
--
-- Vitrin satıcı bilgilerini `get_storefront_seller(p_tenant)` ile
-- okuyor ve KİRACI ADI SABİT: `ARC_TENANT_SLUG ?? "arvoculture"`
-- (ArvoCulture-site/src/lib/seller-source.ts). Dosyanın kendi
-- yorumu da bunu kabul ediyor: "Kiracı adı şu an sabit. Vitrin çok
-- kiracılı hâle geldiğinde alan adından çözülecek."
--
-- O gün geldi ve bedeli büyük: ortak dağıtımda ikinci bir kiracının
-- /iletisim sayfasında, mesafeli satış sözleşmesinde ve ön
-- bilgilendirme formunda ARVOCULTURE'IN ticaret unvanı, adresi,
-- vergi numarası, MERSİS'i ve IBAN'ı görünür. Mesafeli Sözleşmeler
-- Yönetmeliği satıcı bilgilerinin DOĞRU olmasını arıyor; burada
-- yanlış olan bir dizgi hatası değil, sözleşmenin tarafı.
--
-- Sessiz de olurdu: fonksiyon hata vermez, bir satır döndürür —
-- yalnızca başka mağazanın satırını. Vitrin bunu fark edemez.
--
-- Diğer vitrin okumalarıyla aynı desen: adresi al, kurumu
-- `arc_storefront_org` ile çöz. Böylece doğrulanmamış alan adı da
-- kendiliğinden elenir (o fonksiyon yalnızca doğrulanmış kendi alan
-- adını ve platform alt alan adını tanıyor) — doğrulanmamış bir
-- adresten satıcı kimliği sızdırmak istemiyoruz.
--
-- İKİZ ADI UYUMSUZ. Eski aile burada `get_arvoculture_storefront_*`
-- değil `get_storefront_seller`; ikiz denetimine (check:ikizler)
-- bilinçli istisna olarak yazılıyor. Eski fonksiyon SİLİNMİYOR:
-- ArvoCulture'ın dağıtımı o adı çağırıyor ve vitrin kodu
-- güncellenip dağıtılana kadar çalışmaya devam etmeli — fonksiyonu
-- aynı anda silmek, hukuki sayfaları yedek sabitlere düşürürdü.

create or replace function public.arc_storefront_seller(p_host text)
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
  storefront_url text
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
    s.storefront_url
  from public.arc_store_settings s
  join public.organizations o
    on o.id = s.organization_id
  where s.organization_id = public.arc_storefront_org(p_host)
  limit 1;
$$;

/*
  Vitrin bunu yayınlanabilir anahtarla okuyor; bilgiler zaten mevzuat
  gereği herkese açık sayfalarda yayımlanıyor. Yine de Postgres'in
  PUBLIC varsayılanı ve Supabase'in anon yetkisi kaldırılıp yalnızca
  gerekenler veriliyor.
*/
revoke all on function public.arc_storefront_seller(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_seller(text) to anon, authenticated, service_role;

/*
  Kendini sınayan blok. İki şey aranıyor:

  1. Adresi olan bir mağaza, KENDİ unvanını görmeli — eski
     fonksiyonun aynı mağaza için döndürdüğüyle aynı olmalı. Aksi
     halde gövdeyi kopyalarken bir alan kaymış olur ve bu, sözleşmeye
     yanlış vergi numarası yazmak demek.
  2. Tanınmayan adres HİÇ SATIR döndürmemeli. Bir satır dönmesi,
     "mağaza bulunamadı"yı "işte satıcı" diye okumak olurdu.
*/
do $$
declare
  v_konak text;
  v_slug text;
  v_yeni text;
  v_eski text;
  v_sayi int;
begin
  select coalesce(
           case when s.domain_verified_at is not null then s.custom_domain end,
           s.platform_subdomain || '.shop.arvo-os.com'
         ),
         o.slug
    into v_konak, v_slug
  from public.arc_store_settings s
  join public.organizations o on o.id = s.organization_id
  where s.legal_name is not null
    and ((s.domain_verified_at is not null and s.custom_domain is not null)
         or s.platform_subdomain is not null)
  limit 1;

  if v_konak is null then
    raise notice 'Unvanı ve adresi olan mağaza yok; karşılaştırma atlandı.';
  else
    select legal_name into v_yeni from public.arc_storefront_seller(v_konak);
    select legal_name into v_eski from public.get_storefront_seller(v_slug);

    if v_yeni is distinct from v_eski then
      raise exception 'Unvan eski fonksiyonla uyuşmuyor (% / %): % <> %',
        v_konak, v_slug, v_yeni, v_eski;
    end if;

    raise notice 'Satıcı adresten çözülüyor: % → %', v_konak, v_yeni;
  end if;

  select count(*) into v_sayi
  from public.arc_storefront_seller('bilinmeyen-adres.example');

  if v_sayi <> 0 then
    raise exception 'Tanınmayan adres için % satır döndü.', v_sayi;
  end if;
end;
$$;
