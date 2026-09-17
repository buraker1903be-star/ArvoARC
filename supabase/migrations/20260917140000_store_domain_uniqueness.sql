-- Mağaza alan adları benzersiz hale getiriliyor.
--
-- SORUN
-- Ayarlar → vitrin/panel alan adı kaydedilirken girilen alan adının BAŞKA
-- bir mağazaya ait olup olmadığına bakılmıyordu ve tabloda tekillik kısıtı
-- yoktu (src/app/(panel)/ayarlar/actions.ts, updateStorefrontDomainSettings
-- ve updatePanelDomainSettings).
--
-- Vercel adımı da engellemiyor: alan adı projede zaten kayıtlıysa
-- ensureVercelProjectDomain onu "bulunmuş" sayıp başarı döndürüyor
-- (src/lib/vercel-domains.ts). Kurbanın DNS'i doğru olduğu için kayıt
-- doğrudan "active" yazılıyor.
--
-- Sonuç: B mağazasının sahibi Ayarlar'a "arvoculture.com" yazar. Mağaza
-- çözümleyicisi (src/lib/storefront-origin.ts) konağı sırasız bir listede
-- arayıp ilk eşleşeni aldığı için, o alan adından gelen istek B'nin
-- kurumuna düşebilir: sipariş ve müşteri verisi B'ye yazılır, tahsilat
-- B'nin PayTR anahtarıyla yapılır. Üstelik çözüm 60 sn önbellekli olduğu
-- için tur tur değişebilir.
--
-- ÇÖZÜM
-- Kontrol veritabanına konuyor. Uygulama tarafında yapılamaz: mağaza
-- sahibi başka mağazanın ayar satırını RLS yüzünden zaten okuyamaz, yani
-- "bu alan adı başkasında mı" sorusunu soramaz. Tekil indeks hem yarışa
-- kapalı hem de bilgi sızdırmıyor — çağıran taraf yalnızca "bu alan adı
-- kullanımda" hatasını görür, kimin kullandığını görmez.
--
-- DİKKAT: Canlıda zaten çakışan kayıt varsa bu migration HATA VERİR.
-- İstenen davranış bu. Önce aşağıdaki sorgu boş dönmeli:
--
--   select 'vitrin' as alan, lower(custom_domain) as deger, count(*)
--   from public.arc_store_settings where custom_domain is not null
--   group by 2 having count(*) > 1
--   union all
--   select 'alt alan adı', lower(platform_subdomain), count(*)
--   from public.arc_store_settings where platform_subdomain is not null
--   group by 2 having count(*) > 1
--   union all
--   select 'panel', lower(panel_custom_domain), count(*)
--   from public.arc_store_settings where panel_custom_domain is not null
--   group by 2 having count(*) > 1;

create unique index if not exists arc_store_settings_custom_domain_unique_idx
  on public.arc_store_settings (lower(custom_domain))
  where custom_domain is not null and trim(custom_domain) <> '';

create unique index if not exists arc_store_settings_platform_subdomain_unique_idx
  on public.arc_store_settings (lower(platform_subdomain))
  where platform_subdomain is not null and trim(platform_subdomain) <> '';

create unique index if not exists arc_store_settings_panel_domain_unique_idx
  on public.arc_store_settings (lower(panel_custom_domain))
  where panel_custom_domain is not null and trim(panel_custom_domain) <> '';

-- Tekil indeksler her sütunu kendi içinde korur, ama bir alan adının A
-- mağazasında PANEL adresi, B mağazasında VİTRİN adresi olarak kullanılması
-- üç indeksin de gözünden kaçar. Aynı konak iki farklı kuruma çözülemez;
-- bu tetikleyici sütunlar arası çakışmayı da kapatır.
create or replace function private.arc_guard_store_domains()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_domain text;
  v_owner uuid;
begin
  foreach v_domain in array array[
    nullif(lower(trim(coalesce(new.custom_domain, ''))), ''),
    nullif(lower(trim(coalesce(new.panel_custom_domain, ''))), '')
  ]
  loop
    continue when v_domain is null;

    select s.organization_id into v_owner
    from public.arc_store_settings s
    where s.organization_id <> new.organization_id
      and (lower(trim(coalesce(s.custom_domain, ''))) = v_domain
        or lower(trim(coalesce(s.panel_custom_domain, ''))) = v_domain)
    limit 1;

    if v_owner is not null then
      -- Kimin kullandığı SÖYLENMEZ: mağazalar birbirinin varlığını
      -- öğrenmemeli.
      -- Biçim metni ile "using message" birlikte verilemez
      -- ("RAISE option already specified: MESSAGE"); yalnızca using.
      raise using
        errcode = 'unique_violation',
        message = 'Bu alan adı başka bir mağazada kullanılıyor.';
    end if;
  end loop;

  return new;
end
$function$;

revoke all on function private.arc_guard_store_domains() from public;

drop trigger if exists arc_guard_store_domains on public.arc_store_settings;
create trigger arc_guard_store_domains
  before insert or update of custom_domain, panel_custom_domain
  on public.arc_store_settings
  for each row execute function private.arc_guard_store_domains();
