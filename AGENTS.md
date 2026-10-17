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
  Veritabanının saat dilimi de Türkiye (20261016080951): sipariş
  numarası `to_char(now(), …)` ile UTC gününü basıyordu ve 16.10.2026
  02:23'teki sipariş "AC261015-…" oldu. Gün alan SQL yine dilimi açıkça
  yazar (`now() at time zone 'Europe/Istanbul'`) — bağlantı ya da rol
  düzeyindeki bir ayar veritabanı ayarını ezebilir. Kodda gün anahtarı
  `trToday()` (lib/tr-time). `npm run check:saat-dilimi` CI'da ikisini
  de arıyor; bilerek dilimsizse satıra `dilim-tamam: <sebep>` yazılır.
- **"Satılabilir mi" sorusunun tek yanıtı `arc_variant_available`**
  (`stock`, `allow_backorder`, `supplier`). Tedarikçi tamponunu bilen tek
  yer orası; ham `stock > 0 or allow_backorder` ifadesi altı vitrin
  fonksiyonunda duruyordu ve tampon 5 / stok 3 olan varyant koleksiyon
  kartında "Sepete ekle" derken `arc_create_order` aynı varyantı
  reddediyordu — müşteri adresini girdikten sonra "Insufficient stock"
  alıyordu (20261017120705). Yeni bir listede stok koşulu yazmayın,
  bu fonksiyonu çağırın.
- **Sipariş kalemi SKU ile kurulur.** `arc_create_order` SKU bulamazsa
  ürün slug'ına düşüp stokta olan HERHANGİ bir varyantı seçiyor
  (`order by (v.stock > 0) desc`). Yedek yol bilerek duruyor (tek
  varyantlı ürün) ama vitrin tarafı SKU'yu yazmak zorunda; vitrinin
  AGENTS.md'sinde "Sepete her zaman varyant SKU'su yazılır" başlığı
  bunu anlatıyor.
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
- **WhatsApp'a doğrudan çağrı yapılmaz.** Dört ürün de ArvoOS'taki
  ortak kapıdan geçer (`ARVOOS_BRIDGE_URL` + `PRODUCT_BRIDGE_SECRET`
  → ArvoOS `app/api/bridge/whatsapp`); izin verilen ürünler
  listesinde `"arc"` zaten yazılı. Gönderen numara MAĞAZA AYARINDA
  DEĞİL KURUMDA: kurum numarasını ArvoOS panelinden bağlıyor
  (Ayarlar → Entegrasyonlar) ve token orada şifreli duruyor.
  17.10.2026'da burada doğrudan `graph.facebook.com` çağrısı, ArvoARC'a
  ait ikinci bir token ve `arc_whatsapp_messages` adında ikinci bir
  mesaj kütüğü yazılmıştı; ArvoOS'ta aynı işi yapan kapı 21–27 Eylül'den
  beri duruyordu. Bedeli: iki token (sızma yüzeyi iki katı), "mesaj
  gitti mi" sorusunun iki ayrı yanıtı ve GELEN mesajın hiçbir yere
  düşmemesi — kapıdan geçince müşterinin yanıtı ArvoOS'un CRM gelen
  kutusuna düşüyor ve personel 24 saatlik pencerede cevap verebiliyor.
  Yeni bir bildirim eklerken şablonu `lib/whatsapp/sablonlar.ts`'e
  yazın, gönderimi `waSiparisBildirimi` üzerinden yapın.
