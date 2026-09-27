/*
  tryOTO teslimat seçenekleri (checkOTODeliveryFee).
  Saf modül; testi tests/tryoto-fiyat.test.ts.

  Gönderi oluştururken KULLANILABİLİR firmalar buradan geliyor; dcList
  değil. dcList "OTO'nun desteklediği" firmaları listeliyor ve ücretsiz
  pakette kapalı (403). Burada dönen her seçeneğin kendi deliveryOptionId
  değeri var ve createShipment onu istiyor.

  Fiyat KURUŞA çevriliyor: ArvoARC parayı kuruş cinsinden tamsayı tutuyor
  (AGENTS.md) ve gönderi kaydına da öyle yazılıyor. OTO ondalık döndürüyor.
*/

/*
  Teslim biçimi. Aynı firma hem adrese teslim hem şubeden alım seçeneği
  dönebiliyor ve fiyatları farklı; ayrımı göstermemek, OTO panelindeki
  fiyatla buradakini karşılaştıran kullanıcıyı yanıltıyordu.
*/
export const TESLIM_TURU_ADI: Record<string, string> = {
  toCustomerDoorstep: "Adrese teslim",
  pickupByCustomer: "Şubeden alım",
  toCustomerDoorstepOrPickupByCustomer: "Adrese teslim / şubeden alım",
  locker: "Kargomat",
};

export interface TeslimatSecenegi {
  id: string;
  firmaAdi: string;
  hizmet: string | null;
  /** Adrese teslim mi şubeden alım mı; fiyat farkının başlıca sebebi. */
  teslimTuru: string | null;
  /** Kuruş cinsinden; bilinmiyorsa null. */
  ucretKurus: number | null;
  /** Kapıda ödeme ek ücreti (kuruş). */
  kapidaOdemeKurus: number | null;
  tahminiTeslim: string | null;
}

const metin = (kayit: Record<string, unknown>, adlar: string[]): string | null => {
  for (const ad of adlar) {
    const deger = kayit[ad];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
    if (typeof deger === "number" && Number.isFinite(deger)) return String(deger);
  }
  return null;
};

const kurusaCevir = (kayit: Record<string, unknown>, adlar: string[]): number | null => {
  for (const ad of adlar) {
    const deger = kayit[ad];
    const sayi = typeof deger === "number" ? deger : typeof deger === "string" && deger.trim() ? Number(deger) : NaN;
    if (Number.isFinite(sayi)) return Math.round(sayi * 100);
  }
  return null;
};

export function secenekleriCozumle(govde: unknown): TeslimatSecenegi[] {
  if (!govde || typeof govde !== "object") return [];
  const kayit = govde as Record<string, unknown>;
  /*
    Belgelenen sarmalayıcı deliveryCompany; yine de birkaç ad deneniyor,
    çünkü checkOTODeliveryFee ile checkDeliveryFee aynı şekli döndürdüğünü
    söylemiyor ve sarmalayıcı adı sürümle değişebiliyor.
  */
  const dizi = [kayit.deliveryCompany, kayit.deliveryCompanies, kayit.deliveryOptions, kayit.data, govde]
    .find((deger) => Array.isArray(deger)) as unknown[] | undefined;
  if (!dizi) return [];

  const secenekler: TeslimatSecenegi[] = [];
  const gorulen = new Set<string>();
  for (const satir of dizi) {
    if (!satir || typeof satir !== "object") continue;
    const s = satir as Record<string, unknown>;
    const id = metin(s, ["deliveryOptionId", "optionId", "id"]);
    /*
      deliveryOptionName ÖNCE: okunabilir ad o ("Deliver Now"),
      deliveryCompanyName ise kod gibi geliyor ("delivernow",
      "surat-kargo-marketplace") ve canlıda ekranda o görünüyordu.
    */
    const firmaAdi = metin(s, ["deliveryOptionName", "deliveryCompanyName", "companyName", "name"]);
    /*
      Kimliği olmayan seçenek gösterilmiyor: createShipment
      deliveryOptionId istiyor, kimliksiz satır seçilince gönderi
      oluşturulamaz ve kullanıcı sebebini anlamaz.
    */
    if (!id || !firmaAdi || gorulen.has(id)) continue;
    gorulen.add(id);
    secenekler.push({
      id,
      firmaAdi,
      hizmet: metin(s, ["serviceType", "shippingMethod"]),
      teslimTuru: (() => {
        const ham = metin(s, ["deliveryType", "pickupDropoff"]);
        return ham ? TESLIM_TURU_ADI[ham] ?? ham : null;
      })(),
      ucretKurus: kurusaCevir(s, ["price", "deliveryFee", "fee", "totalPrice", "amount"]),
      kapidaOdemeKurus: kurusaCevir(s, ["codCharge", "codFee"]),
      tahminiTeslim: metin(s, ["estimatedDeliveryDate", "estimatedDelivery", "deliveryTime"]),
    });
  }
  /*
    Ucuzdan pahalıya; fiyatı bilinmeyenler sonda. Operasyoncu genelde en
    ucuzu seçiyor ve listeyi taramak zorunda kalmamalı.
  */
  return secenekler.sort((a, b) => {
    if (a.ucretKurus === null) return 1;
    if (b.ucretKurus === null) return -1;
    return a.ucretKurus - b.ucretKurus || a.firmaAdi.localeCompare(b.firmaAdi, "tr");
  });
}

