/*
  ARAMA METNİNİ SADELEŞTİRME (16.10.2026).

  Seçicinin araması Türkçe küçük harfle karşılaştırıyordu
  (`toLocaleLowerCase("tr-TR")`) ve CANLIDA HİÇBİR ŞEY BULAMADI:
  "LR ALOE VIA Baby" Türkçe kuralla "lr aloe vıa baby" oluyor —
  büyük I'nın küçüğü NOKTASIZ ı. Kullanıcı "aloe via baby" yazınca
  (noktalı i) iki metin tutmuyordu. Bu kutuda yazılan şey bir
  Türkçe sözcük değil, bir ARAMA: i/ı ayrımını da, şapkalı harfleri
  de yok sayması gerekir ("sampuan" → "şampuan", "urun" → "ürün").

  Karşılaştırmanın iki yanı da buradan geçer.
*/
const KATLAMA: Record<string, string> = {
  ı: "i", i: "i", İ: "i", I: "i",
  ş: "s", Ş: "s",
  ğ: "g", Ğ: "g",
  ü: "u", Ü: "u",
  ö: "o", Ö: "o",
  ç: "c", Ç: "c",
  â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function aramaSadesi(metin: string): string {
  return metin.replace(/[ıiİIşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (harf) => KATLAMA[harf]).toLowerCase();
}
