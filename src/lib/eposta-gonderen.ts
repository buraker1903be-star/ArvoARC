/*
  E-POSTA GÖNDEREN KİMLİĞİ — mağazası kendi adresini doğrulatana kadar.

  TEKNİK KISIT. Bir alan adından e-posta atabilmek için o alan adının
  Resend'de doğrulanmış olması gerekiyor (DNS kaydı). Yeni bir salon
  kendi adresinden ancak doğrulamayı tamamladıktan sonra gönderebilir;
  o güne kadar platformun doğrulanmış adresi kullanılmak zorunda.

  KUSUR BURADAN ÇIKIYORDU. Yedek adres bir KİRACININ adresiydi
  ("ArvoCulture <siparis@arvoculture.com>"): ikinci salonun müşterisi,
  sipariş onayını başka bir markanın adıyla ve adresiyle alıyordu.
  Teknik kısıt adresi zorunlu kılıyor; GÖRÜNEN ADI zorunlu kılmıyor.
  Artık ad mağazanın kendi adı, adres platformunki:

      Salon Beta <siparis@…>

  ADRESİ ORTAM DEĞİŞKENİYLE VERİN. EMAIL_FALLBACK_FROM tanımlanmadığında
  bugünkü adres kullanılmaya devam ediyor — değiştirmek gönderimi
  durduracağı için (doğrulanmamış alan adından e-posta gitmez) bu karar
  koda değil, dağıtıma ait.

  Saf dosya; testi tests/eposta-gonderen.test.ts.
*/

/** "Ad <adres@alanadi.com>" ya da düz adres. */
export const YEDEK_GONDEREN = process.env.EMAIL_FALLBACK_FROM?.trim() || "ArvoCulture <siparis@arvoculture.com>";
export const YEDEK_YANIT = process.env.EMAIL_FALLBACK_REPLY_TO?.trim() || "info@arvoculture.com";

/** "Ad <adres>" biçimindeki değerden yalnızca adresi alır. */
export function adresiAyikla(deger: string): string {
  const eslesme = deger.match(/<([^>]+)>/);
  return (eslesme ? eslesme[1] : deger).trim();
}

/*
  Görünen adın tırnak ve köşeli parantezi temizleniyor: "Salon <x>"
  gibi bir mağaza adı başlığı bozar ve gönderim reddedilirdi.
*/
const adiTemizle = (ad: string) => ad.replace(/[<>"\r\n]/g, " ").replace(/\s+/g, " ").trim();

/** Mağazanın adını, verilen yedek adresle birleştirir. */
export function gonderenAdresi(magazaAdi: string, yedek: string): string {
  const adres = adresiAyikla(yedek);
  const ad = adiTemizle(magazaAdi);
  return ad ? `${ad} <${adres}>` : adres;
}
