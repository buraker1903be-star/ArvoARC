/*
  KARGO AĞIRLIKLARI — TEK SEFERLİK VERİ GÜNCELLEMESİ (migration değil).

  Ağırlık kademesi `arc_kargo_senti` ile geldi (20261022191631): bölgenin
  `base_kg` sınırını aşan her kilo için `fee_per_kg_cents` ekleniyor.
  Ağırlığı olmayan ürün mağaza ayarındaki varsayılanı kullanıyor
  (`default_shipping_weight_grams`, 500 g) — tişört ve kozmetik için
  doğru, kürk için DEĞİL.

  NEDEN GEREKLİ: katalogdaki 162 ağır üründen (kürk, kaban, mont, ceket)
  hiçbirinin ağırlığı yok, yani hepsi 500 g sayılıyor ve Avrupa'ya giden
  2 kg'lık bir kürk için 9 $ kilo ücreti HİÇ tahsil edilmiyordu. Fark
  bizden çıkıyor.

  "KÜRK ASTARLI" GERÇEK KÜRK DEĞİL. Katalogda
  "Erkek Çocuk Peluş Kürk Astarlı … Şişme Mont" gibi adlar var: kürk
  yalnızca astar. Şişme mont ağır ama hakiki kürk kadar değil, o yüzden
  sıra önemli — en ÖZEL kalıp önce eşleşiyor, yoksa bütün astarlı montlar
  2 kg yazılırdı.

  Değerler paketlemeyle birlikte TAHMİNDİR. Terazin varsa gerçek değeri
  panelden gir (Ürünler → ürün → kargo ağırlığı); buradaki kademe yalnızca
  "hiç yok"tan iyi olanı yazıyor.

  Uygulamadan önce 1. adımı koşturup kaç satırın hangi kademeye düştüğünü
  gör; 2. adım yazar.
*/

-- 1. ADIM — SALT OKUNUR ÖN İZLEME: hangi ürün hangi kademeye düşüyor?
with kademe as (
  select
    p.name,
    case
      -- Kürk yelek kolsuz: hakiki ama gövdesi küçük. ÖNCE geliyor;
      -- sonraki dal 'kürk' gören her şeyi 2 kg yazdığı için altta
      -- kalsa hiç eşleşmezdi.
      when p.name ilike '%kürk%yelek%' and p.name not ilike '%astarl%' then 1200
      -- Hakiki kürk: astar DEĞİL, kürkün kendisi.
      when p.name ilike '%kürk%' and p.name not ilike '%astarl%' then 2000
      when p.name ilike '%kaban%' or p.name ilike '%şişme mont%'
        or p.name ilike '%parka%' then 1500
      when p.name ilike '%mont%' or p.name ilike '%yağmurluk%'
        or p.name ilike '%rüzgarlık%' then 1200
      when p.name ilike '%ceket%' then 900
      when p.name ilike '%kazak%' or p.name ilike '%hırka%'
        or p.name ilike '%triko%' then 600
      else null
    end as gram
  from arc_products p
  where p.organization_id = 'f00ab7ef-e9be-467b-9e95-db8f753275c3'
    and p.status = 'active'
)
select coalesce(gram::text, 'varsayılan (500)') as kademe,
       count(*) as urun,
       min(name) as ornek
from kademe
group by 1
order by 1;

-- 2. ADIM — YAZAR. 1. adımın sonucunu onayladıktan sonra çalıştır.
-- Yalnızca ağırlığı HİÇ olmayan ürüne yazıyor: panelden elle girilmiş
-- gerçek bir ağırlığı tahminle ezmek, veriyi kötüleştirmek olurdu.
/*
update arc_products p set shipping_weight_grams = case
  when p.name ilike '%kürk%yelek%' and p.name not ilike '%astarl%' then 1200
  when p.name ilike '%kürk%' and p.name not ilike '%astarl%' then 2000
  when p.name ilike '%kaban%' or p.name ilike '%şişme mont%'
    or p.name ilike '%parka%' then 1500
  when p.name ilike '%mont%' or p.name ilike '%yağmurluk%'
    or p.name ilike '%rüzgarlık%' then 1200
  when p.name ilike '%ceket%' then 900
  when p.name ilike '%kazak%' or p.name ilike '%hırka%'
    or p.name ilike '%triko%' then 600
end
where p.organization_id = 'f00ab7ef-e9be-467b-9e95-db8f753275c3'
  and p.status = 'active'
  and p.shipping_weight_grams is null
  and (p.name ilike '%kürk%' or p.name ilike '%kaban%' or p.name ilike '%mont%'
    or p.name ilike '%ceket%' or p.name ilike '%kazak%' or p.name ilike '%hırka%'
    or p.name ilike '%triko%' or p.name ilike '%parka%'
    or p.name ilike '%yağmurluk%' or p.name ilike '%rüzgarlık%');
*/
