-- EKSİK AYAR SATIRLARI — lisans filtresi kaldırıldı.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Bir önceki migration (20260927000935) hiç satır eklemedi: kapsamı
-- organization_product_licenses'ta product='arc' kaydı olan kurumlarla
-- sınırlamıştım, oysa o tablo ArvoOS'tan köprüyle YAZILIYOR ve bu projede
-- dolu olmayabiliyor. Filtre, çözmesi gereken mağazayı da dışarıda bıraktı
-- ve "null value in column store_name" hatası sürdü.
--
-- Artık ayar satırı olmayan HER kurum için satır açılıyor. Fazladan birkaç
-- kayıt zararsız: hepsi varsayılan değerlerle doluyor (tablodaki tek
-- varsayılansız zorunlu sütun store_name) ve e-ticaret kullanılmayan
-- kurumda hiç okunmuyor. Hatanın sürmesi bundan pahalı.
--
-- returning: kaç satırın açıldığı çıktıda görünsün; bir önceki denemede
-- "No rows returned" cevabı, sorunun filtrede olduğunu anlatan tek işaretti.

insert into public.arc_store_settings (organization_id, store_name)
select o.id, coalesce(nullif(trim(o.name), ''), 'Mağaza')
from public.organizations o
where not exists (
  select 1 from public.arc_store_settings s where s.organization_id = o.id
)
on conflict (organization_id) do nothing
returning organization_id, store_name;
