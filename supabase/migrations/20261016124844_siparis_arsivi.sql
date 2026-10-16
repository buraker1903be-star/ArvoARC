-- siparis_arsivi
--
-- SİPARİŞ ARŞİVİ (16.10.2026, kurum sahibi: "tamamlananları arşivle,
-- listeyi kalabalık tutmayalım"). Sipariş listesi bütün siparişleri
-- gösteriyordu: 23 siparişin 22'si tamamlanmıştı ve günlük iş olan tek
-- bekleyen sipariş onların arasında kayboluyordu.
--
-- Arşiv bir GÖRÜNÜM kararı, kayıt silinmiyor: ciro, analitik, müşteri
-- geçmişi ve stok hesapları arşivdeki siparişleri saymaya devam ediyor.
-- Yalnızca sipariş listesi varsayılan olarak arşivdekileri göstermiyor.
--
-- KURAL VERİTABANINDA (tetikleyici), çünkü oturum jetonu tarayıcıda ve
-- UPDATE yetkisi olan kullanıcı her sütunu API'den yazabilir:
--   * Yalnızca KAPANMIŞ sipariş (tamamlandı, iptal, iade) arşivlenir.
--     Açık bir siparişi arşive kaldırmak, işi listeden saklamak demek.
--   * Arşivdeki sipariş yeniden açılırsa (durum geri alınırsa)
--     arşivden kendiliğinden çıkar.
--   * Arşivdeki siparişe İADE TALEBİ gelirse arşivden çıkar: talep
--     ekibin önüne düşmeli, arşivde beklememeli.

alter table public.arc_orders add column if not exists archived_at timestamptz;
alter table public.arc_orders add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- Liste varsayılan olarak arşivsizleri, en yeniden eskiye okuyor.
create index if not exists arc_orders_aktif_liste_idx
  on public.arc_orders (organization_id, created_at desc)
  where archived_at is null;

create or replace function private.arc_order_archive_guard()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.archived_at is not null and new.status not in ('fulfilled', 'cancelled', 'refunded') then
    if old.archived_at is null then
      raise exception 'Yalnızca tamamlanan, iptal ya da iade edilen sipariş arşivlenir'
        using errcode = 'check_violation';
    end if;
    -- Arşivdeki sipariş yeniden açıldı: arşivden çıkar.
    new.archived_at := null;
    new.archived_by := null;
  end if;
  return new;
end
$function$;

revoke all on function private.arc_order_archive_guard() from public, anon, authenticated;

drop trigger if exists arc_order_archive_guard on public.arc_orders;
create trigger arc_order_archive_guard
  before update of archived_at, status on public.arc_orders
  for each row execute function private.arc_order_archive_guard();

create or replace function private.arc_return_request_unarchive()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.arc_orders
     set archived_at = null, archived_by = null
   where id = new.order_id
     and organization_id = new.organization_id
     and archived_at is not null;
  return new;
end
$function$;

revoke all on function private.arc_return_request_unarchive() from public, anon, authenticated;

drop trigger if exists arc_return_request_unarchive on public.arc_return_requests;
create trigger arc_return_request_unarchive
  after insert on public.arc_return_requests
  for each row execute function private.arc_return_request_unarchive();
