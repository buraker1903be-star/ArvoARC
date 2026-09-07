# Tedarikçi entegrasyonu — 3. adım (zamanlanmış senkron)

## HANGİ REPO: C:\ArvoARC

Bu paket 2. adımın dosyalarını da içeriyor; ikisini birden
uygulamadıysanız doğrudan bunu kullanın.

### Dosyalar

```
src/lib/supplier/tarzyeri.ts
src/app/api/tedarikci/ice-aktar/route.ts
vercel.json
```

**`vercel.json` dikkat:** mevcut dosyanızdaki `regions` ayarı
korundu. Kendi dosyanızda başka ayarlar varsa üzerine yazmadan
önce karşılaştırın; yalnızca `crons` bölümünü eklemek yeterli.

### Bağımlılık

```powershell
cd C:\ArvoARC
npm install fast-xml-parser
```

### Ortam değişkenleri

| Key | Açıklama |
| --- | --- |
| `SUPPLIER_SYNC_SECRET` | Elle tetikleme için, siz belirleyin |
| `CRON_SECRET` | Zamanlanmış görev için, siz belirleyin |
| `SUPABASE_SERVICE_ROLE_KEY` | Zaten tanımlı olmalı |

Vercel Cron, `CRON_SECRET` değerini otomatik olarak
`Authorization: Bearer ...` başlığında gönderir.

### Push

```powershell
git add -A
git commit -m "Tedarikci XML ice aktarma ve zamanlanmis stok senkronu"
git push
```

## Zamanlama

Günde üç kez: **06:00, 12:00, 18:00** (UTC).

Türkiye saatiyle 09:00, 15:00, 21:00. Sabah açılıştan önce, öğlen
ve akşam. Stok hareketinin en yoğun olduğu saatleri kapsıyor.

Değiştirmek için `vercel.json` içindeki `schedule` alanı. Biçim
standart cron: `dakika saat gün ay haftagünü`.

## Ne yapıyor

**Zamanlanmış çalıştırma her zaman stok modunda.** Stok, maliyet
ve satış fiyatı güncellenir. Ürün adları, açıklamalar ve
görseller değişmez.

Bu bilinçli: panelde bir ürün adını düzelttiyseniz her senkronda
tedarikçinin adı geri gelsin istemezsiniz.

**Tam aktarım elle tetiklenir:**

```powershell
curl -X POST "https://arc.arvo-os.com/api/tedarikci/ice-aktar?mod=tam&anahtar=ANAHTARINIZ"
```

Yeni ürünler geldiğinde ya da tedarikçi katalogda değişiklik
yaptığında çalıştırın.

## Doğrulama

İlk cron çalışmasından sonra Vercel → Logs → Cron sekmesinde
sonucu görürsünüz. Ayrıca:

```sql
select code, last_synced_at, last_sync_note
from arc_suppliers where code = 'tarzyeri';
```

## Uyarı

Vercel'in Hobby planında cron **günde bir kez** çalışır. Pro
planda sınır yok. Planınız Hobby ise zamanlamayı `0 6 * * *`
olarak değiştirin ya da Pro'ya geçin.

Stok senkronu günde tek sefer yeterli olmayabilir; tedarikçide
tükenen ürünü satma riski artar.
