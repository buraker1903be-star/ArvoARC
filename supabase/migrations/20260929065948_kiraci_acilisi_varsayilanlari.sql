-- KİRACI AÇILIŞI: yeni salon ayar satırını alabiliyor ve adresi oluyor.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- İKİNCİ SALON AYAR SATIRINI HİÇ ALAMIYORDU. order_prefix'in varsayılanı
-- 'AC' ve sütun kiracılar arası TEKİL (arc_store_settings_order_prefix_
-- unique_idx). ArvoCulture 'AC'yi tuttuğu için ikinci salonun satırı
-- açılırken 23505 veriyordu:
--
--   insert into arc_store_settings (organization_id, store_name)
--     → duplicate key … order_prefix_unique_idx
--
-- Ayar satırı uygulamada TEMBEL açılıyor (ayarlar/actions.ts, ilk kayıtta
-- upsert) ve önek göndermiyor. Yani yeni salon hangi ayar sekmesine
-- girerse girsin kaydedemiyordu; üstelik hata metni "Bu sipariş öneki
-- başka bir mağazada kullanılıyor" diyordu — kullanıcı hiç önek
-- yazmamışken. 29.09.2026'da PGlite'ta birebir üretildi.
--
-- ÇÖZÜM VERİTABANINDA, UYGULAMADA DEĞİL. Uygulamada çözülse yalnızca o
-- yol korunurdu; satır SQL Editor'den ya da ArvoOS köprüsünden de
-- açılabiliyor. AGENTS.md'nin kuralı da bu: çakışmayı veritabanı
-- engeller.
--
-- VARSAYILAN KALDIRILIYOR, TETİKLEYİCİ DOLDURUYOR. Böylece "önek
-- verilmedi" ile "kullanıcı 'AC' yazdı" ayrışıyor:
--
--   önek verilmemiş (null)  → kurumun slug'ından serbest bir önek üretilir
--   önek verilmiş ama dolu  → ESKİSİ GİBİ hata verir (kullanıcı kendi
--                             yazdığı öneğin alındığını bilmeli; sessizce
--                             değiştirmek daha kötü olurdu)
--
-- Önek biçimi kısıtlı: ^[A-Z]{1,6}$ — rakam YOK. Numaralandırma bu
-- yüzden harfle yapılıyor (SB, SBA, SBB … SBAA).

alter table public.arc_store_settings alter column order_prefix drop default;

create or replace function private.arc_magaza_varsayilanlari()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_slug text;
  v_taban text;
begin
  select coalesce(o.slug, '') into v_slug
  from public.organizations o where o.id = new.organization_id;

  /* ---------- Sipariş öneki ---------- */
  if new.order_prefix is null then
    /* Slug zaten ASCII küçük harf ve tireli; ilk iki HARF alınıyor. */
    v_taban := upper(substring(regexp_replace(coalesce(v_slug, ''), '[^a-z]', '', 'g') from 1 for 2));
    if length(coalesce(v_taban, '')) < 2 then v_taban := 'MG'; end if;

    /*
      Serbest olan İLK aday: önce iki harf, sonra üç, sonra dört.
      676 + 26 + 1 aday, hepsi ^[A-Z]{1,6}$ kısıtına uyuyor.
    */
    select a.aday into new.order_prefix
    from (
      select v_taban as aday, 0 as sira
      union all
      select v_taban || chr(64 + i), i from generate_series(1, 26) i
      union all
      select v_taban || chr(64 + i) || chr(64 + j), 26 + (i - 1) * 26 + j
        from generate_series(1, 26) i, generate_series(1, 26) j
    ) a
    where not exists (
      select 1 from public.arc_store_settings s
      where upper(s.order_prefix) = a.aday
    )
    order by a.sira
    limit 1;
  end if;

  /* ---------- Platform alt alan adı ---------- */
  /*
    Yeni salonun GÜNÜ BİRİNDE mağaza adresi olsun: vitrin çözücüsü
    (arc_storefront_org) doğrulanmış özel alan adına ya da alt alan
    adına bakıyor; ikisi de yoksa mağaza hiç açılmıyor. Özel alan adı
    DNS ve doğrulama istiyor, alt alan adı istemiyor.

    Alt alan adı biçimi rakama izin veriyor, numaralandırma sayıyla.
  */
  if new.platform_subdomain is null then
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]', '', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    if coalesce(v_slug, '') = '' then v_slug := 'magaza'; end if;
    v_slug := substring(v_slug from 1 for 50);

    select a.aday into new.platform_subdomain
    from (
      select v_slug as aday, 0 as sira
      union all
      select v_slug || '-' || i::text, i from generate_series(2, 200) i
    ) a
    where not exists (
      select 1 from public.arc_store_settings s
      where lower(s.platform_subdomain) = a.aday
    )
    order by a.sira
    limit 1;
  end if;

  return new;
end;
$function$;

comment on function private.arc_magaza_varsayilanlari() is
  'Yeni mağaza ayar satırına serbest sipariş öneki ve alt alan adı atar.';

/*
  YALNIZCA INSERT. Güncellemede dokunulmuyor: kullanıcı ayarlardan
  kendi öneğini yazdığında dolu bir önek seçmişse bunu ÖĞRENMELİ,
  sessizce başka bir önekle kaydedilmemeli.
*/
drop trigger if exists arc_magaza_varsayilanlari on public.arc_store_settings;
create trigger arc_magaza_varsayilanlari
  before insert on public.arc_store_settings
  for each row execute function private.arc_magaza_varsayilanlari();

-- Tetikleyici fonksiyonu, satırı yazan rolün çalıştırabilmesi gerekiyor;
-- private.arc_guard_store_domains ile aynı kalıp.
revoke all on function private.arc_magaza_varsayilanlari() from public;
grant execute on function private.arc_magaza_varsayilanlari() to public;

-- Geri almak için:
-- drop trigger if exists arc_magaza_varsayilanlari on public.arc_store_settings;
-- drop function if exists private.arc_magaza_varsayilanlari();
-- alter table public.arc_store_settings alter column order_prefix set default 'AC';
