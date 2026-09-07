-- ============================================================
-- Aktarımı parçalara bölme
--
-- Tek çağrıda 4.000 ürün işlemek Vercel'in süre sınırını aşıyor
-- ve istek yarıda kesiliyor (379 üründe durdu). Aktarım artık
-- her çağrıda sabit sayıda ürün işleyip nerede kaldığını
-- kaydediyor; sonraki çağrı oradan devam ediyor.
-- ============================================================

alter table public.arc_suppliers
  add column if not exists sync_cursor integer not null default 0,
  add column if not exists sync_total integer not null default 0;

comment on column public.arc_suppliers.sync_cursor is
  'Aktarımda kaldığı sıra. Tamamlanınca sıfırlanır.';
