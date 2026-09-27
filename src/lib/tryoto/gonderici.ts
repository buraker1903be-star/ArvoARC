/*
  Gönderici (çıkış) adresi. Saf modül; testi tests/tryoto-gonderici.test.ts.

  OTO'ya gönderici iki biçimde verilebiliyor: OTO panelinde tanımlı bir
  konumun KODU, ya da adresin tek tek yazılması (senderInformation).
  Ayar ekranı ikincisini baştan beri vaat ediyordu ("konum kodu boşsa
  adres tek tek gönderilir") ama o yol hiç kurulmamıştı: etiket üretimi
  gondericiKodu boşken "gönderici bilgisi yok" diyip duruyordu
  (27.09.2026, ilk gerçek deneme).

  Adres mağaza ayarında tutuluyor (arc_store_settings): kurumun kendi
  çıkış adresi mağaza başına değişiyor ve ortam değişkenine konan tek
  adres, ikinci mağaza açıldığında gönderileri yanlış yerden toplatırdı.
*/

export interface MagazaAdresSatiri {
  legal_name?: string | null;
  store_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address_line?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_country?: string | null;
}

export interface GondericiBilgisi {
  ad: string;
  telefon: string;
  adres: string;
  sehir: string;
  ulke: string;
  eposta: string | null;
}

const kirp = (deger: string | null | undefined) => (typeof deger === "string" ? deger.trim() : "");

/**
 * Ayar satırından gönderici bilgisi; zorunlu alanlardan biri eksikse null.
 *
 * Eksik alanla gövde kurup OTO'nun İngilizce hatasını beklemek yerine
 * burada null dönüyor: hangi alanın eksik olduğunu `gondericiEksigi`
 * Türkçe söylüyor.
 */
export function gondericiCoz(satir: MagazaAdresSatiri | null | undefined): GondericiBilgisi | null {
  if (!satir) return null;
  // Yasal ad tercih ediliyor: etikette müşterinin göreceği gönderici bu ve
  // faturadaki unvanla aynı olması gerekiyor. Yoksa mağaza adı.
  const ad = kirp(satir.legal_name) || kirp(satir.store_name);
  const telefon = kirp(satir.contact_phone);
  const sehir = kirp(satir.address_city);
  /*
    İlçe adres satırının SONUNA ekleniyor, ayrı alan olarak değil:
    senderInformation'da ilçe alanı yok ve ilçesiz adres kurye için çoğu
    zaman yetersiz.
  */
  const ilce = kirp(satir.address_district);
  const satirAdres = kirp(satir.address_line);
  const adres = [satirAdres, ilce].filter(Boolean).join(" ");
  if (!ad || !telefon || !satirAdres || !sehir) return null;
  return {
    ad,
    telefon,
    adres,
    sehir,
    ulke: kirp(satir.address_country) || "TR",
    eposta: kirp(satir.contact_email) || null,
  };
}

/** Gönderici adresinde eksik olan ilk alanın Türkçe adı; eksik yoksa null. */
export function gondericiEksigi(satir: MagazaAdresSatiri | null | undefined): string | null {
  if (!kirp(satir?.legal_name) && !kirp(satir?.store_name)) return "gönderici adı";
  if (!kirp(satir?.contact_phone)) return "telefon";
  if (!kirp(satir?.address_line)) return "adres";
  if (!kirp(satir?.address_city)) return "şehir";
  return null;
}
