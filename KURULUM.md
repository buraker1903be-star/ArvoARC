# PayTR entegrasyonu — ARC tarafı

Bu paket ArvoARC reposuna eklenir. Dosyaları aynı yollara kopyalayın.

## 1. Migration

`supabase/migrations/20260906001000_add_storefront_order_settlement.sql`

Supabase SQL Editor'e yapıştırıp çalıştırın ya da `supabase db push`.

Bu fonksiyon **bilerek `anon` rolüne açılmıyor**. Yalnızca sunucudaki
callback servisi, `service_role` anahtarıyla çağırabilir. Açılsaydı
herkes kendi siparişini "ödendi" işaretleyebilirdi.

## 2. Ortam değişkenleri (Vercel → ArvoARC projesi)

| Değişken | Açıklama |
| --- | --- |
| `PAYTR_MERCHANT_ID` | PayTR panelinden |
| `PAYTR_MERCHANT_KEY` | PayTR panelinden — **Sensitive işaretleyin** |
| `PAYTR_MERCHANT_SALT` | PayTR panelinden — **Sensitive işaretleyin** |
| `PAYTR_TEST_MODE` | Başlangıçta `1`. Canlıya geçerken `0`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `STOREFRONT_URL` | `https://arvoculture.com` |

`NEXT_PUBLIC_` öneki **kullanmayın**. Bu değerler tarayıcıya sızarsa
herkes sizin adınıza ödeme oturumu açabilir.

`SUPABASE_SERVICE_ROLE_KEY` RLS'i tamamen atlar. Yalnızca Vercel
ortam değişkeninde tutun, koda yazmayın, commit etmeyin.

## 3. PayTR panelinde bildirim URL'si

PayTR → Ayarlar → **Bildirim URL**:

```
https://<arc-adresiniz>/api/storefront/paytr-bildirim
```

Bu adres tanımlanmazsa ödeme alınır ama sipariş "ödendi" olmaz.

## 4. Akış

```
Vitrin (sepet)
   ↓ POST /api/storefront/odeme  { email, name, phone, address, items }
ARC: create_arvoculture_storefront_order   → tutarı SUNUCU hesaplar
   ↓
ARC: PayTR get-token                        → token
   ↓
Vitrin: iFrame açılır, müşteri öder
   ↓
PayTR → POST /api/storefront/paytr-bildirim (sunucudan sunucuya)
   ↓ imza doğrulanır
ARC: settle_arvoculture_storefront_order    → paid + stok düşer
```

**İstemciden gelen hiçbir tutar kullanılmaz.** Müşteri yalnızca SKU ve
adet gönderir; fiyat, indirim, kargo ve toplam veritabanından hesaplanır.
Bu olmadan tarayıcı konsolundan fiyat değiştirilerek sipariş verilebilir.

## 5. Test

`PAYTR_TEST_MODE=1` iken PayTR'ın test kartlarını kullanın. Bir sipariş
verip şunları doğrulayın:

- ARC panelinde sipariş `pending` olarak düştü mü
- Ödeme sonrası `paid` + `confirmed` oldu mu
- Stok düştü mü
- Aynı bildirimi PayTR tekrarlarsa stok **ikinci kez düşmüyor** olmalı

Hepsi doğruysa `PAYTR_TEST_MODE=0` yapıp yeniden dağıtın.

## Sırada — vitrin tarafı

Bu paket ARC tarafını tamamlıyor. Vitrinde hâlâ eksik olanlar:

- Sepet sayfası (kargo hesabıyla)
- Adres formu, misafir alışveriş
- KVKK / mesafeli satış / ön bilgilendirme onayları
- PayTR iFrame'ini açan ödeme sayfası
- `/siparis/tamam` ve `/siparis/hata` sayfaları

Bunları bir sonraki adımda yazacağım.
