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
- **İade tamamlanınca stok geri eklenir, ama kararı operasyoncu verir.**
  İade akışı stoğa hiç dokunmuyordu: müşteri ürünü geri gönderiyor,
  para iade ediliyor, sistem ürünü hâlâ satılmış sayıyordu — oysa
  sipariş iptalinde stok geri veriliyor (aynı fiziksel olay, iki farklı
  sonuç). Geri gelen ürün hasarlı olabileceği için ekranda onay kutusu
  var; hareket `return` türünde ve `reference_type='return_request'`
  ile kütüğe yazılır. Stok hatası para iadesini geçersiz saymaz.
- **Kısmi iade siparişi kapatmaz.** Sipariş akışta ilerlemeye devam eder;
  yalnızca iade toplamı sipariş tutarına ulaşınca kapanır. Kargo çıkmadıysa
  kargo bedeli de iadeye girer, çıktıysa girmez. Tahsil edilenden fazlası
  iade edilemez.
- **Vitrin (ArvoCulture-site) ArvoARC'ın hesabını aynalar.** Sipariş
  fonksiyonunda ya da `api/storefront/odeme`'de kargo, kupon veya havale
  kuralı değişirse vitrindeki `src/lib/order-quote.ts` ve testi aynı gün
  güncellenmeli; kural değişikliği tek başına yapılınca müşteri ödemede ArvoARC'ın
  tahsil ettiğinden farklı tutar görür (17 Eylül 2026'da oldu). Vitrinin
  okuduğu ayarlar `get_arvoculture_storefront_settings` ile açılır; bu
  fonksiyonun döndürdüğü alanlar vitrinin sözleşmesidir.
- **E-postaya giren her kullanıcı metni HTML'e kaçışla girer** (müşteri adı,
  not, adres).
- **Panel kenar çubuğu HER İKİ TEMADA DA KOYU.** `--sidebar-from` ve
  `--sidebar-to` açık temada da koyu lacivert. Oradaki metinler bu yüzden
  tema belirteci (`--muted`, `--ink`) değil, sabit açık palet değeri
  (`--n-100`, `--n-400`) kullanır; belirteç açık temada koyulaşır ve
  koyu zeminde okunmaz. 27.09.2026'da bölüm başlıkları (`SATIŞ`,
  `KATALOG`…) bu yüzden 3,2:1'deydi ve ilk düzeltme `--muted` dediği
  için yalnızca koyu temayı kurtardı. Ham palet değeri burada hata
  değil, doğru olanı.
- **OTO çağrısının hatası yutulmaz.** 27.09.2026'da üç ayrı yerde boş
  `catch` vardı (konum listesi, etiket bilgisi, firma listesi) ve üçü de
  boş liste dönüyordu. Sonuç: kullanıcının OTO panelinde dört gönderici
  konumu varken ayar ekranı "konum tanımlı değil" diyordu, gönderiler
  kayıtlı konum olmadan oluştu, OTO siparişi açıp gönderiyi ve etiketi
  üretmedi ve sebep hiçbir ekranda görünmedi. Hata mesajı durum koduyla
  birlikte gösterilir; 401 ile 403 ayrı şeylerdir ve HTTP 200 +
  `success:false` üçüncü bir durumdur.
- **Panelde iptal edilen OTO gönderisi OTO'da da iptal edilir.** Önce
  yalnızca `arc_shipments.status` işaretleniyordu ve gönderi OTO'da
  canlı kalıyordu: kurye alıma gelebiliyor, tedarikçi etiketi
  yapıştırıp gönderebiliyor, harcanan bakiye geri gelmiyordu. OTO iptal
  etmezse BİZİM kayıt da iptal edilmez — tersi, panelin "iptal" dediği
  bir paketin yola çıkması demek. Taslak ve `source=manual` kayıtlar
  OTO'ya hiç dokunmadığı için yalnızca yerel iptal edilir.
- **OTO gönderisi kayıtlı bir GÖNDERİCİ KONUMU ister.** `senderInformation`
  ile adresi tek tek yazmak siparişi açıyor ama gönderiyi açmıyor; etiket
  hiç üretilmiyor. Ayrıca `createOrder` içindeki `createShipment:true`
  bayrağı yoksayılıyor — gönderi ayrı `createShipment` çağrısıyla
  (`orderId` + `deliveryOptionId`) açılır.
