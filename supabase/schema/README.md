# Canlı şema anlık görüntüsü

Bu klasör **migration değildir**. Hiçbir araç buradaki dosyaları uygulamaz.

## Neden var

ARC'ın tablolarının hiçbiri (`arc_orders`, `arc_products`, `arc_store_settings`,
`arc_discounts` …) ve fonksiyonlarının çoğu (`arc_create_order` dahil) depodaki
migration'larda yoktu; yalnızca canlı veritabanında tanımlıydı. Sonuçları:

- Depo veritabanını yeniden kuramıyordu (test ortamı, felaket kurtarma).
- Denetim fonksiyon gövdelerini göremiyordu; tek mağazaya sabitlenmiş sipariş
  fonksiyonu bu yüzden ancak canlı tanım okununca doğrulanabildi.
- Vitrin (ArvoCulture-site) ile ARC arasındaki tutar sapması bu yüzden geç
  fark edildi.

## Hangi veritabanı

19 Eylül 2026'ya kadar ArvoOS ve ARC aynı Supabase projesini kullanıyordu;
`katalog.json` o ortak şemanın görüntüsü. O tarihte ARC kendi projesine
(`obaskcdxaaezjglayash`) taşındı (../../AYRILMA.md). Şema aynı kuruldu, bu
yüzden katalog ARC tabloları için hâlâ doğru. Yeniden üretirken sorguyu
**ARC'ın projesinde** çalıştırın; ArvoOS'un şeması için ArvoOS'un projesinde.

## Nasıl güncellenir

1. Supabase → SQL Editor'de `scripts/sema-disa-aktar.sql` dosyasının tamamını
   çalıştırın. Salt okunurdur, hiçbir şeyi değiştirmez; veri ve sır içermez.
2. Sonucu **Download CSV** ile indirin.
3. `node scripts/sema-kaydet.mjs ~/Downloads/<indirilen>.csv`

Betik CSV kaçışını çözer ve dosyayı bayt bayt yazar; elle kopyalayıp
yapıştırmaya gerek yok. Yazmadan önce çıktıda gömülü anahtar arar (Supabase
gizli anahtarı, JWT, Stripe/Resend anahtarı, özel anahtar); bulursa dosyayı
yazmaz ve satırı gösterir.

Bir migration'ı canlıya uyguladıktan sonra dosyayı yeniden üretin; `git diff`
migration'ın gerçekte ne değiştirdiğini gösterir.

## Katalog ve şema sözleşmesi

`katalog.json` şemanın uygulama kodunu ilgilendiren özetidir: tablo → sütunlar
ve public fonksiyon adları. `scripts/check-schema-usage.mjs` koddaki
`.from("…").select/eq/order/insert/update/upsert` ve `.rpc("…")` ifadelerini
bununla karşılaştırır ve CI'da çalışır (`npm run check:schema`). Aynı betik ve
katalog ArvoOS ve ArvoCulture-site'ta da birebir durur.

Anlık görüntüyü yeniledikten sonra:

```bash
npm run schema:catalog        # canli-sema.sql → katalog.json
cp supabase/schema/katalog.json ../ArvoOS/supabase/schema/
cp supabase/schema/katalog.json ../ArvoCulture-site/supabase/schema/
```

**Geçici durum (18 Eylül 2026):** ilk `katalog.json`, SQL Editor çıktısından
elle çıkarıldı; `canli-sema.sql` henüz depoda değil. Kodun kullandığı bütün
tablo ve sütunlar katalogda bulundu (tek eksik gerçek hataydı), yani kodun
dokunduğu kısım doğrulandı. `canli-sema.sql` kaydedilince katalog ondan
yeniden üretilecek; fark varsa `git diff`'te görünür.

## Doğrulama

Sorgu, ARC'a benzeyen bir örnek şemada (enum, kimlik sütunu, sekans, fonksiyon
çağıran varsayılan / kısıt / politika, görünüm, security definer fonksiyon ve
yetkileri, tetikleyici, RLS) gidiş-dönüş sınandı: çıktı boş bir veritabanında
hatasız çalıştı ve kataloğun on kategorisi kaynakla birebir aynı çıktı.

Kapsam: `public` ve `private` şemaları (politikalar ve tetikleyiciler
private'taki fonksiyonlara dayanıyor). Kapsam dışı: uzantılar, tablo düzeyi
yetkiler (GRANT … ON TABLE), domain ve bileşik tipler, private şemasındaki
tablolar, auth ve storage şemaları. Supabase'e geri
yüklerken bunlar platformdan gelir.
