# ARC deposu onarımı

## Ne oldu

Yerel klasörünüz eksikti — `package.json`, `next.config.ts`,
`tsconfig.json` gibi kök dosyalar yoktu. `npm install
fast-xml-parser` komutu sıfırdan minik bir `package.json`
oluşturdu ve o push edildi.

Şu an depodaki `package.json` sadece şunu içeriyor:

```json
{ "dependencies": { "fast-xml-parser": "^5.11.1" } }
```

Next.js, React, Supabase — hepsi kayıp. Bu yüzden derleme
yapılamıyor.

## Onarım

Bu paketteki dört dosyayı `C:\Users\PC\Desktop\Burak\ArvoARC`
klasörüne kopyalayın (üzerine yazın):

```
package.json
next.config.ts
next-env.d.ts
eslint.config.mjs
```

`package.json` ilk commit'teki hâline `fast-xml-parser` eklenmiş
sürümüdür.

Sonra:

```powershell
cd C:\Users\PC\Desktop\Burak\ArvoARC
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
git add -A
git commit -m "Eksik kok dosyalari geri getirildi"
git push
```

`npm install` birkaç dakika sürer ve doğru `package-lock.json`
üretir.

## Sonra doğrulayın

Vercel'de derleme **Ready** olmalı. Sonra:

```powershell
curl.exe "https://arc.arvo-os.com/api/tedarikci/ice-aktar"
```

`{"error":"yetkisiz"}` görmelisiniz.

## Bu bilgisayardaki klasör hakkında

Yerel kopyanız eksik dosyalarla başlamış. Karışıklık sürerse
temiz bir kopya almak en güvenlisi:

```powershell
cd C:\Users\PC\Desktop\Burak
Rename-Item ArvoARC ArvoARC-eski
git clone https://github.com/buraker1903be-star/ArvoARC.git
cd ArvoARC
npm install
```

Bu, depodaki hâli birebir indirir.