- **ArvoOS'un veritabanına doğrudan yazılmaz.** Panel bildirimi de
  WhatsApp gibi kapıdan geçer (`lib/arvoos-bildirim.ts` →
  `ARVOOS_BRIDGE_URL/api/bridge/bildirim`, aynı
  `PRODUCT_BRIDGE_SECRET`). Bildirim ikincil iştir: fonksiyon hiçbir
  zaman fırlatmaz — ödeme kesinleşmesi bildirim yazılamadı diye geri
  alınamaz — ama sessiz de kalmaz, başarısızlık günlüğe düşer. Yeni
  bir olay bağlarken TEKRAR ANAHTARI verin ve akışın her dalını
  gözden geçirin: sipariş bildirimi önce yalnızca kartlı ödemeye
  bağlanmıştı, havale siparişi ödeme onayından geçmediği için
  görünmüyordu.
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
- **Sorunlu gönderide müşteriye OTOMATİK bildirim gitmez.** OTO'nun
  `returned`, `lost` ve `failed` durumları `arc_shipments.status` alanında
  `failed` oluyor. Müşteriye kendiliğinden "paketiniz kayboldu" demek,
  durum incelenmeden gitmiş olur ve paket çoğu zaman birkaç gün sonra
  teslim edilir. Uyarı OPERASYONCUYA gidiyor (bildirim çekmecesi +
  sipariş listesinde `?kargo=sorunlu`), müşteri sipariş sayfasında ne
  olduğunu ve ne yapacağını görüyor; haber verme kararı insanın.
  27.09.2026'da bilerek böyle bırakıldı.
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
- **LR fiyatları İKİ YOLDAN geliyor ve ikisi de fiyatı KENDİ YAZMIYOR.**
  Müşteri fiyatı (bizim tavanımız) LR'ın `/cms/<ÜLKE>/<dil>/…` kategori
  sayfalarında GİRİŞSİZ görünüyor: sunucu kendisi tarıyor
  (`lib/lr/*`, `api/cron/lr-fiyatlari`, günde bir). Alış fiyatı yalnızca
  girişli sayfada; orası CAS SSO'nun arkasında ve taklit etmek
  kullanıcının LR ŞİFRESİNİ SAKLAMAYI gerektirirdi, o yüzden bir yer imi
  (`public/fiyat-toplayici.js`) kullanıcının kendi oturumundaki açık
  sayfayı okuyup `/api/fiyat-toplayici`'ye bırakıyor. Her iki yol da
  listeyi `arc_price_collections`'a koyuyor; fiyatı panelde insan
  onaylıyor — LR kalıbı değiştirdiği gün bütün kataloğa yanlış fiyat
  yazmak demek olurdu.
  **Karttaki üç sayıdan yalnızca biri fiyattır** (27.09.2026'da ölçüldü):
  `<del>` indirimden önceki fiyat, `div.hint` içindeki parantezli sayı
  LİTRE fiyatı, geçerli fiyat ise `div.price` içindeki `<span>`. Litre
  fiyatı büyük ambalajlarda üründen düşük çıkıyor; elenmezse ürün onun
  fiyatına satılırdı.
  Sayfa getirme `lib/lr/istek.ts`: yönlendirmeler elle izleniyor ve
  çerez taşınıyor (çerezsiz istek 404 dönüyor), yalnızca `*.lrworld.com`
  adreslerine gidiliyor. Yer imi ucu jetonu doğruluyor
  (`lib/fiyat-toplayici-jeton.ts`: mağaza kimliği + bitiş,
  PAYMENT_CREDENTIALS_KEY'den alan ayrımıyla türetilmiş anahtarla imzalı;
  anahtar yoksa 401). Tablonun INSERT politikası yok, yazma servis
  anahtarıyla. Kuruşa çevirme tarayıcıda DEĞİL `parseMoneyToCents`'te.
  **LR stoksuz ürünü katalogdan düşürüyor**, yani tarama onu hiç
  görmüyor ve fiyatı en son görüldüğü gündeki değerde donuyor. Yanlış
  bir şey yazılmıyor ama sessiz: panel bu yüzden "bu turda görünmeyen
  ürünler"i önceki taramalarla karşılaştırıp söylüyor
  (`gorunmeyenler`). Ölçüt katalogdaki bir işaret değil, ÖNCEKİ
  TARAMALAR: "LR ürünü" diye bir alan yok ve SKU biçiminden tahmin
  etmek (kesme işaretiyle başlayanlar) veri temizlendiği gün sessizce
  yanılırdı.
- **Geri dönüş adresi doğrulanır**: başka bölüme ya da dış adrese
  yönlendirme engellenir, filtre ve sayfa korunur.

## Günlük öz denetim

`/api/cron/oz-denetim` her sabah (TR 07:00) her mağazayı MÜŞTERİNİN
GÖZÜNDEN sınar: vitrin HTTP ile istenir, site haritası indirilir,
oradan RASTGELE bir ürün adresi açılır, ödeme yöntemi ve tedarikçi
taramasının son koşması okunur. Sapma varsa kurum sahibinin ArvoOS
bildirim çekmecesine düşer (mağaza başına tek bildirim, günde bir
kez — tekrar anahtarında Türkiye günü var).

**Neden var:** bu depoda bulunan kusurların çoğu SESSİZDİ. Site
haritası bir saatten uzun süre eski listeyi verdi, koleksiyon rafları
boşaldı, bütün ürün sayfaları 500 verdi, bildirim hiç gitmedi —
hiçbiri hata üretmedi. Veritabanına sorup "her şey yerinde" demek
yetmiyordu: 17.10.2026'da ürün sayfaları 500 verirken veritabanı
gayet sağlamdı.

**Ölçüm rotada, KARAR `lib/oz-denetim.ts`'te** ve saf: eşikleri
değiştirmek ağ isteği gerektirmesin, karar test edilebilsin diye
(`tests/oz-denetim.test.ts`). Yeni bir ölçüt eklerken kendine sor:
bu, MÜŞTERİNİN GÖRECEĞİ bir kusura bağlanıyor mu? "Güzel olurdu"
ölçütleri bilerek yok — her sabah okunmayan bir rapor, hiç olmayan
rapordan kötüdür.

**Bulgu varken de 200 dönülür:** bulgu işin başarısızlığı değil
sonucu. 500 dönmek zamanlayıcı geçmişinde işi "bozuk" gösterir ve
gerçekten bozulduğu gün fark edilmez.

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

**RLS denetimi** (`npm run check:rls`): RLS'i açık ama POLİTİKASI
olmayan bir tabloyu, çağıranın yetkisiyle çalışan bir yerin okuyup
okumadığını arar — invoker fonksiyon ya da panel kodu. Böyle bir okuma
hata vermez, sessizce BOŞ döner ve kural "yok" diye yorumlanır.
17.10.2026'da canlıda tam bu vardı: `organization_modules` politikasız
olduğu için `arc_create_order` ve `arc_adjust_inventory` "Commerce
module is disabled" diyordu — manuel sipariş, elle stok hareketi ve
iade tamamlanınca stoğun geri eklenmesi ölüydü, üstelik sonuncusu
sessizce (hata yalnızca sunucu günlüğüne yazılıyordu). Politikasız ama
hiçbir yerden okunmayan tablo (ArvoOS köprüsünün yazdığı kopyalar)
yalnızca listelenir. Denetimin kendisi `tests/check-rls.test.ts` ile
sabitlendi.

**Kiracı sızıntısı** (`tests/db/kiraci-sizintisi.test.mjs`): vitrin
ailesinin BÜTÜN fonksiyonları iki mağazayla sınanır — A'nın adresinden
yalnızca A'nın verisi gelmeli, B'nin tek satırı bile görünmemeli,
alan adını doğrulamamış mağazanın vitrini hiç açılmamalı. Dosyada bir
ÖLÇÜM PLANI var ve yeni bir `arc_storefront_*` fonksiyonu plana
yazılmazsa test düşer: kapsam insan hafızasına bırakılmıyor. Yetki
düzeyleri de burada kayıtlı — kupon ve sipariş oluşturma yalnızca
`service_role`'a açık (tarayıcıdaki anon anahtarıyla çağrılırsa vitrinin
sunucu tarafındaki stok, kupon sınırı ve tutar denetimleri atlanırdı),
iade talebi `authenticated`'a.

