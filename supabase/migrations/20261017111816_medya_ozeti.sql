-- MEDYA ÖZETİ (17.10.2026).
--
-- Medya ekranı yalnızca görselleri listeliyordu; "kaç ürünün görseli
-- YOK" sorusunun karşılığı hiçbir yerde yoktu. Görseli olmayan ürün
-- vitrinde boş bir kutu demek, yani fiilen satılamayan stok.
--
-- Sayı sayfadan hesaplanamıyor: medya listesi sayfalanıyor ve her
-- satır bir GÖRSEL, ürün değil. Üç sayı tek turda dönüyor.
--
-- jsonb_array_length dizi olmayan değerde hata veriyor; alan elle
-- düzenlenmiş kayıtlarda nesne de olabiliyor, o yüzden tür önce
-- sorulular. SECURITY INVOKER (varsayılan): satırları çağıranın
-- yetkisiyle okuyor, RLS yürürlükte.

create or replace function public.arc_medya_ozeti(p_organization_id uuid)
returns table(urun_toplam bigint, gorselli bigint, gorsel_toplam bigint)
language sql
stable
set search_path to ''
as $$
  with sayim as (
    select case
             when jsonb_typeof(p.metadata -> 'image_paths') = 'array'
               then jsonb_array_length(p.metadata -> 'image_paths')
             else 0
           end as adet
    from public.arc_products p
    where p.organization_id = p_organization_id
  )
  select
    count(*)::bigint,
    count(*) filter (where adet > 0)::bigint,
    coalesce(sum(adet), 0)::bigint
  from sayim;
$$;

revoke all on function public.arc_medya_ozeti(p_organization_id uuid) from public, anon, authenticated;
grant execute on function public.arc_medya_ozeti(p_organization_id uuid) to authenticated;
grant execute on function public.arc_medya_ozeti(p_organization_id uuid) to service_role;
