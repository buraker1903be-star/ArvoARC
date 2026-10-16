-- Örnek migration ağacı: KATALOG GECİKMESİ dalını sınıyor.
-- Kataloğa girmemiş ama migration'ın YARATTIĞI adlar burada.
alter table personel add column unvan text;
create table olmayan_tablo (id uuid primary key, organization_id uuid);
create or replace function olmayan_fonksiyon() returns void language sql as $$ select 1 $$;

/*
  GEVŞEK EŞLEŞME TUZAĞI. Aşağıdaki iki ad yalnızca BU GEREKÇEDE geçiyor:
  personel.yanlis_sutun ve sadece_yorumda_fonksiyon(). Gerekçede geçmek
  tanım değildir; denetim bunları gecikme sayarsa yazım hatasını örter.
*/
alter table baska_tablo add column yanlis_sutun integer;
