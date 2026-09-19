# ARC'ın kendi veritabanına taşınması

> **GEÇİŞ TAMAMLANDI — 19.09.2026.** ARC ve ArvoCulture vitrini
> `obaskcdxaaezjglayash` projesinde çalışıyor (`/api/saglik` gösterir).
> ARC migration'ları artık YALNIZCA bu projeye uygulanır. Eski ortak projedeki
> `arc_` tabloları salt okunur yedek olarak duruyor; bir süre sonra silinecek.
>
> Geçişte çıkan ve düzeltilen sorunlar:
> - Yeni tip secret anahtar yalnızca oluşturulduğu an tam gösteriliyor;
>   uygulama içi tarayıcıda kopyala düğmesi çalışmıyor → kendi tarayıcıda
>   oluşturup o an kopyalamak gerekiyor.
> - `session_replication_role` fonksiyon içinden verilemiyor → tablo bazında
>   `disable trigger user`.
> - Paylaşılan `organization_memberships` politikasız kurulmuştu; personel
>   her şeyi boş görüyordu → `20260919083313_uyelik_okuma_kurali.sql`.
> - Sahip hesabı `b.erdogan@arvoculture.com`; varsayılan Supabase e-postası
>   yalnızca proje ekibine gidiyor → şifre SQL'le belirlendi. Personel
>   e-postaları için Resend SMTP ayarlanmalı.
>
> Resend SMTP KURULDU (19.09.2026): gönderen `ARVO ARC <no-reply@arvo-os.com>`,
> smtp.resend.com:465, Resend anahtarı `supabase-arc-smtp` (yalnızca gönderim,
> arvo-os.com). İlk e-posta istenmeyene düştü → `arvo-os.com` için DMARC TXT
> kaydı eklenecek (`_dmarc` = `v=DMARC1; p=none; rua=mailto:…`).
>
> Kalan: geçici `arc-aktarim` anahtarlarını sil (iki proje), `04c-temizlik.sql`,
> DMARC kaydı, eski `arc_` tablolarının silinmesi (bir süre sonra), kullanılmayan
> `cernfbgdzkjmefqdeiub` projesi.

Karar (18 Eylül 2026): ARC, ArvoOS ile paylaştığı Supabase projesinden
(`oahshpkgdzrraqdzjqau`) kendi projesine (`obaskcdxaaezjglayash`, ArvoOS PRO organizasyonunda) taşınıyor.
İlk açılan `cernfbgdzkjmefqdeiub` (ücretsiz plan, ayrı organizasyon) KULLANILMIYOR;
silinebilir.
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

### 1. Şema (yeni projeye yalnızca ARC'ın ihtiyacı) — UYGULANDI 19.09.2026 (obaskcdxaaezjglayash)
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
- Proje ArvoOS'un PRO organizasyonunda (yedek var, duraklatma yok).

Önceki plan metni:
- Eski projeden şema dökümü (`pg_dump --schema-only`, public + private).
- Dökümden ARC nesneleri ve yukarıdaki paylaşılan tabloların ARC'ın
  kullandığı sütunları süzülür → `supabase/ayrilma/kurulum.sql`.
- Yeni projede SQL Editor'den uygulanır; PGlite'ta önce sınanır.
- Bundan sonra ARC migration'ları yalnızca yeni projeye uygulanır.

### 2. Köprü (ArvoOS → ARC) — ÇALIŞIYOR 19.09.2026
- ArvoOS Vercel'de `ARC_SUPABASE_URL`, `ARC_SUPABASE_SECRET_KEY`, `CRON_SECRET`
  tanımlı; 04:30 eşitlemesi kurum, lisans, modül, sahibin hesabı ve
  üyeliğini yeni projeye yazdı. `arc_store_stage(arvoculture)` = `open`.
- Durum: ArvoOS Platform ana sayfası (köprü kapalı / bağlanamıyor / bağlı).
  Lisans kaydı aktarım hatasını gösterir. İlk denemede anahtar başka
  projeden kopyalanmıştı (iki proje de "ArvoARC" adında) → 401.

Önceki plan metni:
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

### Giriş ayarları — KISMEN UYGULANDI 19.09.2026
- Site URL `https://arc.arvo-os.com` olmalı — obaskcdxaaezjglayash'ta
  HENÜZ `http://localhost:3000` (kullanıcı girecek). Yönlendirme izinleri (girildi):
  `https://arc.arvo-os.com/**`, `https://*.arvo-os.com/**`,
  `https://app.arvoculture.com/**`, `https://arvoculture.com/**`,
  `https://www.arvoculture.com/**`.
- Kayıt ayarları eski projeyle aynı (kayıt açık, e-posta doğrulama açık,
  yalnızca e-posta sağlayıcısı).
- Özel SMTP iki projede de KAPALI: Supabase'in varsayılan e-postası yalnızca
  proje ekibine gider. ARC'ın şifre belirleme e-postaları personele
  ulaşmaz; yeni projede Authentication → Emails → SMTP'ye Resend bilgisi
  girilmeli (sır: kullanıcı girer).

### Veri ölçümü (19.09.2026)
- ~3.400 ürün, ~15.700 varyant (tablolar ~32 MB), 29 sipariş, 3 kurum.
- auth.users: toplam 11; ARC'la bağlantılı (üyelik, sipariş, adres) 2.
  Geçişte taşınacak kullanıcılar: ARC kurumlarının üyeleri + siparişi,
  adresi, favorisi ya da iadesi olanlar + vitrin müşterisi olarak kayıtlı
  olanlar.
