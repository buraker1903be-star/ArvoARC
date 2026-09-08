# HTML varlık listesi genişletildi

## HANGİ REPO: C:\Users\PC\Desktop\Burak\ArvoARC

`src/lib/supplier/tarzyeri.ts`

```powershell
cd C:\Users\PC\Desktop\Burak\ArvoARC
git add -A
git status      # yalnizca tarzyeri.ts
git commit -m "HTML varlik listesi genisletildi"
git push
```

## Neden

Veritabanındaki metinleri SQL ile onardık ama içe aktarma kodu
yalnızca Türkçe karakterleri tanıyordu. Tedarikçi akışında
şunlar da geçiyor:

```
&rsquo; ’    &ldquo; “    &bull; •
&hellip; …   &acirc; â    &eacute; é
&rarr; →     &gt; >       &lt; <
```

Bunlar eklenmezse yeni gelen ürünlerde aynı sorun tekrarlar.

## Durum

Mevcut 3.264 ürünün açıklamaları onarıldı. Kalan 26 kayıtta
`description` alanı zaten boş — sorun değil.
