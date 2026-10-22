-- Politikayı YEREL migration kuruyor: denetim bunu gecikme saymalı.
create policy kurum_modulleri_oku on public.kurum_modulleri
  as permissive for select to authenticated
  using (true);