- **İşlem sonucu adreste taşınmaz.** Mesaj `?error=`/`?saved=` ile
  gidince dışarıdan gönderilen bir bağlantı, kullanıcıya sistemin
  ürettiği gibi görünen uydurma bir mesaj gösterebiliyordu; sayfalar
  tanımadıkları kodu `ERRORS[kod] ?? kod` ile olduğu gibi basıyordu ve
  şifre sıfırlama ekranı `?neden=` değerini doğrudan yazdırıyordu
  (27.09.2026). Sonuç kısa ömürlü, tek kullanımlık bir çerezle taşınır
  (`lib/panel-bildirim.ts`), metni işlem çözer, sayfa yalnızca yazılanı
  gösterir. Sayı ve sipariş numarası gibi değerler de mesajın içine
  girer, adrese değil. `tests/panel-bildirim.test.ts` kalıbın geri
  gelmesini engeller.
- **Geri dönüş adresi doğrulanır**: başka bölüme ya da dış adrese
  yönlendirme engellenir, filtre ve sayfa korunur.

## Migration

Yeni dosyayı **`npm run db:new -- <ad>`** ile açın; sürümü son migration'ın
ardına kendisi yerleştirir. `npm run check:migrations` CI'da çalışır.
Migration'lar SQL Editor'den elle uygulanır ve **yalnızca ArvoARC'ın kendi
projesine** (`obaskcdxaaezjglayash`): 19 Eylül 2026'da ArvoOS'la paylaşılan
projeden ayrıldık (AYRILMA.md). Eski projedeki `arc_*` tabloları yedektir.
`organizations`, `organization_memberships`, `organization_product_licenses`,
`organization_modules` burada ArvoOS'un kopyasıdır; onları ArvoOS köprüsü
yazar, ArvoARC kodu yazmaz. Bağlı proje: `/api/saglik`.

**Her yeni fonksiyonun ardından `revoke all on function … from public, anon,
authenticated;` yazın**, sonra yalnızca gereken role `grant` verin: sunucunun
çağırdığı fonksiyon `service_role`'e, panelin çağırdığı `authenticated`'a,
vitrinin okuduğu `anon`'a. Postgres yeni fonksiyonu PUBLIC'e (anon dahil)
açık oluşturur ve bu, şema düzeyindeki varsayılan yetki ayarıyla
kapatılamıyor; 20260919114636 yalnızca Supabase'in ayrıca eklediği anon ve
authenticated yetkisini kaldırdı. Taşınırken revoke satırları kaybolduğu için
siparişi "ödendi" yapan fonksiyon birkaç saat vitrinin herkese açık
anahtarına açık kaldı (19.09.2026).

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

`tests/db/` (`npm run test:db`) canlı şema dökümünü (`supabase/schema/canli-sema.sql`)
ve dökümden sonraki migration'ları PGlite'a kurar; kuralları Supabase
rolleriyle (anon, authenticated, service_role) doğrudan veritabanına gelen
isteklerle sınar. Döküm yenilendiğinde `tests/db/ortam.mjs` içindeki
`ILK_UYGULANAN` sürümünü ileri alın.

**`tests/db/yetki.test.mjs` hangi fonksiyonun kime açık olduğunu sabitler.**
Yeni fonksiyonu oraya bilerek ekleyin; liste değişmeden test kırılır. Postgres
yeni fonksiyonu PUBLIC'e açık oluşturur ve Supabase varsayılanı anon'a da
EXECUTE verir — bu yüzden her fonksiyonun ardından `revoke all on function …
from public, anon, authenticated;` yazılır (19.09.2026: siparişi "ödendi"
yapan fonksiyon herkese açık kalmıştı).

## Kontroller

`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:db` — dördü de CI'da
(`.github/workflows/ci.yml`) çalışır. Derleme CI'da yapılmaz, Vercel tarafında.

**Şema sözleşmesi** (`npm run check:schema`): koddaki tablo, sütun ve RPC
adları canlı şemanın kataloğuyla (`supabase/schema/katalog.json`)
karşılaştırılır. Supabase istemcisi tipsiz olduğu için yanlış sütun adı
derlemede görünmez; üretimde sorgu hata verir ve çoğu yerde hata yakalanıp
boş veri gösterilir (Platform → Ödemeler bu yüzden iki gün "sorun yok"
gösterdi). Yeni sütun/fonksiyon kullanan kodu, migration canlıya uygulanıp
katalog yenilendikten sonra birleştirin.


## Ortam değişkenleri

Tamamı `.env.example` içinde, her biri için eksik olduğunda ne olacağı
yazılı. Sırlar `NEXT_PUBLIC_` ile başlamaz.
