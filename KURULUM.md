# Müşteri hesapları — ARC tarafı

## HANGİ REPO: C:\ArvoARC

`supabase/migrations/20260907000000_add_customer_accounts.sql`
dosyasını repoya koyun ve Supabase SQL Editor'de çalıştırın.

## Ne yapıyor

**1. Siparişe sahiplik alanı.** `arc_orders` tablosuna `user_id`
eklenir; `auth.users` tablosuna bağlı.

**2. Müşteri okuma politikası.** Müşteri YALNIZCA kendi
siparişlerini okur. Yazma, güncelleme, silme yetkisi yoktur —
sipariş durumunu yalnızca panel ve ödeme servisi değiştirir.
Mevcut personel politikalarına dokunulmaz, yanına eklenir.

**3. Geçmiş siparişleri sahiplenme.** Müşteri misafir olarak
sipariş verip sonra kayıt olabilir. `claim_arvoculture_orders`
fonksiyonu, **doğrulanmış** e-posta adresiyle eşleşen ve henüz bir
hesaba bağlanmamış siparişleri kullanıcıya bağlar.

E-posta istemciden değil `auth.jwt()` içinden okunur ve
doğrulanmamış e-postayla sahiplenme yapılmaz. Aksi hâlde biri
başkasının e-postasını gönderip onun sipariş geçmişini kendi
hesabına bağlayabilirdi.

**4. Sipariş listeleme.** `get_arvoculture_my_orders` giriş yapmış
müşterinin kendi siparişlerini kalemleriyle döndürür.

**5. Otomatik bağlama.** Giriş yapmış müşteri sipariş verirse
sipariş doğrudan hesabına yazılır.

## Supabase panelinde yapılacaklar

**Authentication → Providers → Email:** açık olmalı, "Confirm
email" işaretli olsun. Doğrulama olmadan sipariş sahiplenme
çalışmaz.

**Authentication → URL Configuration:**
- Site URL: `https://arvoculture.com`
- Redirect URLs listesine `https://arvoculture.com/hesap` ekleyin

**Authentication → Email Templates:** şablonlar İngilizce gelir,
Türkçeleştirin. Gönderim alan adını da doğrulamanız önerilir;
varsayılan Supabase adresinden gelen e-postalar spam'e düşebiliyor.

## Google / Facebook girişi

Supabase Auth destekliyor ama her sağlayıcı için OAuth uygulaması
açmanız gerekiyor:

- **Google:** Google Cloud Console → OAuth 2.0 Client ID
- **Facebook:** Meta for Developers → Facebook Login

Aldığınız Client ID ve Secret değerlerini Supabase →
Authentication → Providers altına girersiniz. Sonra bana haber
verin, vitrindeki butonları etkinleştireyim.
