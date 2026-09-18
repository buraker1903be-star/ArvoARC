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

## Nasıl güncellenir

1. Supabase → SQL Editor'de `scripts/sema-disa-aktar.sql` dosyasının tamamını
   çalıştırın. Salt okunurdur, hiçbir şeyi değiştirmez; veri ve sır içermez
   (yalnızca yapı: tipler, sekanslar, tablolar, varsayılanlar, kısıtlar,
   indeksler, görünümler, RLS, politikalar, fonksiyonlar, fonksiyon yetkileri,
   tetikleyiciler).
2. Tek hücre döner. Kopyalayıp `supabase/schema/canli-sema.sql` dosyasına
   yapıştırın ve commit edin.

Bir migration'ı canlıya uyguladıktan sonra bu dosyayı da yeniden üretin; fark
(`git diff`) migration'ın gerçekte ne değiştirdiğini gösterir.

## Doğrulama

Sorgu, ARC'a benzeyen bir örnek şemada (enum, kimlik sütunu, sekans, fonksiyon
çağıran varsayılan / kısıt / politika, görünüm, security definer fonksiyon ve
yetkileri, tetikleyici, RLS) gidiş-dönüş sınandı: çıktı boş bir veritabanında
hatasız çalıştı ve kataloğun on kategorisi kaynakla birebir aynı çıktı.

Kapsam dışı: uzantılar, tablo düzeyi yetkiler (GRANT … ON TABLE), domain ve
bileşik tipler, `public` dışındaki şemalar (auth, storage). Supabase'e geri
yüklerken bunlar platformdan gelir.
