/*
  tryOTO kargo firması listesinin (dcList) çözümlenmesi.
  Saf modül; testi tests/tryoto-firmalar.test.ts.

  NEDEN ESNEK: dcList'in yanıt şekli belgelenmiş değil — dokümanda yalnızca
  ucun adresi var, gövde örneği yok. Tek bir alan adına bel bağlayan kod,
  şekil tahmin edilenden farklıysa "hiç firma yok" diye sessizce boş liste
  gösterirdi; kullanıcı da entegrasyonun çalışmadığını sanırdı. Bu yüzden
  bilinen birkaç sarmalayıcı ve alan adı sırayla deneniyor, hiçbiri
  tutmazsa çağıran HAM GÖVDEYİ ekranda gösteriyor.
*/

export interface KargoFirmasi {
  kod: string;
  ad: string;
  /** OTO hesabında bu firma etkin mi; bilinmiyorsa null. */
  etkin: boolean | null;
}

/** Dizi taşıyan ilk sarmalayıcı alan; yoksa gövdenin kendisi. */
function diziBul(govde: unknown): unknown[] {
  if (Array.isArray(govde)) return govde;
  if (!govde || typeof govde !== "object") return [];
  const kayit = govde as Record<string, unknown>;
  for (const alan of ["deliveryCompanyList", "deliveryCompanies", "deliveryCompany", "dcList", "companies", "data", "result"]) {
    const deger = kayit[alan];
    if (Array.isArray(deger)) return deger;
  }
  return [];
}

const metin = (kayit: Record<string, unknown>, adlar: string[]): string | null => {
  for (const ad of adlar) {
    const deger = kayit[ad];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
    if (typeof deger === "number") return String(deger);
  }
  return null;
};

export function firmalariCozumle(govde: unknown): KargoFirmasi[] {
  const firmalar: KargoFirmasi[] = [];
  const gorulen = new Set<string>();
  for (const satir of diziBul(govde)) {
    if (!satir || typeof satir !== "object") continue;
    const kayit = satir as Record<string, unknown>;
    const ad = metin(kayit, ["deliveryCompanyName", "dcName", "name", "companyName", "title"]);
    const kod = metin(kayit, ["deliveryCompanyCode", "dcCode", "code", "companyCode", "id"]) ?? ad;
    // Adı da kodu da olmayan satır listede bir şey anlatmıyor.
    if (!kod || !ad) continue;
    if (gorulen.has(kod)) continue;
    gorulen.add(kod);
    const etkinDeger = kayit.isActive ?? kayit.active ?? kayit.enabled ?? kayit.status;
    firmalar.push({
      kod,
      ad,
      etkin:
        typeof etkinDeger === "boolean" ? etkinDeger
        : typeof etkinDeger === "string" ? ["active", "enabled", "true", "1"].includes(etkinDeger.toLowerCase())
        : null,
    });
  }
  return firmalar.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}
