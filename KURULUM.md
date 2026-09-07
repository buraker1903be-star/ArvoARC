# İçe aktarma — 1000 satır sınırı düzeltmesi

## HANGİ REPO: ~/Desktop/ArvoARC

Yalnızca şu dosyayı değiştirin:

```
src/app/api/tedarikci/ice-aktar/route.ts
```

**Zip'i klasör üzerine kopyalamayın** — bu, bugün üç kez dosya
kaybına yol açtı. Dosyayı tek başına açıp içeriğini kopyalayın.

```bash
cd ~/Desktop/ArvoARC
git add -A
git status     # yalnızca route.ts görünmeli
git commit -m "Urun okumada sayfalama"
git push
```

## Sorun

İlk aktarım sorunsuz tamamlandı: 3.277 ürün, yaklaşık 14.000
varyant, hata yok.

İkinci çalıştırmada yüzlerce "duplicate key" hatası çıktı.

Sebep: Supabase `select` sorguları varsayılan olarak **en fazla
1000 satır** döndürüyor. Mevcut ürünleri okurken yalnızca ilk
1000'i alıyor, kalan 2.277 ürünü "yok" sanıp yeniden eklemeye
çalışıyor ve slug çakışması veriyordu.

Veri bozulmadı — çakışan kayıtlar eklenmedi, mevcutları olduğu
gibi kaldı.

## Çözüm

Mevcut ürünler artık sayfalanarak okunuyor; tamamı belleğe
alınıyor. Tekrar çalıştırmalarda ürünler doğru eşleşecek ve
güncellenecek.

## Son çalıştırmadaki "toplam: 0"

Son turda XML boş döndü (`"toplam":0`). Geçici bir bağlantı
sorunu ya da Tarzyeri tarafında anlık kesinti olabilir. Bir
sonraki çalıştırmada normale dönmesi beklenir; dönmezse haber
verin.

## Doğrulama

```sql
select count(*) as urun,
       (select count(*) from arc_product_variants where supplier='tarzyeri') as varyant
from arc_products where supplier = 'tarzyeri';
```

3.277 ürün ve 14.000 civarı varyant görmelisiniz.

```sql
select p.name, v.title,
       v.cost_price/100.0 as alis,
       v.price/100.0 as satis,
       v.stock
from arc_product_variants v
join arc_products p on p.id = v.product_id
where v.supplier = 'tarzyeri'
limit 5;
```

Fiyatlar `,90` ile bitmeli; satış ≈ alış × 1,40 + 60 TL.