- Görseller yol olarak saklanıyor (`metadata.image_paths`), tam adres
  değil; adres çalışma anında projenin URL'sinden kuruluyor. Geçişte
  `arc-product-images` (418 dosya, 221 MB) ve `organization-assets`
  (4 dosya) KOPYALANMALI; aksi halde görseller kırılır.
- Veri yüklenirken tetikleyiciler kapatılmalı
  (`set session_replication_role = replica`): stok, kupon sayacı ve sipariş
  olayı tetikleyicileri bir kez daha çalışmasın.

### 3. Veri — PROVA YAPILDI 19.09.2026
- Yöntem: eski projenin SQL Editor'ünde tablo tablo `json_agg` ile okunur,
  tarayıcının IndexedDB'sinde bekletilir, yeni projede
  `json_populate_recordset` ile `session_replication_role = replica`
  altında (tetikleyiciler kapalı) yazılır. Veri sohbetten geçmez.
- SQL Editor'ün sorgu sınırı ~1 MB: yükleme parçaları en çok 600 KB.
- Hesap seçimi: ARC kurumlarının üyeleri + ARC'ta verisi olanlar + ARC
  kayıtlarında "oluşturan" olarak geçenler + hiçbir kuruma üye olmayan ve
  ArvoOS davet/çalışan izi taşımayan (vitrin müşterisi) hesaplar. Şifre
  özetleriyle; köprünün açtığı şifresiz hesap üzerine yazılır.
- Sonuç: 16 tablonun sayıları birebir (3.442 ürün, 15.740 varyant, 6.915
  koleksiyon eşleşmesi, 36 sipariş, 63 kalem…), 6 hesap / 6 kimlik; kopuk
  yabancı anahtar yok; vitrin fonksiyonları 3.429 ürün, aynı kargo/havale
  ayarları, kademe `open`.
- **Gerçek geçişte** tablolar boşaltılamıyor (silme işlemi otomasyonda
  engelli): yükleme `on conflict (pk) do update` ile yapılmalı. Eski
  tarafta prova sonrası silinen satırlar (nadiren) elle temizlenir.

### Görseller — PROVA YAPILDI 19.09.2026
- 420 dosya (418 ürün görseli, 2 mağaza/tema), 221,5 MB; hata yok, eksik
  yok. Anahtar panodan okunuyor: terminale yapıştırmada iki kez 15 karaktere
  kısaldı. Gerçek geçişte betik yeniden çalıştırılır (üzerine yazar; aradaki
  yeni görseller de gelir).
- `node scripts/ayrilma/03-gorselleri-kopyala.mjs` (ArvoARC klasöründe):
  yeni veritabanındaki yollardan listeyi çıkarır, eski projenin herkese açık
  adresinden indirir, yeni projeye secret anahtarla yükler. Anahtarı gizli
  sorar. Tarayıcıdan anonim yüklemeye geçici kural açmak güvenlik gerekçesiyle
  reddedildi; bu yol hiçbir kuralı gevşetmez.
- `arc_store_themes.config` logo/favicon/tema görseli için eski projenin TAM
  adresini saklıyor (`*_url`). Geçişte bu adresler yeni projeye çevrilmeli:
  `oahshpkgdzrraqdzjqau.supabase.co` → `obaskcdxaaezjglayash.supabase.co`.

Önceki plan metni:
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

## Son aktarım provası — BAŞARILI 19.09.2026 07:30 UTC
`04-son-aktarim.mjs` iki dakikada: 6 hesap / 6 kimlik (şifre özetleriyle),
18 tablonun hepsinde eski = yeni, 2 tema adresi yeni projeye çevrildi, 420
görsel (221,5 MB). İlk denemede `session_replication_role` Supabase'de
fonksiyon içinden reddedildi; tablo bazında `disable trigger user` ile
çözüldü (yabancı anahtarlar açık, silmeler ters sırada).

## Geçiş günü (adım adım)

Önkoşul (bir kez, SQL Editor'den):
- YENİ projede `scripts/ayrilma/04a-yeni-proje-fonksiyonlari.sql`
- ESKİ projede `scripts/ayrilma/04b-eski-proje-fonksiyonu.sql` (salt okunur)

1. ArvoOS → Platform → Lisanslar: ArvoCulture'ın ARC lisansını
   **askıya al** (vitrin açık, satış kapalı; kademe `sales_closed`).
2. `node scripts/ayrilma/04-son-aktarim.mjs` (ArvoARC klasöründe): iki secret
   anahtarı panodan sırayla okur; hesaplar → 18 tablo → görseller; sonunda
   sayıları karşılaştırır. Tekrar çalıştırılabilir.
3. Vercel **ArvoARC** projesi: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → yeni
   proje. Vercel **ArvoCulture** projesi: `ARC_SUPABASE_URL`,
   `ARC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → yeni proje. İkisini yeniden dağıt.
4. Kontrol: ARC girişi, ürün listesi ve görseller, vitrin ürün sayfası,
   sepet (ödeme yapmadan).
5. Lisansı yeniden **aktif** yap (köprü yeni projeye de yazar).
6. `04c-temizlik.sql`: yardımcı fonksiyonları iki projeden kaldır.

Yardımcı fonksiyonlar PGlite'ta sınandı (varsa güncelle, tetikleyici kapalı,
bileşik anahtar, silme eşitlemesi, hesap/kimlik değişimi, arc_ dışı red; seçim
kuralı). Supabase'de `session_replication_role` yetkisi provada görülecek.
