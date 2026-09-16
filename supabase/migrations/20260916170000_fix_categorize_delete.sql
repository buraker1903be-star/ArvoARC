-- Kategorileme görevi her 10 dakikada bir hata veriyordu:
--   Kategorileme hatası: { code: '21000', message: 'DELETE requires a WHERE clause' }
--
-- Sebep: Supabase'de pg_safeupdate koruması açık; where içermeyen delete/update
-- ifadelerini reddediyor ve bu kural fonksiyonun içindeki ifadeler için de
-- geçerli. Takılan satır geçici tablonun temizlenmesiydi:
--     delete from arc_kategori_gecici;
--
-- truncate bu korumaya takılmaz ve geçici tabloyu boşaltmanın doğru yolu zaten
-- odur. Fonksiyonun geri kalanı birebir aynı bırakıldı.
--
-- NOT: Fonksiyon hâlâ organizasyonu slug = 'arvoculture' ile sabit seçiyor.
-- İkinci mağaza geldiğinde onun ürünleri kategorilenmez; ayrı bir iş olarak
-- ele alınmalı (p_supplier gibi bir p_organization_id parametresi gerekiyor).

create or replace function public.arc_categorize_supplier_products(p_supplier text default 'tarzyeri'::text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_links integer := 0;
  v_added integer;
begin
  select id into v_org_id
  from public.organizations where slug = 'arvoculture' limit 1;

  if v_org_id is null then
    raise exception 'Organizasyon bulunamadı';
  end if;

  create temporary table if not exists arc_kategori_gecici (
    product_id uuid,
    ana text,      -- Erkek, Kadın, Çocuk, Aksesuar
    grup text,     -- Üst Giyim, Alt Giyim, Dış Giyim…
    tur text       -- T-Shirt, Ceket, Kol Saati…
  ) on commit drop;

  -- pg_safeupdate: where'süz delete reddedilir; truncate korumaya takılmaz.
  truncate table arc_kategori_gecici;

  insert into arc_kategori_gecici
  select
    p.id,
    public.arc_baslik(trim(split_part(k, '>', 1))),
    /*
      Menü grubu normalleştirmesi.

      - "ERKEK ALT GİYİM" → "Alt Giyim" (cinsiyet öneki atılır)
      - "UNİSEX ÇOCUK"    → "Çocuk"
      - Aksesuarda ikinci seviye cinsiyettir; grup "Aksesuar"
        olarak sabitlenir.
    */
    case
      when upper(trim(split_part(k, '>', 1))) = 'AKSESUAR'
        then 'Aksesuar'
      else public.arc_baslik(
        trim(
          regexp_replace(
            trim(split_part(k, '>', 2)),
            '^(ERKEK|KADIN|UNİSEX|UNISEX)\s+', '', 'i'
          )
        )
      )
    end,
    public.arc_baslik(trim(split_part(k, '>', 3)))
  from public.arc_products p
  cross join lateral (
    select p.metadata ->> 'supplier_category' as k
  ) x
  where p.organization_id = v_org_id
    and p.supplier = p_supplier
    and p.status = 'active'
    and coalesce(x.k, '') <> '';

  -- Ana koleksiyonlar: Erkek, Kadın, Çocuk, Aksesuar
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id, t.ana, public.arc_slugify(t.ana), '', 'active',
    jsonb_build_object('menu_group', 'Kime Göre', 'auto', true)
  from arc_kategori_gecici t
  where coalesce(t.ana, '') <> ''
  on conflict (organization_id, slug) do nothing;

  -- Tür koleksiyonları: "Erkek T-Shirt", "Kadın Ceket"…
  insert into public.arc_collections
    (organization_id, title, slug, description, status, metadata)
  select distinct
    v_org_id,
    t.ana || ' ' || t.tur,
    public.arc_slugify(t.ana || '-' || t.tur),
    '', 'active',
    jsonb_build_object(
      'menu_group', coalesce(nullif(t.grup, ''), t.ana),
      'parent', t.ana,
      'auto', true
    )
  from arc_kategori_gecici t
  where coalesce(t.tur, '') <> ''
  on conflict (organization_id, slug) do nothing;

  /*
    Var olan otomatik koleksiyonların başlığını ve menü grubunu
    da tazele — önceki sürüm bozuk Türkçe üretmişti.
  */
  update public.arc_collections c
     set title = t.ana,
         metadata = c.metadata || jsonb_build_object('menu_group', 'Kime Göre'),
         updated_at = now()
  from (select distinct ana from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana);

  update public.arc_collections c
     set title = t.ana || ' ' || t.tur,
         metadata = c.metadata || jsonb_build_object(
           'menu_group', coalesce(nullif(t.grup, ''), t.ana),
           'parent', t.ana
         ),
         updated_at = now()
  from (select distinct ana, grup, tur from arc_kategori_gecici) t
  where c.organization_id = v_org_id
    and c.metadata ->> 'auto' = 'true'
    and c.slug = public.arc_slugify(t.ana || '-' || t.tur);

  -- Bağlantılar
  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana)
  where coalesce(t.ana, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  insert into public.arc_collection_products
    (organization_id, collection_id, product_id)
  select v_org_id, c.id, t.product_id
  from arc_kategori_gecici t
  join public.arc_collections c
    on c.organization_id = v_org_id
   and c.slug = public.arc_slugify(t.ana || '-' || t.tur)
  where coalesce(t.tur, '') <> ''
  on conflict (collection_id, product_id) do nothing;

  get diagnostics v_added = row_count;
  v_links := v_links + v_added;

  return v_links;
end;
$function$;
