# XML erişimi — tarayıcı kimliği

## HANGİ REPO: ~/Desktop/ArvoARC

`src/lib/supplier/tarzyeri.ts` dosyasını güncelleyin, sonra:

```bash
cd ~/Desktop/ArvoARC
git add -A
git commit -m "XML istegine tarayici kimligi eklendi"
git push
```

## Sorun

Tarzyeri XML yerine bir HTML sayfası döndürdü:

```
readTagExp returned undefined... Context: "<!DOCTYPE html>..."
```

Tarayıcı kimliği (`User-Agent`) olmayan istekleri engelleyen
sunucular böyle davranıyor — genelde bir hata ya da giriş sayfası
döndürüyorlar.

## Çözüm

İstek artık gerçek bir tarayıcı gibi başlık gönderiyor. Ayrıca
gelen yanıt HTML ise erken yakalanıp anlaşılır bir hata veriyor;
öncesinde ayrıştırıcının teknik hatası görünüyordu.

## Yine olmazsa

İki ihtimal kalır:

**1. IP kısıtlaması.** Tarzyeri yalnızca Türkiye'den erişime izin
veriyor olabilir; Vercel fonksiyonu ABD'den (iad1) çıkıyor.

Vercel projesinin `vercel.json` dosyasında `"regions": ["fra1"]`
yazıyor ama bu yalnızca bazı planlarda geçerli. Tarzyeri'ye
sorun: "Sunucumuz Frankfurt'tan bağlanıyor, IP kısıtlamanız var
mı?"

**2. Bağlantı süresi dolmuş olabilir.** Bağlantıyı tarayıcıda
açıp XML geliyor mu kontrol edin:

```
https://www.tarzyeri.com/export/1db1de47-16ba-4a5a-a875-fe3f5691543e
```

Tarayıcıda XML görüyor ama sunucudan gelmiyorsa kesinlikle IP ya
da User-Agent engeli vardır.
