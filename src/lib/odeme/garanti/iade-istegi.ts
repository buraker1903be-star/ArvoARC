import { guvenlikVerisi, type GarantiKimligi } from "./imza";
import { createHash } from "node:crypto";
import { TRY_KODU, tutarAlani } from "./istek";

/*
  GARANTİ İPTAL/İADE İSTEĞİ. Saf modül; testi tests/garanti-iade.test.ts.

  Provizyon uçları XML konuşuyor (3D formundan ayrı bir dünya) ve
  imzası da farklı: alanlar OrderID + Terminal.ID + kart no + tutar +
  para birimi + güvenlik verisi sırasıyla, yine ayıraçsız.

  KART NUMARASI YOK AMA YERİ VAR. İade isteğinde kart gönderilmiyor;
  bankanın kendi uygulamasında alan boş dizge olarak hash'e giriyor.
  Alanı tamamen atlamak başka bir hash üretir — "yok" ile "boş" burada
  farklı şeyler.

  KULLANICI PROVRFN, PROVAUT DEĞİL. Güvenlik verisi de iade şifresinden
  üretiliyor (imza.ts · guvenlikVerisi "iade"). PROVAUT ile iade
  denemek bankadan yetki hatası döndürür.

  İPTAL (void) Mİ İADE (refund) Mİ: gün sonu alınmamış bir işlem
  iptal edilir, alınmış olan iade edilir. Hangisi olduğunu dışarıdan
  bilemiyoruz; banka yanlış türde "işlem bulunamadı" dediği için
  çağıran önce iptali, olmazsa iadeyi deniyor (istemci.ts).
*/

export type IadeTuru = "void" | "refund";

const kacis = (deger: string): string =>
  deger.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function iadeHash(
  kimlik: GarantiKimligi,
  siparisNo: string,
  tutarKurus: number,
): string | null {
  const guvenlik = guvenlikVerisi(kimlik, "iade");
  if (!guvenlik) return null;
  const metin = [
    siparisNo,
    kimlik.terminalNo,
    "", // kart numarasının yeri: iadede boş, ama hash'te var
    tutarAlani(tutarKurus),
    TRY_KODU,
    guvenlik,
  ].join("");
  const algoritma = kimlik.surum === "v512" ? "sha512" : "sha1";
  return createHash(algoritma).update(metin, "utf8").digest("hex").toUpperCase();
}

export interface IadeGirdisi {
  siparisNo: string;
  tutarKurus: number;
  tur: IadeTuru;
  musteriIp: string;
}

/** Bankaya POST edilecek XML. İade şifresi yoksa null. */
export function iadeXml(
  kimlik: GarantiKimligi,
  testModu: boolean,
  girdi: IadeGirdisi,
): string | null {
  const hash = iadeHash(kimlik, girdi.siparisNo, girdi.tutarKurus);
  if (!hash) return null;

  /* Müşteri metni buraya girmiyor (sipariş no ve tutar bizim
     ürettiğimiz değerler), yine de kaçış uygulanıyor: alanların
     kaynağı ileride değişirse XML'i bozan bir karakter sessizce
     geçmesin. */
  return `<?xml version="1.0" encoding="UTF-8"?>
<GVPSRequest>
  <Mode>${testModu ? "TEST" : "PROD"}</Mode>
  <Version>${kimlik.surum === "v512" ? "512" : "v0.01"}</Version>
  <Terminal>
    <ProvUserID>PROVRFN</ProvUserID>
    <HashData>${hash}</HashData>
    <UserID>PROVRFN</UserID>
    <ID>${kacis(kimlik.terminalNo)}</ID>
    <MerchantID>${kacis(kimlik.isyeriNo)}</MerchantID>
  </Terminal>
  <Customer>
    <IPAddress>${kacis(girdi.musteriIp)}</IPAddress>
  </Customer>
  <Order>
    <OrderID>${kacis(girdi.siparisNo)}</OrderID>
  </Order>
  <Transaction>
    <Type>${girdi.tur}</Type>
    <Amount>${tutarAlani(girdi.tutarKurus)}</Amount>
    <CurrencyCode>${TRY_KODU}</CurrencyCode>
    <OriginalRetrefNum></OriginalRetrefNum>
  </Transaction>
</GVPSRequest>`;
}

/*
  BANKANIN XML CEVABI. Tam bir XML çözümleyici getirmiyoruz: cevap sabit
  ve sığ, aradığımız üç alan var. Düzenli ifade, gelen gövde beklenenden
  farklıysa "alan yok" diyor ve çağıran bunu başarısızlık sayıyor —
  tanımadığı bir cevabı "başarılı" sayan bir çözümleyiciden iyidir.
*/
export function iadeCevabiniCoz(gövde: string): { ok: boolean; mesaj: string; referans: string | null } {
  const al = (etiket: string) =>
    (new RegExp(`<${etiket}>([\\s\\S]*?)</${etiket}>`, "i").exec(gövde)?.[1] ?? "").trim();

  const kod = al("ReasonCode") || al("Code");
  const mesaj = al("ErrorMsg") || al("SysErrMsg") || al("Message");
  const referans = al("RetRefNum") || null;

  /* Bankanın "başarılı" işareti Message=Approved ya da ReasonCode=00.
     İkisi de yoksa başarısız: boş bir cevabı onay saymak, iade
     edilmemiş parayı iade edilmiş göstermek demekti. */
  const onayli = /approved/i.test(al("Message")) || kod === "00";
  return {
    ok: onayli,
    mesaj: onayli ? "İade bankaya iletildi." : (mesaj || `Banka iadeyi tamamlamadı${kod ? ` (${kod})` : ""}.`),
    referans,
  };
}
