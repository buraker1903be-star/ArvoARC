-- ============================================================
-- ARC ayrılması, son aktarım: YENİ projeye (obaskcdxaaezjglayash) uygulanır.
-- scripts/ayrilma/04-son-aktarim.mjs bu fonksiyonları çağırır. Geçişten sonra
-- 04c-temizlik.sql ile kaldırılır.
--
-- Neden veritabanında: veri tetikleyiciler KAPALIYKEN yazılmalı
-- (session_replication_role = replica). Açık olursa stok hareketi, kupon
-- kullanım sayacı, sipariş olayı gibi tetikleyiciler eski veritabanında zaten
-- çalışmış işleri bir kez daha yapar. Bu ayar veri API'sinden verilemez.
--
-- Yalnızca service_role (secret anahtar) çağırabilir; yalnızca arc_ tablolarına
-- ve ARC'ın hesaplarına dokunur.
-- ============================================================

-- Tablonun birincil anahtar sütunları (betik silme karşılaştırması için ister).
create or replace function public.arc_aktarim_pk(p_tablo text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(a.attname::text order by array_position(i.indkey, a.attnum))
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = format('public.%I', p_tablo)::regclass and i.indisprimary
    and p_tablo like 'arc\_%';
$$;

-- Satırları yazar: varsa günceller (birincil anahtara göre), yoksa ekler.
create or replace function public.arc_aktarim_yukle(p_tablo text, p_satirlar jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hedef regclass;
  sutunlar text;
  guncelle text;
  anahtar text;
  adet integer;
begin
  if p_tablo not like 'arc\_%' then
    raise exception 'Yalnızca arc_ tabloları aktarılır: %', p_tablo;
  end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) = 0 then
    return 0;
  end if;
  hedef := format('public.%I', p_tablo)::regclass;
  perform set_config('session_replication_role', 'replica', true);

  select string_agg(quote_ident(a.attname), ',' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ',' order by a.attnum)
    into sutunlar, guncelle
  from pg_attribute a
  where a.attrelid = hedef and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname in (select jsonb_object_keys(p_satirlar -> 0));

  select string_agg(quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum))
    into anahtar
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = hedef and i.indisprimary;

  if anahtar is null then
    raise exception '% tablosunun birincil anahtarı yok', p_tablo;
  end if;

  execute format(
    'insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1) on conflict (%s) do update set %s',
    hedef, sutunlar, sutunlar, hedef, anahtar, guncelle)
  using p_satirlar;
  get diagnostics adet = row_count;
  return adet;
end
$$;

-- Eski tarafta artık olmayan satırları siler. p_anahtarlar: eskideki bütün
-- satırların birincil anahtarları (ör. [{"id": "…"}, …]).
create or replace function public.arc_aktarim_sil(p_tablo text, p_anahtarlar jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hedef regclass;
  sol text;
  sag text;
  adet integer;
begin
  if p_tablo not like 'arc\_%' then
    raise exception 'Yalnızca arc_ tabloları: %', p_tablo;
  end if;
  if jsonb_typeof(p_anahtarlar) <> 'array' then
    raise exception 'Anahtar listesi dizi olmalı';
  end if;
  hedef := format('public.%I', p_tablo)::regclass;
  perform set_config('session_replication_role', 'replica', true);

  select string_agg('t.' || quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum)),
         string_agg('k.' || quote_ident(a.attname), ',' order by array_position(i.indkey, a.attnum))
    into sol, sag
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = hedef and i.indisprimary;

  execute format(
    'delete from %s t where not exists (select 1 from jsonb_populate_recordset(null::%s, $1) k where row(%s) = row(%s))',
    hedef, hedef, sol, sag)
  using p_anahtarlar;
  get diagnostics adet = row_count;
  return adet;
end
$$;

-- Hesaplar: şifre özetleriyle. Aynı kimlik (uuid) varsa güncellenir;
-- giriş kimlikleri (auth.identities) kullanıcı başına baştan yazılır.
-- Köprünün şifresiz açtığı hesap burada eski şifresine kavuşur.
create or replace function public.arc_aktarim_hesap_yukle(p_kullanicilar jsonb, p_kimlikler jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sutunlar text;
  guncelle text;
  kullanici integer := 0;
  kimlik integer := 0;
begin
  if jsonb_array_length(p_kullanicilar) = 0 then
    return jsonb_build_object('kullanici', 0, 'kimlik', 0);
  end if;
  perform set_config('session_replication_role', 'replica', true);

  select string_agg(quote_ident(a.attname), ',' order by a.attnum),
         string_agg(format('%1$I = excluded.%1$I', a.attname), ',' order by a.attnum) filter (where a.attname <> 'id')
    into sutunlar, guncelle
  from pg_attribute a
  where a.attrelid = 'auth.users'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname in (select jsonb_object_keys(p_kullanicilar -> 0));
  execute format(
    'insert into auth.users (%s) select %s from jsonb_populate_recordset(null::auth.users, $1) on conflict (id) do update set %s',
    sutunlar, sutunlar, guncelle)
  using p_kullanicilar;
  get diagnostics kullanici = row_count;

  delete from auth.identities
  where user_id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_kullanicilar) e);
  if jsonb_array_length(p_kimlikler) > 0 then
    select string_agg(quote_ident(a.attname), ',' order by a.attnum) into sutunlar
    from pg_attribute a
    where a.attrelid = 'auth.identities'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and a.attname in (select jsonb_object_keys(p_kimlikler -> 0));
    execute format(
      'insert into auth.identities (%s) select %s from jsonb_populate_recordset(null::auth.identities, $1)',
      sutunlar, sutunlar)
    using p_kimlikler;
    get diagnostics kimlik = row_count;
  end if;
  return jsonb_build_object('kullanici', kullanici, 'kimlik', kimlik);
end
$$;

revoke all on function public.arc_aktarim_pk(text) from public, anon, authenticated;
revoke all on function public.arc_aktarim_yukle(text, jsonb) from public, anon, authenticated;
revoke all on function public.arc_aktarim_sil(text, jsonb) from public, anon, authenticated;
revoke all on function public.arc_aktarim_hesap_yukle(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.arc_aktarim_pk(text) to service_role;
grant execute on function public.arc_aktarim_yukle(text, jsonb) to service_role;
grant execute on function public.arc_aktarim_sil(text, jsonb) to service_role;
grant execute on function public.arc_aktarim_hesap_yukle(jsonb, jsonb) to service_role;

-- Veri API'si yeni fonksiyonu hemen görsün (yoksa "schema cache" hatası).
notify pgrst, 'reload schema';
