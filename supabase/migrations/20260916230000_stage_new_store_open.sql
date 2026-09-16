-- Yeni açılan mağaza lisans tanımlanmadan kapalı olmasın.
--
-- arc_store_stage, product='arc' lisans satırı yoksa 'panel_closed' dönüyordu.
-- Sonuç: kurucu yeni mağazayı kurar, sahibi ilk kez giriş yapar ve lisans
-- satırı henüz açılmadığı için paneline giremez. Kademeler ödeme gecikmesi
-- için tasarlandı; hiç başlamamış bir aboneliği gecikmiş saymak yanlış.
--
-- Yeni kural: lisans satırı yoksa kurumun kendi durumuna bakılır.
--   active / trial  → 'open'   (meşru müşteri; kurucu henüz Arc ücretini
--                               girmemiş olabilir, bu sahibin sorunu değil)
--   diğer           → 'closed' (askıya alınmış ya da arşivlenmiş kurum)
--
-- Lisansı olan mağazalarda hiçbir şey değişmiyor: kademeler aynen işliyor.
--
-- Not: Bu, lisanssız mağazanın süresiz çalışabilmesi demek. Kapıyı kapatmak
-- yerine kurucunun görmesi gerekiyor — Platform → Lisans'ta Arc lisansı
-- tanımlanmamış kurumlar gözden geçirilmeli.

create or replace function public.arc_store_stage(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select case
        -- Kurucu iptal ettiyse kademe işletilmez.
        when l.status = 'canceled' then 'closed'
        -- Süresi dolmamış aktif ya da deneme lisansı: her şey açık.
        when l.status in ('active','trialing')
             and (l.current_period_end is null or l.current_period_end > now())
          then 'open'
        -- Kurucu elle askıya aldıysa satış da durur; vitrin görünür kalır.
        when l.status = 'suspended' then 'sales_closed'
        -- Dönem sonu yoksa kademe sayılamaz; en hafif yaptırım uygulanır.
        when l.current_period_end is null then 'panel_closed'
        when now() < l.current_period_end + interval '1 month' then 'panel_closed'
        when now() < l.current_period_end + interval '2 months' then 'sales_closed'
        else 'closed'
      end
      from public.organization_product_licenses l
      where l.organization_id = p_organization_id and l.product = 'arc'
    ),
    -- Lisans satırı hiç yok: abonelik henüz başlamamış demektir, gecikmiş
    -- değil. Kurum meşruysa mağaza açık kalır; değilse kapalı.
    (
      select case when o.status in ('active','trial') then 'open' else 'closed' end
      from public.organizations o
      where o.id = p_organization_id
    ),
    'closed'
  )
$function$;

revoke all on function public.arc_store_stage(uuid) from public;
grant execute on function public.arc_store_stage(uuid) to authenticated, anon, service_role;
