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

## Aynı veritabanı: ArvoOS + ARC

ArvoOS (`crm_*`, `hr_*`, `organizations`, `organization_memberships` …) ve ARC
(`arc_*`) **aynı Supabase projesini** kullanıyor. Bu anlık görüntü ikisini de
kapsar; ArvoOS'un deposunda eksik olan tablolar da (`crm_contracts`,
`crm_proposals`, `hr_employees` …) burada.

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
