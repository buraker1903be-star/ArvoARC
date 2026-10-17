# Yeni mağaza açılışı

Baştan sona, sırayla. Her adımın kim tarafından yapıldığı yazılı.

---

## 1. Kurum ve lisans — **Arvo (ArvoOS kurucu konsolu)**

1. ArvoOS → Platform → kurumu oluştur
2. Kuruma **ArvoARC lisansı** ver
3. Mağaza sahibini kuruma **owner** olarak ekle

Lisans olmadan panel açılır ama WhatsApp numarası bağlanamaz
(köprü lisansa bakıyor).

---

## 2. Vitrin kararı — **müşteriyle birlikte**

| Seçim | Kime uygun |
|---|---|
| **ArvoARC'ta** | Sitesi olmayan, vitrini bizden isteyen mağaza |
| **Kendi sitesinde** | Sitesini kendi yapan; panelden yalnızca ürün ve sipariş yönetecek |

Seçim ArvoARC → **Ayarlar → Mağaza alan adı → Vitrin nerede?**

---

## 3a. Vitrin ArvoARC'taysa

1. **Ayarlar → Mağaza alan adı** → *ARVO mağaza alt alan adı*: `magazaadi`
2. `magazaadi.shop.arvo-os.com` yayına girer — DNS gerekmez, joker
   kayıt kurulu
3. Kendi alan adı varsa aynı ekrandan yazılır; panel Vercel'e ekler,
   gösterilen DNS kaydı müşterinin sağlayıcısına girilir
4. **Ayarlar → Marka kimliği**: logo, renk, mağaza adı

## 3b. Vitrin müşterideyse

1. **Ayarlar → Mağaza alan adı** → *Vitrin nerede?* → **Kendi sitemde**
2. Sitenin alan adı yazılır (`magaza.com`)
3. Panel bir **TXT jetonu** gösterir; müşteri DNS'ine kökte ya da
   `_arvo` altında ekler
4. **TXT kaydını doğrula** düğmesi
5. Geliştiricisine `docs/vitrin-api.md` verilir

Doğrulama tamamlanmadan sipariş ve veri uçları o siteye açılmaz —
CORS ve mağaza tanıma doğrulanmış alan adına bakıyor.

---

## 4. Satış ayarları — **mağaza sahibi**

1. **Ayarlar → Satış**: kargo ücreti, ücretsiz kargo eşiği, havale indirimi
2. **Ayarlar → Ödeme**: en az bir yöntem açık olmalı
   - Havale: IBAN ve hesap sahibi
   - Kart: PayTR / Garanti / Tami anahtarları
3. **Ayarlar → Marka kimliği**: e-posta gönderen adresi

⚠️ Hiçbir ödeme yöntemi açık değilse müşteri ödeme adımını
tamamlayamaz. Günlük öz denetim bunu her sabah bildiriyor.

---

## 5. Bildirimler — **mağaza sahibi**

1. **Ayarlar → Entegrasyonlar → WhatsApp**: WABA kimliği, numara
   kimliği, erişim anahtarı
2. Meta'da altı şablon oluşturulur (`docs/whatsapp-sablonlari.md`)
3. **Ayarlar → E-posta şablonları**: metinler isteğe göre düzenlenir
   (boş bırakılırsa varsayılan gider)

---

## 6. Katalog — **mağaza sahibi**

1. Ürünler elle ya da içe aktarımla
2. Tedarikçi varsa **Tedarikçiler** bölümünden XML bağlanır
3. **Koleksiyonlar** ile raflar kurulur

---

## 7. Açılış denetimi — **Arvo**

Ertesi sabah günlük öz denetim raporuna bak (ArvoOS bildirim
çekmecesi). Beş ölçüt de sessizse mağaza sağlıklı:

- Ödeme yöntemi var
- Vitrin açılıyor
- Site haritası dolu
- Haritadaki ürün açılıyor
- Tedarikçi taraması koşuyor

Vitrin müşterideyse ilk üç ölçüt onun sitesine bakmaz; o tarafın
izlenmesi müşterinin işidir.

---

## Sık karşılaşılanlar

**"DNS bekleniyor"da takılı kalıyor** — Vitrin kipi yanlış seçilmiş
olabilir. Müşteri sitesini kendi yapıyorsa kip **Kendi sitemde**
olmalı; aksi hâlde panel alan adının bize yönelmesini bekler.

**WhatsApp "no_license"** — kuruma ArvoARC lisansı verilmemiş
(adım 1).

**WhatsApp "forbidden"** — kişi ArvoOS üyeliğinde owner/admin değil.
ArvoARC'taki rol yetmiyor; yetki bilerek iki kademeli.

**Siparişte "Insufficient stock"** — tedarikçi tamponu. Stok eşiğin
altındaysa satılabilir sayılmıyor; eşik Tedarikçiler bölümünde.
