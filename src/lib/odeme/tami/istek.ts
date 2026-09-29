/*
  TAMİ ORTAK ÖDEME SAYFASI — istek biçimleri. Saf modül; ağ yok.

  Akış: token al → müşteriyi Tami'nin sayfasına gönder → dönüşte
  SORGULAMA ile doğrula. Sunucudan sunucuya bildirim YOK, bu yüzden
  tarayıcıdan gelen dönüş tek başına "ödendi" saydırmaz
  (lib/odeme/tami/yanit.ts).
*/

export interface TamiUclari {
  /** Ortak ödeme sayfası için tek kullanımlık jeton. */
  token: string;
  /** Müşterinin yönlendirildiği ödeme sayfası. */
  sayfa: string;
  /** Sonucun doğrulandığı yer; tarayıcı dönüşü kanıt sayılmıyor. */
  sorgu: string;
  iade: string;
}

export const TAMI_UCLARI: { test: TamiUclari; canli: TamiUclari } = {
  test: {
    token: "https://sandbox-paymentapi.tami.com.tr/hosted/create-one-time-hosted-token",
    sayfa: "https://sandbox-portal.tami.com.tr/hostedPaymentPage",
    sorgu: "https://sandbox-paymentapi.tami.com.tr/payment/query",
    iade: "https://sandbox-paymentapi.tami.com.tr/payment/reverse",
  },
  canli: {
    token: "https://paymentapi.tami.com.tr/hosted/create-one-time-hosted-token",
    sayfa: "https://portal.tami.com.tr/hostedPaymentPage",
    sorgu: "https://paymentapi.tami.com.tr/payment/query",
    iade: "https://paymentapi.tami.com.tr/payment/reverse",
  },
};

/*
  SİPARİŞ NUMARASI. Tami 2–36 karakter, yalnızca harf/rakam, "-" ve "_"
  kabul ediyor; ayırıcılar ART ARDA GELEMİYOR.

  Bizim sipariş numaralarımız bu kalıba uymuyor ("SPR#1018" gibi "#"
  taşıyanlar var), o yüzden Tami'ye ödeme kaydının kendi kimliği (uuid)
  gidiyor: 36 karakter, yalnızca harf/rakam ve tek tek tireler — kalıba
  birebir uyuyor ve zaten tekil. Sipariş numarasını göndermek, biçimi
  bir gün değişince ödemenin tamamen durması demekti.
*/
const SIPARIS_NO_KALIBI = /^(?!.*[-_]{2})[A-Za-z0-9](?:[A-Za-z0-9_-]{0,34}[A-Za-z0-9])?$/;

export const siparisNoGecerliMi = (deger: string): boolean =>
  typeof deger === "string" && deger.length >= 2 && deger.length <= 36 && SIPARIS_NO_KALIBI.test(deger);

/*
  TUTAR. Bizde para kuruş cinsinden tamsayı; Tami ondalık ve ayracı
  nokta istiyor. Çevirme tek yerde: kayan noktalı aritmetiği tutara
  yaymak, 1999 kuruşu 19.990000000000002 yapan türden hatalar üretir.
*/
export const kurusuTutara = (kurus: number): number => {
  if (!Number.isInteger(kurus) || kurus <= 0) throw new Error("Tutar kuruş cinsinden pozitif tamsayı olmalı.");
  return Number((kurus / 100).toFixed(2));
};

export const tutariKurusa = (tutar: number): number => Math.round(Number(tutar) * 100);

/*
  TELEFON. Masterpass doğrulaması için zorunlu ve biçim "905xxxxxxxxx".
  Vitrin telefonu "0532 123 45 67" gibi topluyor; rakamlar ayıklanıp
  ülke koduna çevriliyor. Çevrilemiyorsa null dönüyor — uydurulmuş bir
  numara göndermek, müşterinin doğrulama kodunu hiç alamaması demek.
*/
export function tamiTelefonu(ham: string): string | null {
  const rakam = String(ham ?? "").replace(/\D/g, "");
  if (rakam.length === 10 && rakam.startsWith("5")) return `90${rakam}`;
  if (rakam.length === 11 && rakam.startsWith("05")) return `90${rakam.slice(1)}`;
  if (rakam.length === 12 && rakam.startsWith("905")) return rakam;
  if (rakam.length === 13 && rakam.startsWith("0905")) return rakam.slice(1);
  return null;
}

export interface TokenIstegi {
  amount: number;
  orderId: string;
  successCallbackUrl: string;
  failCallbackUrl: string;
  mobilePhoneNumber: string;
}

export function tokenIstegi(girdi: {
  odemeKimligi: string;
  tutarKurus: number;
  telefon: string;
  donusAdresi: string;
}): TokenIstegi {
  if (!siparisNoGecerliMi(girdi.odemeKimligi)) throw new Error("Tami sipariş numarası kalıba uymuyor.");
  const telefon = tamiTelefonu(girdi.telefon);
  if (!telefon) throw new Error("Masterpass için geçerli bir cep telefonu gerekiyor.");
  return {
    amount: kurusuTutara(girdi.tutarKurus),
    orderId: girdi.odemeKimligi,
    /*
      failCallbackUrl zorunlu ama Tami şu an oraya yönlendirmiyor
      (belgede yazıyor); ikisi de aynı adres veriliyor. Dönüş adresi
      sonucu BELİRLEMİYOR, yalnızca müşteriyi geri getiriyor.
    */
    successCallbackUrl: girdi.donusAdresi,
    failCallbackUrl: girdi.donusAdresi,
    mobilePhoneNumber: telefon,
  };
}

export const odemeSayfasiAdresi = (sayfaUcu: string, oneTimeToken: string): string =>
  `${sayfaUcu}?token=${encodeURIComponent(oneTimeToken)}`;
