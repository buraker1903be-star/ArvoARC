# Aktarım parçalara bölündü

## Sorun

Tek çağrıda 4.000 ürün işlemek Vercel'in süre sınırını aşıyordu;
istek 379 üründe sessizce kesildi. Vercel Hobby planında bir
fonksiyon en fazla 60 saniye çalışabilir.

## Çözüm

Aktarım artık her çağrıda **120 ürün** işliyor ve nerede kaldığını
veritabanına kaydediyor. Sonraki çağrı oradan devam ediyor.

Yanıtta ilerleme görünüyor:

```json
{ "mode": "tam", "toplam": 4000, "baslangic": 360,
  "okunan": 120, "kalan": 3520, "bitti": false,
  "sonraki": "480 / 4000" }
```

`"bitti": true` görene kadar aynı komutu tekrarlayın.

Stok modu bölünmüyor — o zaten hafif ve tek turda biter.

## Kurulum

### 1) Migration

`supabase/migrations/20260910001000_supplier_sync_cursor.sql`
dosyasını Supabase SQL Editor'de çalıştırın.

### 2) Kod

`src/app/api/tedarikci/ice-aktar/route.ts` dosyasını
güncelleyin, sonra:

```bash
cd ~/Desktop/ArvoARC
git add -A
git commit -m "Aktarim parcalara bolundu"
git push
```

### 3) Çalıştırma

Elle, bitene kadar tekrarlayarak:

```bash
curl -X POST "https://arc.arvo-os.com/api/tedarikci/ice-aktar?mod=tam&anahtar=ANAHTARINIZ"
```

Ya da hazır betikle (önerilen):

```bash
chmod +x aktarim.sh
./aktarim.sh ANAHTARINIZ
```

Betik bitene kadar kendisi tekrarlar, her turda ilerlemeyi yazar.
4.000 ürün için yaklaşık 35 tur, birkaç dakika sürer.

## Baştan başlatmak isterseniz

```sql
update arc_suppliers set sync_cursor = 0 where code = 'tarzyeri';
```

## İlerlemeyi görmek

```sql
select sync_cursor, sync_total, last_sync_note
from arc_suppliers where code = 'tarzyeri';
```
