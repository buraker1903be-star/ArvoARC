# ARC'ın kendi veritabanına taşınması

Karar (18 Eylül 2026): ARC, ArvoOS ile paylaştığı Supabase projesinden
(`oahshpkgdzrraqdzjqau`) kendi projesine (`cernfbgdzkjmefqdeiub`) taşınıyor.
Lisansı ArvoOS yönetmeye devam eder ve ARC'a aktarır; bugünkü verinin tamamı
(katalog, siparişler, müşteri hesapları, görseller) taşınır.

## Bugünkü bağımlılıklar (canlı şemadan çıkarıldı)

| Bağımlılık | Nerede | Taşınınca |
|---|---|---|
| `organizations` | 18 `arc_` tablosunun hepsinde FK; 23 fonksiyon | ARC'ta aynı adla, ArvoOS'tan aktarılan kopya |
| `organization_memberships` | 15 politika, 4 fonksiyon (`arc_resolve_commerce_tenant` dahil) | ARC'ta kopya; ArvoOS aktarır |
| `organization_product_licenses` (`product='arc'`), `organization_modules` (`commerce`) | `arc_resolve_commerce_tenant`, `arc_store_stage` | ARC'ta kopya; ArvoOS lisans ekranı aktarır |
| `auth.users` | personel girişi, müşteri hesapları, sipariş/adres/iade/favori FK'leri | Kullanıcılar aynı kimlik (uuid) ve şifre özetiyle taşınır |
| `private.arvo_is_org_admin` | tedarikçi ve ödeme ayarı korumaları | ARC şemasına kopyalanır |
| Depolar | `arc-product-images`, `organization-assets` (ARC mağazalarının klasörleri) | Dosyalar kopyalanır |
| Zamanlanmış iş | Vercel cron `/api/tedarikci/ice-aktar` | Yalnızca ortam değişkeni |

ArvoOS'un kodu `arc_` tablolarına dokunmuyor; bağımlılık tek yönlü.
Veritabanında `pg_cron` ya da dışarı istek atan tetikleyici yok.

**Kimlikler iki tarafta aynı kalır** (kurum id, kullanıcı id). Eşleştirme
tablosu yok; ArvoLab köprüsüyle aynı ilke (`ArvoOS/lib/arvolab.ts`).

## Aşamalar

### 1. Şema (yeni projeye yalnızca ARC'ın ihtiyacı) — UYGULANDI 18.09.2026
- `scripts/ayrilma/arc-kurulum-uret.sql` eski projenin SQL Editor'ünde
  çalıştırılır (salt okunur), çıkan betik yeni projede çalıştırılır. Betik
  tek işlemde çalışır; hata olursa hiçbir şey yazılmaz.
- Yeni projede doğrulandı: 22 tablo, 57 fonksiyon, 52 politika,
  8 tetikleyici, 2 depo + 8 depo kuralı, RLS kapalı tablo yok; bütün
  fonksiyonlar `check_function_bodies = on` ile yeniden derlendi, hata yok.
- **Geçiş günü betik yeniden üretilip uygulanmalı**: o güne kadar eski
  projeye uygulanan ARC migration'ları yeni projede yok. Sıra: yeni projede
  `public` ve `private` şemalarını boşalt → betiği yeniden üret ve uygula →
  veriyi taşı.
- Yeni proje FREE planda: yedek yok, 500 MB veritabanı / 1 GB depolama
  sınırı, düşük etkinlikte duraklatma. Geçişten önce PRO organizasyona
  taşınmalı.

Önceki plan metni:
- Eski projeden şema dökümü (`pg_dump --schema-only`, public + private).
- Dökümden ARC nesneleri ve yukarıdaki paylaşılan tabloların ARC'ın
  kullandığı sütunları süzülür → `supabase/ayrilma/kurulum.sql`.
- Yeni projede SQL Editor'den uygulanır; PGlite'ta önce sınanır.
- Bundan sonra ARC migration'ları yalnızca yeni projeye uygulanır.

### 2. Köprü (ArvoOS → ARC)
- ArvoOS `lib/arc-bridge.ts`: kurum, `arc` lisansı, `commerce` modülü ve
  ARC mağazası olan kurumların üyelikleri ARC veritabanına yazılır
  (ArvoLab köprüsünün aynısı; ArvoOS erişilemezse ARC son bilinen durumla
  çalışır).
- Yeni personel: ArvoOS'ta üye eklenince ARC'ta aynı uuid ile hesap açılır ve
  şifre belirleme e-postası gider. **Şifreler iki sistemde ayrı yaşar**:
  taşıma anındaki şifre iki tarafta aynıdır, sonrasında birinde değiştirmek
  diğerini değiştirmez.
- Şifre belirleme: ARC'ta `/sifre` (bağlantı gönder) → `/auth/yenile` →
  `/sifre/yeni`. Yeni projede Auth → URL Configuration'a panel alan adları
  (`https://arc.arvo-os.com/**` ve mağazaların panel alan adları) eklenmeli.
- Köprü, taşıma günü öncesinde yayına alınır ve eski veritabanında da
  çalışabilir (hedef adres ortam değişkeninden).

### 3. Veri
- Bakım penceresi: mağazalar `sales_closed` (vitrin açık, satış kapalı);
  PayTR'da bekleyen ödeme kalmadığı doğrulanır.
- `arc_` tablolarının verisi, ilgili kurumlar, üyelikler, lisanslar ve
  ARC'la ilişkili kullanıcılar (`auth.users` + `auth.identities`, şifre
  özetleriyle) taşınır.
- Depo dosyaları kopyalanır.
- Satır sayıları ve tutar toplamları iki tarafta karşılaştırılır.

### 4. Geçiş
- Vercel'de ARC ve ArvoCulture-site ortam değişkenleri yeni projeye çevrilir
  (`NEXT_PUBLIC_SUPABASE_URL`, anahtarlar; vitrinde `ARC_SUPABASE_*` ve
  `NEXT_PUBLIC_SUPABASE_*`). PayTR bildirim adresi değişmez (alan adı aynı).
- Açık oturumlar düşer (JWT anahtarı farklı): personel ve müşteriler bir
  kez yeniden giriş yapar.
- Mağazalar `open`. Eski projedeki `arc_` verisi bir süre salt okunur
  yedek olarak kalır, sonra silinir.

## Sırlar

Bağlantı adresleri ve anahtarlar sohbete ya da depoya yazılmaz. Döküm ve
aktarım komutları kullanıcının terminalinde, ortam değişkenleriyle çalışır.
