# Görsel koruma + stok modu düzeltmesi

## HANGİ REPO: C:\Users\PC\Desktop\Burak\ArvoARC

İki dosya:

```
src/app/api/tedarikci/ice-aktar/route.ts
vercel.json
```

```powershell
cd C:\Users\PC\Desktop\Burak\ArvoARC
git add -A
git status      # iki dosya gorunmeli
git commit -m "Gorsel korumasi ve stok modu duzeltmesi"
git push
```

## 1. Görselleriniz korunuyor

Mevcut ürünlerde **ad, açıklama ve görseller artık hiç
yazılmıyor**. Yalnızca stok, fiyat ve durum güncelleniyor.

Yani panelde bir ürünün fotoğrafını kendi çektiğinizle
değiştirdiyseniz, o fotoğraf kalıcı olarak kalır. Sonraki
senkronlar dokunmaz.

Yeni gelen ürünlerde tedarikçi verisi olduğu gibi kullanılır.

**Yan etkisi:** tedarikçi bir ürünün fotoğrafını iyileştirirse
siz göremezsiniz. Belirli bir ürünün görselini tedarikçiden
tazelemek isterseniz, o ürünü ARC'ta silip aktarımı tekrar
çalıştırmanız gerekir.

## 2. Stok modu artık silmiyor

Önceden stok modu da varyantları silip yeniden ekliyordu.
Gereksiz iş yapıyordu ve tedarikçinin aynı barkodu farklı
ürünlerde göndermesi durumunda benzersizlik hatası üretiyordu
(TR-8767, TR-11186, TR-4467-1107 hataları buradan geliyordu).

Artık stok modunda kayıt silinmiyor; `supplier_sku` üzerinden
yalnızca stok, maliyet ve fiyat güncelleniyor.

Yanıtta artık `guncellenenVaryant` sayacı var; `yeniVaryant`
yalnızca tam modda artıyor.

## 3. Cron 10 dakikada bir

`vercel.json` güncellendi. Katalog ~5 saatte tam turlanıyor.

## Doğrulama

Push ve deploy sonrası bir stok turu çalıştırın:

```powershell
.\stok.ps1 435b55338be7410da39bfd08ea686ec8
```

Bu sefer `yeniVaryant: 0` ve `guncellenenVaryant` dolu olmalı.
Mükerrer barkod hataları da kaybolmalı.

Cron'un çalıştığını izlemek için:

```sql
select sync_cursor, last_synced_at, last_sync_note
from arc_suppliers where code = 'tarzyeri';
```
