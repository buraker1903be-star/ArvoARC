/*
  tryOTO createOrder gövdesi. Saf modül; testi tests/tryoto-siparis-govdesi.test.ts.

  Bölünmüş kargoda her parça OTO'da AYRI BİR SİPARİŞ oluyor: createShipment
  tek bir orderId alıyor, yani iki firmaya bölmek iki OTO siparişi demek.
  Parçalar parentOrderId ile aynı ArvoARC siparişine bağlanıyor — OTO
  panelinde "bu üç gönderi aynı siparişin parçası" görünsün.

  PARA BİRİMİ: ArvoARC kuruş cinsinden tamsayı tutuyor (AGENTS.md), OTO
  ondalık istiyor. Dönüşüm tek yerde ve yuvarlama yok: kuruş / 100 tam
  bölünüyor, kayıp olmuyor.
*/

export interface GovdeGirdisi {
  /** ArvoARC sipariş numarası; OTO'da parça numarasıyla birleşiyor. */
  siparisNo: string;
  /** Gönderinin sipariş içindeki sırası (1'den başlar). */
  sira: number;
  paraBirimi: string;
  /** Siparişin ödeme durumu; ödenmişse OTO'ya tahsilat yok diyoruz. */
  odendi: boolean;
  musteri: {
    ad: string;
    telefon: string;
    adres: string;
    sehir: string;
    ilce?: string | null;
    postaKodu?: string | null;
    ulke?: string | null;
    eposta?: string | null;
  };
  kalemler: { ad: string; sku?: string | null; adet: number; birimFiyatKurus: number; toplamKurus: number }[];
  /** OTO'da tanımlı gönderici konumu; yoksa gönderici bilgisi tek tek gider. */
  gondericiKodu?: string | null;
  gonderici?: {
    ad: string;
    telefon: string;
    adres: string;
    sehir: string;
    ulke?: string | null;
    eposta?: string | null;
  } | null;
  /** Fiyat sorgusundan seçilen taşıma seçeneği. */
  teslimatSecenegiId?: string | null;
  /** Toplam paket ağırlığı (kg); bilinmiyorsa gönderilmiyor. */
  agirlikKg?: number | null;
}

/** Kuruş → OTO'nun beklediği ondalık tutar. */
const tutar = (kurus: number) => Math.round(kurus) / 100;

export function createOrderGovdesi(girdi: GovdeGirdisi): Record<string, unknown> {
  const kalemToplami = girdi.kalemler.reduce((toplam, kalem) => toplam + kalem.toplamKurus, 0);

  const govde: Record<string, unknown> = {
    /*
      orderId OTO'da benzersiz olmalı ve bir ArvoARC siparişi birden çok
      OTO siparişi doğurduğu için sıra eklenmiş: "AC-1042-2". Sipariş
      numarasını olduğu gibi göndermek, ikinci parçada "zaten var"
      hatasına yol açardı.
    */
    orderId: `${girdi.siparisNo}-${girdi.sira}`,
    parentOrderId: girdi.siparisNo,
    currency: girdi.paraBirimi,
    amount: tutar(kalemToplami),
    /*
      amount_due kapıda tahsil edilecek tutar. Sipariş ödenmişse SIFIR;
      burayı toplamla doldurmak, kargocunun müşteriden bir kez daha para
      istemesi demek.
    */
    amount_due: girdi.odendi ? 0 : tutar(kalemToplami),
    payment_method: girdi.odendi ? "paid" : "cod",
    // Arayüz ve bildirim dili; OTO en/ar/tr kabul ediyor.
    language: "tr",
    customer: {
      name: girdi.musteri.ad,
      mobile: girdi.musteri.telefon,
      address: girdi.musteri.adres,
      city: girdi.musteri.sehir,
      // ISO2; ArvoARC adreslerinde ülke boş kalabiliyor, varsayılan TR.
      country: girdi.musteri.ulke?.trim() || "TR",
      ...(girdi.musteri.ilce ? { district: girdi.musteri.ilce } : {}),
      ...(girdi.musteri.postaKodu ? { postcode: girdi.musteri.postaKodu } : {}),
      ...(girdi.musteri.eposta ? { email: girdi.musteri.eposta } : {}),
    },
    items: girdi.kalemler.map((kalem) => ({
      name: kalem.ad,
      quantity: kalem.adet,
      price: tutar(kalem.birimFiyatKurus),
      rowTotal: tutar(kalem.toplamKurus),
      currency: girdi.paraBirimi,
      ...(kalem.sku ? { sku: kalem.sku } : {}),
    })),
  };

  /*
    Gönderici ya KOD ya da AÇIK BİLGİ. OTO ikisini birlikte kabul
    etmiyor ("can not be used together with pickupLocationCode"); ikisini
    de göndermek isteği tümden reddettirirdi.
  */
  if (girdi.gondericiKodu?.trim()) {
    govde.pickupLocationCode = girdi.gondericiKodu.trim();
  } else if (girdi.gonderici) {
    govde.senderInformation = {
      senderFullName: girdi.gonderici.ad,
      senderMobile: girdi.gonderici.telefon,
      senderAddressLine: girdi.gonderici.adres,
      senderCity: girdi.gonderici.sehir,
      senderCountry: girdi.gonderici.ulke?.trim() || "TR",
      ...(girdi.gonderici.eposta ? { senderEmail: girdi.gonderici.eposta } : {}),
    };
  }

  if (girdi.teslimatSecenegiId) govde.deliveryOptionId = girdi.teslimatSecenegiId;
  if (girdi.agirlikKg && girdi.agirlikKg > 0) govde.packageWeight = girdi.agirlikKg;
  return govde;
}

/** Gövde OTO'ya gönderilebilir mi; değilse Türkçe sebep. */
export function govdeSorunu(girdi: GovdeGirdisi): string | null {
  if (!girdi.kalemler.length) return "Gönderiye en az bir ürün ekleyin.";
  /*
    OTO'nun zorunlu saydığı alanlar burada da isteniyor: eksik gönderip
    OTO'nun İngilizce hata mesajını beklemek yerine, hangi bilginin
    eksik olduğu Türkçe ve alan adıyla söyleniyor.
  */
  if (!girdi.musteri.ad.trim()) return "Müşteri adı boş; sipariş adresinde ad yok.";
  if (!girdi.musteri.telefon.trim()) return "Müşteri telefonu boş; OTO telefon olmadan gönderi oluşturmuyor.";
  if (!girdi.musteri.adres.trim()) return "Teslimat adresi boş.";
  if (!girdi.musteri.sehir.trim()) return "Teslimat şehri boş.";
  if (!girdi.gondericiKodu?.trim() && !girdi.gonderici) {
    return "Gönderici bilgisi yok: mağaza ayarlarında gönderici konum kodu tanımlayın.";
  }
  return null;
}