**Kiracı ikizleri** (`npm run check:ikizler`): vitrin fonksiyonlarının
iki ailesi var — çok kiracılı `arc_storefront_*` (adresten mağazayı
çözer) ve ArvoCulture'a özel `get_arvoculture_storefront_*`. Gövdeleri
aynı olmak zorunda; farklı olan yalnızca kiracının nasıl bulunduğu.
Denetim ikisini kiracı çözümü ve yorumlar çıkarılmış hâlde
karşılaştırıyor; ikizi olmayan yeni bir `arc_storefront_*` fonksiyonunu
da bildiriyor (bilinçli istisnalar betikteki listede gerekçesiyle
durur).

Kural 17.10.2026'da üç yerde bozulmuş bulundu: arama dizini ve sitemap
sayfalaması çok kiracılı ailede düzeltilmemişti (`limit 20000` ama
PostgREST 1000'de kesiyor ve `p_offset` yok — ArvoCulture'da aynı hata
müşterinin satın alabildiği ürünü arayıp bulamamasına yol açmıştı),
varyant listesinin sınırı ikizde 200'e çıkarken burada 60'ta kalmıştı.
Hiçbiri o gün canlıyı etkilemiyordu çünkü ikinci kiracı yoktu;
açıldığında etkileyecekti. Bir fonksiyonu değiştirirken ikizini AYNI
migration'da değiştirin.

**Şema sözleşmesi** (`npm run check:schema`): koddaki tablo, sütun ve RPC
adları canlı şemanın kataloğuyla (`supabase/schema/katalog.json`)
karşılaştırılır. **Katalog gecikmesini hatadan ayırır** (16.10.2026): adı
yerel bir migration yaratıyorsa uyarı yazılır ve çıkış kodu 0 kalır (kod
kataloğun ilerisinde, olağan akış — migration SQL Editor'den uygulanıyor,
döküm ve katalog sonra yenileniyor); hiçbir migration yaratmıyorsa hata
verir. Bu ayrım olmadığı için CI üç commit boyunca on dört satırla
kırmızı kaldı (sipariş arşivi, kalem düzenleme, tedarikçi stok işleri
canlıya uygulanmış ama katalog yenilenmemişti) ve kırmızıya alışan göz
on beşinci satırı okumaz. Eşleşme adın geçtiği yere değil onu YARATAN
ifadeye bakar, sütunda tabloya bağlıdır ve migration yorumları
ayıklanır: gevşek bir eşleşme yazım hatasını "gecikme" diye örterse
denetim, denetlediği hatadan farksız olur
(`tests/check-schema-usage.test.ts` iki dalı da sabitliyor). Supabase istemcisi tipsiz olduğu için yanlış sütun adı
derlemede görünmez; üretimde sorgu hata verir ve çoğu yerde hata yakalanıp
boş veri gösterilir (Platform → Ödemeler bu yüzden iki gün "sorun yok"
gösterdi). Yeni sütun/fonksiyon kullanan kodu, migration canlıya uygulanıp
katalog yenilendikten sonra birleştirin.


## Ortam değişkenleri

Tamamı `.env.example` içinde, her biri için eksik olduğunda ne olacağı
yazılı. Sırlar `NEXT_PUBLIC_` ile başlamaz.
