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

export interface TeslimatSecenegi {
  id: string;
  firmaAdi: string;
  hizmet: string | null;
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
    const firmaAdi = metin(s, ["deliveryCompanyName", "deliveryOptionName", "companyName", "name"]);
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
      hizmet: metin(s, ["serviceType", "deliveryOptionName", "shippingMethod"]),
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

/** checkOTODeliveryFee gövdesi. Ağırlık OTO'da kg ve zorunlu. */
export function fiyatSorgusuGovdesi(girdi: {
  cikisSehri: string;
  varisSehri: string;
  agirlikKg: number;
  kapidaTahsilatKurus?: number | null;
}): Record<string, unknown> {
  return {
    originCity: girdi.cikisSehri,
    destinationCity: girdi.varisSehri,
    /*
      Ağırlık bilinmiyorsa 1 kg varsayılıyor. Sıfır göndermek OTO'da
      doğrulama hatası veriyor ve fiyat hiç gelmiyor; 1 kg en küçük
      gerçekçi paket ve seçenekleri görmeyi sağlıyor. Gerçek ağırlık
      girildiğinde fiyat da düzeliyor.
    */
    weight: girdi.agirlikKg > 0 ? girdi.agirlikKg : 1,
    ...(girdi.kapidaTahsilatKurus && girdi.kapidaTahsilatKurus > 0
      ? { totalDue: Math.round(girdi.kapidaTahsilatKurus) / 100 }
      : {}),
  };
}
