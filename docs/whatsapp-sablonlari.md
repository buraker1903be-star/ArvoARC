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

## 2) siparis_hazirlaniyor
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz hazırlanmaya başlandı. Kargoya verildiğinde tekrar bilgilendirileceksiniz.
```

Örnek: Ayşe Yılmaz · AC261017-0042

Sipariş panelde "Hazırlanıyor"a alındığında gider. E-posta bu durumda
bilerek susuyor (ara durum bildirimi müşteriyi sonraki postaları da
görmezden gelmeye alıştırıyor); WhatsApp müşterinin ayrıca onay verdiği
ayrı bir kanal.

---

## 3) siparis_kargolandi
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz kargoya verildi. Takip bilgileri kısa süre içinde sistemde görünür olacak.
```

Örnek: Ayşe Yılmaz · AC261017-0042

Takip numarası GİRİLMEDEN "kargoya verildi" yapıldığında gider. Takip
numarası girilince ayrıca `siparis_kargoda` gidiyor; bu mesaj onun
yerine değil, ondan önce. İkisi birden gitmiyor — takip numarası zaten
girilmişse bu mesaj üretilmiyor.

---

## 4) siparis_kargoda
**Parametreler:** 1 müşteri adı · 2 sipariş numarası · 3 kargo firması · 4 takip numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz {{3}} ile kargoya verildi. Takip numarası: {{4}}. Kargonuzu kargo firmasının sitesinden takip edebilirsiniz.
```

Örnek: Ayşe Yılmaz · AC261017-0042 · Yurtiçi Kargo · 1234567890

---

## 5) siparis_iptal
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişiniz iptal edildi. Ödemeniz alınmışsa tutar en geç on dört gün içinde ödeme yaptığınız yönteme iade edilir.
```

Örnek: Ayşe Yılmaz · AC261017-0042

---

## 6) iade_tamamlandi
**Parametreler:** 1 müşteri adı · 2 sipariş numarası

```
Merhaba {{1}}, {{2}} numaralı siparişinizin iadesi tamamlandı. Tutarın kartınıza yansıma süresi bankanıza bağlıdır.
```

Örnek: Ayşe Yılmaz · AC261017-0042

---

## Hepsinde "Siparişi görüntüle" düğmesi var

Altı şablonun da altında bir URL düğmesi duruyor:

```
Metin : Siparişi görüntüle
Adres : https://arvoculture.com/siparis/{{1}}
```

`{{1}}` siparişin paylaşım anahtarı (`arc_orders.public_token`); kod
`waSiparisBildirimi`'ne `paylasimAnahtari` olarak veriyor, kapı da
şablonun düğme bileşenine yerleştiriyor.

**Neden düğme, neden gövdede değil:** Meta şablon parametrelerinde
satır sonu yasak, yani ürünler mesajın içinde alt alta
listelenemiyor; her yeni bilgi için metni değiştirip yeniden onaya
sokmak da sürdürülebilir değil. Mesaj kısa kalıyor, ayrıntı tek bir
sayfada duruyor.

**Adres kiracıya özel ve bu bilinçli.** Şablonlar kiracının kendi
WhatsApp İşletme Hesabında duruyor, dolayısıyla taban adres de onun
alan adı olabiliyor. Kendi numarasını bağlamamış bir kiracı
eklendiğinde durum değişir: o kurumun mesajı Arvo'nun ortak
numarasından ve Arvo'nun WABA'sındaki şablonla gider, orada taban
adres sabit olmak zorundadır. ArvoOS'ta bunun altyapısı hazır
(`app/b/[tur]/[token]` → kurumun alan adına 307), yalnızca `siparis`
türünün eklenmesi gerekir.

**Kod düğmesiz şablonla ÇALIŞMAZ:** şablonda düğme yokken parametre
göndermek Meta tarafından reddedilir. Şablonu düzenleyip onay
beklerken kodu yayına almayın.

---

# Kurulum: token ArvoARC'a DEĞİL ArvoOS'a giriliyor

ArvoARC Meta'ya doğrudan çağrı yapmıyor; dört ürünün ortak kapısı
ArvoOS'ta (`app/api/bridge/whatsapp`). Numara da ürüne değil **kuruma**
bağlı: ArvoCulture hem ArvoOS hem ArvoARC kullandığı için **tek numara
ikisini birden taşıyor**, şablonlar aynı WhatsApp İşletme Hesabında
yan yana duruyor (ArvoOS'un beşi: `teklif_hazir`, `sozlesme_imza`,
`odeme_baglantisi`, `deneme_suresi_son_gun`, `abonelik_yenileme` —
çakışma yok).

## 1) Numarayı ArvoOS panelinden bağla

**Ayarlar → Entegrasyonlar → WhatsApp**, ilgili kurum seçiliyken üç değer:

| Alan | Meta'da nerede |
|---|---|
| WABA ID | WhatsApp → API Setup, numaranın üstünde |
| Phone number ID | Aynı ekran, "From" numarasının altında |
| Access token | System User ile üretilen kalıcı token |

Panel kaydederken Meta'ya doğrulatıyor ve token'ı şifreli yazıyor
(`whatsapp_accounts.access_token_enc`). **Token sohbete yazılmaz,
Vercel'e de girilmez.**

## 2) ArvoARC'ın kapıya ulaşması

ArvoARC projesinde iki ortam değişkeni:

- `ARVOOS_BRIDGE_URL` = `https://arvo-os.com` — sır değil.
- `PRODUCT_BRIDGE_SECRET` = ArvoOS'taki **aynı** değer — **SIR**.
  Meta token'ı değil ama kapının kapısı: eline geçen biri o kurumun
  numarasından müşterilerine mesaj gönderebilir. Sohbete yazılmaz,
  yalnızca Vercel ortam değişkenine girilir.

İkisi eksikse sipariş akışı normal çalışır, yalnızca WhatsApp mesajı
gitmez ve sebebi sunucu günlüğüne yazılır.

## 3) Şablon onayı

Meta onayı genellikle birkaç dakika–saat. Onaylanmadan gönderim
"Template name does not exist" ile düşer; hata kapının mesaj kaydına
(`whatsapp_messages`) yazılır ve ArvoOS'ta görünür.
