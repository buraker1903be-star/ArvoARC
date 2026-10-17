import "server-only";
import { resolveTxt } from "node:dns/promises";

/*
  DIŞ VİTRİNİN ALAN ADI DOĞRULAMASI.

  Vitrini biz barındırdığımızda doğrulama Vercel'in işi: alan adı
  bize yöneliyor mu diye bakıyor. Müşteri sitesini kendi yaptığında
  DNS zaten başka yere yöneliyor, yani o yol kapalı.

  DOĞRULAMA YİNE GEREKİYOR. Kayıt yalnızca bir ad değil: hangi
  mağazanın siparişinin yazılacağını ve CORS'un kime açılacağını
  belirliyor. Doğrulamadan kabul etmek, bir kiracının sahibi
  olmadığı bir alan adını iddia etmesine kapı açardı.

  Kanıt TXT kaydı: panel bir jeton üretiyor, müşteri onu kendi DNS
  bölgesine yazıyor. Jetonu ancak alan adının DNS'ine erişen biri
  yazabilir — aradığımız kanıt tam olarak bu.

  Kayıt kökte ya da _arvo alt adında aranıyor: bazı sağlayıcılar
  kökte TXT eklemeyi zorlaştırıyor ve müşteriyi tek bir biçime
  mahkûm etmek gereksiz.
*/

export type DogrulamaSonucu =
  | { dogrulandi: true }
  | { dogrulandi: false; sebep: string };

const JETON_DESENI = /^arvo-verification=[0-9a-f]{32}$/;

export async function disVitriniDogrula(
  alanAdi: string,
  jeton: string,
): Promise<DogrulamaSonucu> {
  if (!JETON_DESENI.test(jeton)) {
    return { dogrulandi: false, sebep: "Doğrulama jetonu üretilmemiş; alan adını yeniden kaydedin." };
  }

  const adaylar = [alanAdi, `_arvo.${alanAdi}`];
  const bulunanlar: string[] = [];

  for (const ad of adaylar) {
    try {
      const kayitlar = await resolveTxt(ad);
      for (const parcalar of kayitlar) {
        /* TXT kaydı 255 karakterlik parçalara bölünebiliyor; sağlayıcı
           uzun değeri bölerse birleştirmeden aranan metin bulunamaz. */
        const deger = parcalar.join("").trim();
        bulunanlar.push(deger);
        if (deger === jeton) return { dogrulandi: true };
      }
    } catch {
      /* Kayıt yoksa ya da alan adı çözülmüyorsa sıradaki adaya
         geçiliyor; ikisi de başarısızsa aşağıdaki mesaj dönüyor. */
    }
  }

  return {
    dogrulandi: false,
    sebep: bulunanlar.length
      ? `TXT kaydı bulundu ama jeton eşleşmedi. Beklenen: ${jeton}`
      : `${alanAdi} için TXT kaydı görünmüyor. DNS'in yayılması birkaç dakika sürebilir.`,
  };
}
