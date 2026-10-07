import { formHash, type GarantiKimligi } from "./imza";

/*
  GARANTİ 3D FORM İSTEĞİ. Saf modül; testi tests/garanti-istek.test.ts.

  Seçilen model 3D PAY HOSTING: kart formu BANKANIN sayfasında. Kart
  numarası bizim sunucumuza hiç uğramıyor (PayTR ve Tami'de olduğu gibi)
  ve PCI yükümlülüğü SAQ A'da kalıyor. Kart formunu kendi sitemize almak
  görsel olarak daha bütün olurdu ama SAQ A-EP demekti: dış tarama,
  ayrı denetim.

  Banka bir FORM POST'u bekliyor, adres satırından gidilebilen bir
  bağlantı değil: alanların arasında imza da var ve adres satırına
  sığdırmak onu kullanıcının değiştirebileceği bir yere koymak olurdu.
  Bu yüzden ödeme, kendi ucumuzun ürettiği kendiliğinden gönderilen bir
  formla başlıyor (api/storefront/garanti-git).
*/

export const GARANTI_UCLARI = {
  test: {
    form: "https://sanalposprovtest.garanti.com.tr/servlet/gt3dengine",
    provizyon: "https://sanalposprovtest.garanti.com.tr/VPServlet",
  },
  canli: {
    form: "https://sanalposprov.garanti.com.tr/servlet/gt3dengine",
    provizyon: "https://sanalposprov.garanti.com.tr/VPServlet",
  },
} as const;

export type GarantiUclari = (typeof GARANTI_UCLARI)[keyof typeof GARANTI_UCLARI];

/** Türk lirası. Banka ISO 4217 sayısal kodunu istiyor. */
export const TRY_KODU = "949";

/*
  TUTAR KURUŞ CİNSİNDEN VE AYIRAÇSIZ. Banka "1,00 TL" için "100"
  bekliyor; bizim para birimimiz zaten kuruş tamsayısı (AGENTS.md), yani
  dönüşüm yok. Ondalık ayıraç koymak tutarı yüz katına çıkarırdı.
*/
export const tutarAlani = (kurus: number): string => String(Math.round(kurus));

/*
  TAKSİT YOKSA ALAN BOŞ. Bankanın örneğinde tek çekim için boş dizge
  gidiyor, "0" değil — ve bu alan hash'e de giriyor, yani "0" yazmak
  hem taksit alanını hem imzayı değiştirir.
*/
export const taksitAlani = (taksit: number | null | undefined): string =>
  !taksit || taksit <= 1 ? "" : String(Math.trunc(taksit));

export interface GarantiFormGirdisi {
  siparisNo: string;
  tutarKurus: number;
  taksit?: number | null;
  basariAdresi: string;
  hataAdresi: string;
  musteriEposta: string;
  musteriIp: string;
  /** Banka ekranında görünen işyeri adı. */
  isyeriAdi: string;
}

/**
 * Bankaya POST edilecek alanlar. İmza üretilemezse (provizyon şifresi
 * yok) null döner — eksik imzayla form göndermek, müşteriyi bankanın
 * anlaşılmaz hata ekranına düşürmek demek.
 */
export function formAlanlari(
  kimlik: GarantiKimligi,
  guvenlikDuzeyi: string,
  testModu: boolean,
  girdi: GarantiFormGirdisi,
): Record<string, string> | null {
  const imzalanan = {
    terminalid: kimlik.terminalNo,
    orderid: girdi.siparisNo,
    txnamount: tutarAlani(girdi.tutarKurus),
    txncurrencycode: TRY_KODU,
    successurl: girdi.basariAdresi,
    errorurl: girdi.hataAdresi,
    txntype: "sales",
    txninstallmentcount: taksitAlani(girdi.taksit),
  };

  const hash = formHash(kimlik, imzalanan);
  if (!hash) return null;

  return {
    ...imzalanan,
    /* apiversion ile hash sürümü AYNI karardan geliyor: "512" yazıp
       SHA1 imzalamak (ya da tersi) bankanın tek satırlık "hash hatalı"
       cevabına çıkar. */
    apiversion: kimlik.surum === "v512" ? "512" : "v0.01",
    mode: testModu ? "TEST" : "PROD",
    terminalprovuserid: "PROVAUT",
    terminaluserid: "PROVAUT",
    terminalmerchantid: kimlik.isyeriNo,
    secure3dsecuritylevel: guvenlikDuzeyi,
    customeremailaddress: girdi.musteriEposta,
    customeripaddress: girdi.musteriIp,
    companyname: girdi.isyeriAdi,
    lang: "tr",
    secure3dhash: hash,
  };
}
