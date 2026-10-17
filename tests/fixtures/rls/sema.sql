-- Denetimin örnek şeması. Üç durum birden:
--   arc_siparis      → RLS + politika var (sorun yok)
--   kurum_modulleri  → RLS, politika YOK, invoker fonksiyon okuyor (hata)
--   kopya_tablo      → RLS, politika YOK, kimse okumuyor (yalnızca liste)
CREATE OR REPLACE FUNCTION public.arc_siparis_olustur(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (select 1 from public.kurum_modulleri m where m.id = p_id) then
    raise exception 'Commerce module is disabled';
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION public.arc_kiraci()
 RETURNS void
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select from public.kopya_tablo limit 1;
$function$
;

alter table public.arc_siparis enable row level security;
alter table public.kurum_modulleri enable row level security;
alter table public.kopya_tablo enable row level security;

create policy arc_siparis_uye_okur on public.arc_siparis as PERMISSIVE for SELECT to authenticated
  using (true);
