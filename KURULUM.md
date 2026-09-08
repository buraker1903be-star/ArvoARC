# Ürün özellikleri — okunabilir tablo

## 1) ARC — migration

`20260911001000_expose_product_specs.sql` dosyasını Supabase SQL
Editor'de çalıştırın. Vitrin RPC'lerine `specs` ve `size_guide`
sütunları ekleniyor.

## 2) ARC — kod

İki dosya:

```
src/lib/supplier/tarzyeri.ts
src/app/api/tedarikci/ice-aktar/route.ts
```

```powershell
cd C:\Users\PC\Desktop\Burak\ArvoARC
git add -A
git status
git commit -m "Urun ozellikleri yapilandiriliyor"
git push
```

## 3) Vitrin

`arvoculture-ozellikler.zip` paketini uygulayın.

## Ne yapıyor

Tedarikçi açıklamaları iki HTML tablosu içeriyor: ürün
özellikleri ve beden tablosu. Düzleştirilince "Cinsiyet Kadın
Kumaş İki iplik penye Sezon Kış..." gibi okunmaz tek paragraf
çıkıyordu.

Artık tablolar ayrıştırılıp etiket/değer çiftleri olarak
saklanıyor. Ürün sayfasında iki yeni akordeon var:

**Ürün özellikleri** — Cinsiyet, Kumaş, Sezon, Renk, Desen…
**Beden tablosu** — S Beden 50–59 kg için uygundur…

Serbest metin (ürün hikâyesi) açıklama bölümünde kalıyor.

## Mevcut ürünler

Yeni yapı yalnızca **yeni içe aktarılan** ürünlerde oluşur.
3.264 mevcut üründe özellik tabloları yok; açıklamaları düz metin
olarak kalır (ama Türkçe karakterleri düzeltildi, okunabilir).

Tamamını yapılandırmak isterseniz tedarikçi ürünlerini silip
yeniden aktarmanız gerekir — panelde yaptığınız düzenlemeler
gider. Acele değilse yeni gelen ürünlerde doğru çalışsın, mevcut
katalog böyle kalsın diyebiliriz.
