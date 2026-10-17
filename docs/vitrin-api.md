# ArvoARC Vitrin API'si

Sitesini kendi yapan mağazalar için. Katalog verisi bu uçlardan
okunur; sipariş ve kupon kendi uçlarında kalır.

**Taban adres:** `https://arc.arvo-os.com/api/vitrin/v1`

---

## Mağaza nasıl tanınıyor?

İki yol var, ikisi de aynı sonuca varır:

1. **Tarayıcıdan** çağırıyorsanız `Origin` başlığı yeterli. Sitenizin
   alan adı ArvoARC panelinde kayıtlı ve doğrulanmış olmalı
   (Ayarlar → Mağaza alan adı → *Vitrin nerede?* → **Kendi sitemde**).
   CORS da yalnızca o alan adına açılır.
2. **Sunucudan** çağırıyorsanız tarayıcı yok, `Origin` de yok:
   `?magaza=siteniz.com` ekleyin.

Alan adı tanınmazsa **404** döner ve hiçbir veri verilmez. Varsayılan
bir mağazaya düşmek, yanlış kataloğu doğru gibi sunmak olurdu.

---

## Uçlar

Hepsi `GET`. Yanıt: `{ "kaynak": "...", "sayfa": { "limit": n, "offset": n }, "veri": [...] }`

| Uç | Ne döner | Parametreler |
|---|---|---|
| `/urunler` | Katalog sayfası | `limit`, `offset`, `marka`, `beden`, `azami_fiyat`, `sadece_indirimli=1`, `sadece_stokta=1`, `sirala` |
| `/urun` | Tek ürün | `slug` (zorunlu) |
| `/varyantlar` | Ürünün varyantları | `slug` (zorunlu) |
| `/koleksiyonlar` | Rafların listesi | — |
| `/koleksiyon` | Bir rafın ürünleri | `slug` + `urunler` ile aynı süzgeçler |
| `/arama` | Arama dizini | `limit`, `offset` |
| `/ayarlar` | Kargo ve havale kuralları | — |

**Sayfa boyu en fazla 100**, varsayılan 24. Daha fazlasını istemek
sessizce kesilen bir liste demek olurdu; sınır bu yüzden var.

**Tutarlar kuruş.** 1.249,90 ₺ → `124990`.

**Görseller mutlak adres olarak gelir.** Ürün satırında `gorseller`
(dizi), varyant satırında `gorsel` (tek). Yanıtta görünen
`image_paths` / `image_path` göreli alanlar geriye dönük uyumluluk
için duruyor; siz `gorseller`/`gorsel` kullanın.

---

## Üç kural

**1. Sepete her zaman varyantın SKU'sunu yazın.** Sipariş
oluştururken SKU yerine ürün slug'ı gönderirseniz ArvoARC siparişi
stokta olan HERHANGİ bir varyanta bağlar — müşteri seçmediği
tonu/bedeni alır.

**2. Tutarı siz hesaplamayın.** Gösterdiğiniz rakam bilgilendirmedir;
tahsil edilen tutarı ArvoARC hesaplar. Kargo, ücretsiz kargo eşiği ve
havale indirimi `/ayarlar`'dan gelir ama son söz sipariş ucundadır.

**3. Fiyat ve stok 60 saniye bayat olabilir.** Yanıtlar uçta o kadar
saklanıyor. Sepet ve ödeme adımında ArvoARC yeniden hesapladığı için
bu güvenli; ürün sayfasında daha tazesi gerekiyorsa `Cache-Control`
başlığını kendi tarafınızda yok sayın.

---

## Sipariş ve kupon

Bu iki iş veri API'sinde değil, kendi uçlarında — para ve stok kararı
veriyorlar:

| Uç | Yöntem |
|---|---|
| `https://arc.arvo-os.com/api/storefront/odeme` | `POST` |
| `https://arc.arvo-os.com/api/storefront/kupon` | `POST` |

İkisi de mağazayı `Origin`'den çözer, yani sitenizin alan adı kayıtlı
olmalı. Ödeme ucu siparişi oluşturur ve kart ödemesi için
yönlendirilecek adresi döndürür: **kart bilgisi sizin sitenizden
geçmez.**

---

## Hız sınırı

IP başına dakikada 120 istek. Aşılırsa `429` ve `Retry-After`.

---

## Hata biçimi

```json
{ "hata": "Mağaza tanınmadı. Alan adını ArvoARC panelinden kaydedin ya da ?magaza=<alan-adi> gönderin." }
```

| Kod | Anlamı |
|---|---|
| 404 | Mağaza tanınmadı ya da bilinmeyen kaynak |
| 429 | Hız sınırı |
| 502 | Veri okunamadı (bizim tarafımız) |
