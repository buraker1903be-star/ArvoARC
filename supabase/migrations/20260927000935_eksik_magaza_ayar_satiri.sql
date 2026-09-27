-- EKSİK MAĞAZA AYAR SATIRLARI.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Hiçbir migration arc_store_settings'e varsayılan satır açmıyordu. Ayar
-- sekmelerinin beşi upsert'te store_name göndermediği için (o sütun NOT NULL
-- ve varsayılanı yok), satırı olmayan bir mağaza hangi sekmeye önce girerse
-- orada "null value in column store_name" hatası alıyordu. Canlıda tryOTO
-- anahtarı kaydedilirken çıktı (27.09.2026).
--
-- Uygulama tarafı düzeltildi (ayarlar/actions.ts: satır yoksa mağaza adı
-- kurumun adından, o da boşsa sabit bir addan dolduruluyor). Bu migration
-- MEVCUT mağazaları kurtarıyor: satır bir kez açıldıktan sonra bütün
-- upsert'ler UPDATE'e düşüyor ve sorun kökten bitiyor.
--
-- Kapsam ArvoARC lisansı olan kurumlar. organizations tablosu ArvoOS'un
-- kopyası ve burada e-ticaret kullanmayan kurumlar da var; hepsine satır
-- açmak, hiç kullanılmayacak ayar kayıtları üretirdi.

insert into public.arc_store_settings (organization_id, store_name)
select o.id, coalesce(nullif(trim(o.name), ''), 'Mağaza')
from public.organizations o
where exists (
  select 1 from public.organization_product_licenses l
  where l.organization_id = o.id and l.product = 'arc'
)
and not exists (
  select 1 from public.arc_store_settings s where s.organization_id = o.id
)
on conflict (organization_id) do nothing;