/*
  ŞEHİR ADI SADELEŞTİRME.

  OTO'nun örnekleri Latin harfli ("Riyadh", "Jeddah") ve şehir adı metin
  olarak eşleştiriliyor; Türkçe harfler eşleşmeyi bozabiliyor. Bu yüzden
  sorgu önce girildiği gibi, sonuç boş dönerse SADELEŞTİRİLMİŞ adla
  yeniden sorulur (lib/tryoto/ayar.ts). Baştan sadeleştirmek yanlış
  olurdu: OTO Türkçe adı tanıyorsa doğru yazım daha güvenilir.
*/
export function sehriSadelestir(ad: string): string {
  return ad
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .trim();
}

/*
  HACİMSEL AĞIRLIK: en × boy × yükseklik / 3000 (kargo sektörünün standart
  böleni; OTO paneli de bunu kullanıyor — 35×30×8 için 2.80 gösteriyor).
  OTO fiyatı gerçek ağırlıkla hacimselin BÜYÜĞÜ üzerinden hesaplıyor,
  dokümanda da böyle yazıyor.
*/
export const hacimselAgirlik = (enCm: number, boyCm: number, yukseklikCm: number): number =>
  enCm > 0 && boyCm > 0 && yukseklikCm > 0 ? Math.round(((enCm * boyCm * yukseklikCm) / 3000) * 100) / 100 : 0;

/** Kargo poşeti ölçüsü; OTO panelinde de varsayılan kutu bu. */
export const VARSAYILAN_KUTU = { enCm: 35, boyCm: 30, yukseklikCm: 8 };

/*
  KAPIDA TAHSİLAT HİÇ GÖNDERİLMİYOR (totalDue yok).

  ArvoARC'ta iki ödeme yöntemi var: PayTR (kart) ve havale/EFT. İkisinde
  de parayı biz tahsil ediyoruz, kargocu değil. Ödenmemiş bir havale
  siparişini "kapıda ödeme" sayıp totalDue göndermek canlıda iki hataya
  yol açtı: fiyatlar kapıda ödeme ücretiyle (codCharge) şişti ve OTO
  paneli "Kapıda ödeme: Hayır" derken burası tersini söylüyordu.
*/

/** checkOTODeliveryFee gövdesi. Ağırlık OTO'da kg ve zorunlu. */
export function fiyatSorgusuGovdesi(girdi: {
  cikisSehri: string;
  varisSehri: string;
  agirlikKg: number;
  enCm?: number;
  boyCm?: number;
  yukseklikCm?: number;
}): Record<string, unknown> {
  /*
    PAKET ÖLÇÜLERİ GÖNDERİLİYOR. Doküman bunları "isteğe bağlı" sayıyor
    ama ölçüsüz sorgu canlıda HİÇ seçenek döndürmedi (27.09.2026): OTO
    paneli de aynı adımda ölçüyü zorunlu alan olarak istiyor ve hacimsel
    ağırlığı ondan hesaplıyor. Ölçü verilmeyince firmalar fiyat
    veremiyor.
  */
  const en = girdi.enCm && girdi.enCm > 0 ? girdi.enCm : VARSAYILAN_KUTU.enCm;
  const boy = girdi.boyCm && girdi.boyCm > 0 ? girdi.boyCm : VARSAYILAN_KUTU.boyCm;
  const yukseklik = girdi.yukseklikCm && girdi.yukseklikCm > 0 ? girdi.yukseklikCm : VARSAYILAN_KUTU.yukseklikCm;
  return {
    originCity: girdi.cikisSehri,
    destinationCity: girdi.varisSehri,
    /*
      deliveryType GÖNDERİLMİYOR. "toCustomerDoorstepOrPickupByCustomer"
      denendi ve seçenek sayısı 1'den 0'a düştü (canlıda 27.09.2026):
      alan "hepsini getir" değil FİLTRE olarak çalışıyor ve hiçbir
      seçenek tam olarak o türde işaretli değil. Filtresiz sorgu OTO'nun
      döndürebildiği her şeyi veriyor.
    */
    length: boy,
    width: en,
    height: yukseklik,
    // Tahmini teslim tarihi seçimi kolaylaştırıyor; ek maliyeti yok.
    includeEstimatedDates: true,
    packageCount: 1,
    /*
      Ağırlık bilinmiyorsa 1 kg varsayılıyor. Sıfır göndermek OTO'da
      doğrulama hatası veriyor ve fiyat hiç gelmiyor; 1 kg en küçük
      gerçekçi paket ve seçenekleri görmeyi sağlıyor. Gerçek ağırlık
      girildiğinde fiyat da düzeliyor.
    */
    weight: girdi.agirlikKg > 0 ? girdi.agirlikKg : 1,
  };
}
