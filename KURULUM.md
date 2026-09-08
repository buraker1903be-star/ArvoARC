# Açıklama metni ve kategori düzeltmesi

## 1) ARC — `src/lib/supplier/tarzyeri.ts`

```powershell
cd C:\Users\PC\Desktop\Burak\ArvoARC
# dosyayi kopyalayin
git add -A
git status      # yalnizca tarzyeri.ts
git commit -m "HTML varliklari cozuluyor"
git push
```

### Sorun

Açıklamalar `&Uuml;R&Uuml;N &Ouml;ZELLİKLERİ` biçiminde
geliyordu. Tedarikçi HTML varlıkları kullanıyor; XML
ayrıştırıcısı bunları çözmüyor çünkü değerler CDATA içinde.

### Çözüm

Türkçe karakterler (Ü, Ö, Ç, İ, Ş, Ğ) ve yaygın işaretler
çözülüyor. Sayısal varlıklar (`&#199;`, `&#x00C7;`) da
destekleniyor.

### Sonra

Açıklamaların düzelmesi için ürünlerin yeniden yazılması gerekir.
Ama mevcut ürünlerde ad ve açıklama artık korunuyor (görsel
koruması için) — bu yüzden tam aktarım onları güncellemez.

İki seçenek:

**A) Tedarikçi ürünlerini silip yeniden aktarın.** Temiz sonuç
ama panelde yaptığınız düzenlemeler gider.

```sql
delete from arc_product_variants where supplier = 'tarzyeri';
delete from arc_products where supplier = 'tarzyeri';
update arc_suppliers set sync_cursor = 0 where code = 'tarzyeri';
```

**B) Mevcut açıklamaları SQL ile düzeltin.** Görseller ve
düzenlemeler korunur. Bunu isterseniz sorguyu yazarım.

Ben B'yi öneriyorum — 3.264 ürünü yeniden aktarmak yerine
metinleri yerinde onarmak daha az riskli.

## 2) Vitrin — kategori

`arvoculture-metin.zip` paketinde. Eşofman, ceket, pantolon,
hırka gibi ürünler "Kişisel Bakım" olarak sınıflanıyordu; giyim
anahtar kelimeleri genişletildi.
