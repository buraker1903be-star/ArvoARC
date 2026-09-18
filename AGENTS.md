# ArvoARC

Çok mağazalı e-ticaret paneli ve vitrin arka ucu. Next.js · Supabase.
Kurulum notları `KURULUM.md`, depo onarım geçmişi `ONARIM.md`.

## Dil

Arayüz metinleri, hata mesajları ve kod yorumları **Türkçe**. Yorumlar "ne
yaptığını" değil **neden öyle olduğunu** anlatır; bir hata düzeltiliyorsa eski
davranış da yazılır ("Önceden … okunuyordu"). Yeni kod bu üsluba uyar.

## Değişmezler

- **Her şey mağaza kapsamlıdır.** Sorgu, RPC ve arka plan işi
  `organization_id` ile sınırlanmalı. Tek bir mağazaya sabitlenmiş kod bu
  projede somut hasara yol açtı: `settle_arvoculture_storefront_order` ve
  tedarikçi stok yazımı ArvoCulture'a sabitliydi; diğer mağazalarda kartla
  ödeme alınıyor ama sipariş sonsuza kadar "ödeme bekliyor"da kalıyordu.
  Yeni bir RPC ya da uç yazarken mağaza kapsamını açıkça verin.
- **Para kuruş cinsinden tamsayıdır.** Kullanıcı ve CSV girdisi için
  `parseMoneyToCents`: iki ayırıcı varsa sondaki ondalıktır ("1.234,56" ve
  "1,234.56" aynı), tek ayırıcı ve son grup tam 3 haneyse binliktir
  ("1.234" = 1.234 ₺). Geçersiz ve eksi değer 0.
- **Tarih Türkiye saatiyle.** Gün sınırı, gün grupları ve `datetime-local`
  değerleri Türkiye saatine göre okunur; UTC'ye göre hesaplamak gece
  00:00–03:00 arasında siparişi bir önceki güne düşürür.
- **Sırlar sabit zamanlı karşılaştırılır** ve uzunluk farkı önce elenir:
  `timingSafeEqual` farklı uzunlukta istisna fırlatır. Değişken tanımlı
  değilse karşılaştırma `false` döner — kapalı başarısızlık.
- **PayTR anahtarları mağaza başınadır**, `arc_store_settings`'te AES-256-GCM
  ile şifreli. Ortam değişkenlerindeki anahtarlar yalnızca
  `PAYTR_LEGACY_ORGANIZATION_SLUG` ile eşleşen tek eski mağaza içindir ve
  ArvoCulture'ın hesabına aittir; başka mağazada kullanılırsa tahsilat yanlış
  hesaba düşer.
- **`PAYTR_TEST_MODE` tanımlı değilse test moduna düşer.** Canlıda bu satır
  unutulursa eski mağazanın ödemeleri gerçekten tahsil edilmez; açıkça `0`
  yazılmalıdır.
- **PayTR bildirimine her durumda `OK` dönülür**, ama hata sessizce
  yutulmaz: sipariş bulunamadığında ya da imza tutmadığında günlüğe yazılır.
  `OK` dönmemek PayTR'ın bildirimi tekrarlamasına yol açar.
- **Kısmi iade siparişi kapatmaz.** Sipariş akışta ilerlemeye devam eder;
  yalnızca iade toplamı sipariş tutarına ulaşınca kapanır. Kargo çıkmadıysa
  kargo bedeli de iadeye girer, çıktıysa girmez. Tahsil edilenden fazlası
  iade edilemez.
- **Vitrin (ArvoCulture-site) ARC'ın hesabını aynalar.** Sipariş
  fonksiyonunda ya da `api/storefront/odeme`'de kargo, kupon veya havale
  kuralı değişirse vitrindeki `src/lib/order-quote.ts` ve testi aynı gün
  güncellenmeli; kural değişikliği tek başına yapılınca müşteri ödemede ARC'ın
  tahsil ettiğinden farklı tutar görür (17 Eylül 2026'da oldu). Vitrinin
  okuduğu ayarlar `get_arvoculture_storefront_settings` ile açılır; bu
  fonksiyonun döndürdüğü alanlar vitrinin sözleşmesidir.
- **E-postaya giren her kullanıcı metni HTML'e kaçışla girer** (müşteri adı,
  not, adres).
- **Geri dönüş adresi doğrulanır**: başka bölüme ya da dış adrese
  yönlendirme engellenir, filtre ve sayfa korunur.

## Migration

Yeni dosyayı **`npm run db:new -- <ad>`** ile açın; sürümü son migration'ın
ardına kendisi yerleştirir. `npm run check:migrations` CI'da çalışır. ARC ve
ArvoOS aynı veritabanını kullanır; migration'lar SQL Editor'den elle
uygulanır. Canlı şemanın tam anlık görüntüsü `supabase/schema/` altında.

## Testler

```bash
npm test
```

`tests/` altında saf mantık modülleri sınanır (para, tarih, sipariş akışı,
iade, kilit, hız sınırı, e-posta metinleri, geri dönüş adresi). Node
TypeScript'i kendisi sıyırıyor, `tests/register.mjs` yalnızca `@/` takma adını
çözüyor — derleme adımı ve ek bağımlılık yok.

Bir hata düzeltince onu sabitleyen testi de ekleyin. Bir mantık parçası test
edilemiyorsa nedeni genellikle Next/Supabase'e bağlı bir dosyanın içinde
durmasıdır — ayırın.

## Kontroller

`npx tsc --noEmit`, `npm run lint`, `npm test` — üçü de CI'da
(`.github/workflows/ci.yml`) çalışır. Derleme CI'da yapılmaz, Vercel tarafında.

## Ortam değişkenleri

Tamamı `.env.example` içinde, her biri için eksik olduğunda ne olacağı
yazılı. Sırlar `NEXT_PUBLIC_` ile başlamaz.
