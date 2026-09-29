import { tutariKurusa } from "./istek";

/*
  ÖDEMENİN DOĞRULANMASI. Saf modül; testi tests/tami-odeme.test.ts.

  Ortak ödeme sayfasında SUNUCUDAN SUNUCUYA BİLDİRİM YOK: sonuç yalnızca
  müşterinin tarayıcısı bizim dönüş adresimize geldiğinde öğreniliyor.
  Tarayıcı dönüşü kanıt değildir — müşteri sekmeyi kapatabilir, ağ
  kopabilir, adres elle çağrılabilir. Bu yüzden sipariş ancak
  /payment/query cevabıyla "ödendi" olur.

  Üç koşul birlikte aranıyor:
    - PaymentStatus SUCCESS,
    - orderStatus AUTH (satış duruyor; REVERSE/REFUND iade edilmiş
      demek, PRE_AUTH ise henüz kapatılmamış ön otorizasyon),
    - tutar beklenen tutara EŞİT.

  Tutar denetimi şart: sorgu cevabındaki amount "işlem yapılabilir
  tutar", yani kısmi iade sonrası düşüyor. Kontrol edilmezse 100 TL'lik
  bir siparişte 20 TL iade sonrası gelen cevap, 80 TL'yi "ödendi" diye
  kabul ettirebilirdi.
*/

export type OdemeDurumu = "odendi" | "basarisiz" | "bekliyor";

export interface TamiSorguYaniti {
  success?: boolean;
  orderStatus?: string;
  PaymentStatus?: string;
  paymentStatus?: string;
  amount?: number;
  installmentCount?: number;
  bankAuthCode?: string;
  errorCode?: string;
  errorMessage?: string;
  card?: { binNumber?: string; cardBrand?: string; cardOrganization?: string; cardType?: string };
}

export interface OdemeSonucu {
  durum: OdemeDurumu;
  tutarKurus: number | null;
  taksit: number | null;
  bankaOnayKodu: string | null;
  kartOzeti: string | null;
  hata: string | null;
}

/* Tami alan adını büyük harfle belgeliyor (PaymentStatus); bazı
   cevaplarda küçük harfle geliyor. İkisi de okunuyor: tek yazıma
   güvenmek, ödemenin sessizce "bekliyor"da kalması demekti. */
const odemeStatusu = (yanit: TamiSorguYaniti) =>
  String(yanit.PaymentStatus ?? yanit.paymentStatus ?? "").toUpperCase();

export function odemeSonucu(yanit: TamiSorguYaniti, beklenenKurus: number): OdemeSonucu {
  const tutarKurus = typeof yanit.amount === "number" ? tutariKurusa(yanit.amount) : null;
  const kart = yanit.card
    ? [yanit.card.cardOrganization, yanit.card.cardBrand, yanit.card.cardType].filter(Boolean).join(" · ") || null
    : null;
  const ortak = {
    tutarKurus,
    taksit: typeof yanit.installmentCount === "number" ? yanit.installmentCount : null,
    bankaOnayKodu: yanit.bankAuthCode ?? null,
    kartOzeti: kart,
  };

  if (yanit.success === false) {
    return { ...ortak, durum: "basarisiz", hata: yanit.errorMessage ?? yanit.errorCode ?? "Sorgulama başarısız." };
  }

  const status = odemeStatusu(yanit);
  const siparisDurumu = String(yanit.orderStatus ?? "").toUpperCase();

  if (status === "SUCCESS" && siparisDurumu === "AUTH") {
    if (tutarKurus !== beklenenKurus) {
      /*
        Tutar tutmuyorsa ÖDENDİ DENMEZ. Eksik tutar kısmi iadeden de
        gelebilir, yanlış siparişi sorgulamaktan da; ikisinde de doğru
        davranış insana bırakmak.
      */
      return { ...ortak, durum: "basarisiz", hata: `Tutar uyuşmuyor: beklenen ${beklenenKurus}, gelen ${tutarKurus}` };
    }
    return { ...ortak, durum: "odendi", hata: null };
  }

  if (status === "FAIL" || status === "TIME_OUT") {
    return { ...ortak, durum: "basarisiz", hata: yanit.errorMessage ?? (status === "TIME_OUT" ? "Ödeme süresi doldu." : "Ödeme başarısız.") };
  }

  /* NOT_COMPLETE ve tanınmayan her şey: müşteri hâlâ sayfada olabilir. */
  return { ...ortak, durum: "bekliyor", hata: null };
}
