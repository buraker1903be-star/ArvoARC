/*
  TÜRKÇE ARAMA EŞLEŞTİRMESİ.

  Komut paletinde ve ileride benzer yerlerde kullanılan sadeleştirme.
  Türkçe'de büyük/küçük dönüşümü tek başına yetmiyor:

    "Indirim" yazan kullanıcı "İndirimler"i bulamıyordu. toLowerCase
    İngilizce'de I → i verir, Türkçe'de İ → i ve I → ı; iki farklı harf
    üretildiği için kullanıcının klavyeden yazdığı "I" ile menüdeki "İ"
    hiç karşılaşmıyor.

  Çözüm: küçültmeyi Türkçe yerelle yapıp ardından i/ı'yı TEK harfe
  indirmek. Aynı şey ş/s, ğ/g, ü/u, ö/o, ç/c için de geçerli — panelde
  "urunler" yazan biri "Ürünler"i bulmalı.

  Bu dosya saf; testi tests/tr-arama.test.ts.
*/

export function aramaIcinSadelestir(metin: string): string {
  return String(metin ?? "")
    .toLocaleLowerCase("tr-TR")
    /* i̇ (birleşik nokta) küçültmeden sonra oluşabiliyor; ı ile aynı hâneye iniyor. */
    .replace(/[ıi̇]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/** Aranan metin, hedefin içinde geçiyor mu? İki taraf da sadeleştiriliyor. */
export const aramaEsliyor = (hedef: string, aranan: string): boolean =>
  aramaIcinSadelestir(hedef).includes(aramaIcinSadelestir(aranan));
