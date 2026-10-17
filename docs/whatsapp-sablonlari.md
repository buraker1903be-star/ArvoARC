# Meta Business Suite'te oluşturulacak WhatsApp şablonları

WhatsApp Manager → Şablonlar → Şablon oluştur. Her biri için:

- **Kategori:** Utility (İşlem) — Marketing DEĞİL. Sipariş durumu bildirimi
  işlem mesajıdır; Marketing seçilirse hem onay kuralları sertleşir hem
  mesaj başına ücret artar.
- **Dil:** Türkçe
- **Ad:** aşağıdaki adın birebir aynısı (küçük harf, alt çizgi)
- **Gövde:** aşağıdaki metnin birebir aynısı, `{{1}}` yerlerine dokunmadan

Ad ya da parametre sırası değişirse mesaj gitmez ya da yanlış gider;
koddaki kayıt (src/lib/whatsapp/sablonlar.ts) bu dosyanın aynası ve
testle sabitlenmiş.

---

## 1) siparis_alindi
**Parametreler:** 1 müşteri adı · 2 sipariş numarası · 3 tutar

```
Merhaba {{1}}, {{2}} numaralı siparişiniz alındı. Tutar: {{3}}. Siparişiniz hazırlanmaya başladığında tekrar bilgilendirileceksiniz.
```

Örnek değerler (Meta örnek isterse): Ayşe Yılmaz · AC261017-0042 · 1.249,90 TL

---

## 2) siparis_kargoda
**Parametreler:** 1 müşteri adı · 2 sipariş numarası · 3 kargo firması · 4 takip numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz kargoya verildi. {{3}} · takip numarası: {{4}}
```

Örnek: Ayşe Yılmaz · AC261017-0042 · Yurtiçi Kargo · 1234567890

---

## 3) siparis_iptal
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz iptal edildi. Ödemeniz alınmışsa tutar en geç on dört gün içinde ödeme yaptığınız yönteme iade edilir.
```

Örnek: Ayşe Yılmaz · AC261017-0042

---

## 4) iade_tamamlandi
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişinizin iadesi tamamlandı. Tutarın kartınıza yansıma süresi bankanıza bağlıdır.
```

Örnek: Ayşe Yılmaz · AC261017-0042

---

# Bana iletmen gerekenler

1. **Telefon numarası kimliği** (WhatsApp Manager → API Kurulumu → "Phone number ID").
   Sır değil; sohbete yazabilirsin, mağaza ayarına işlerim.

2. **Kalıcı erişim token'ı** — SIR. Sohbete YAZMA. Vercel → ArvoARC projesi →
   Settings → Environment Variables:
   - Ad: `WHATSAPP_ACCESS_TOKEN`
   - Değer: token
   - Ortam: Production (ve istersen Preview)
   Ekledikten sonra yeniden dağıtım gerekiyor; "ekledim" demen yeterli.

3. Şablonlar **onaylandı** mı? Meta onayı genellikle birkaç dakika–saat.
   Onaylanmadan gönderim "Template name does not exist" ile düşer ve bu
   gönderim günlüğünde görünür.
