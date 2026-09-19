-- ARC ayrılması: son aktarım bittikten ve geçiş doğrulandıktan sonra.

-- YENİ projede (obaskcdxaaezjglayash) çalıştırın:
drop function if exists public.arc_aktarim_pk(text);
drop function if exists public.arc_aktarim_yukle(text, jsonb);
drop function if exists public.arc_aktarim_sil(text, jsonb);
drop function if exists public.arc_aktarim_hesap_yukle(jsonb, jsonb);

-- ESKİ projede (oahshpkgdzrraqdzjqau) çalıştırın:
-- drop function if exists public.arc_aktarim_hesaplar();
