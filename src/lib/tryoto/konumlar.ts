/*
  tryOTO gönderici konumları (getPickupLocationList).
  Saf modül; testi tests/tryoto-konumlar.test.ts.

  Neden panelde listeleniyor: createOrder'da gönderici adresi ya tek tek
  yazılıyor ya da OTO'da tanımlı bir konumun KODU gönderiliyor. Kodu OTO
  panelinde aramak ve ayar ekranına elle kopyalamak gereksiz bir adım;
  üstelik yanlış yazılan kod ancak ilk gönderi denemesinde hata veriyor.

  Yanıt şekli belgeli (dcList'in aksine): success + warehouses[] +
  branches[]. Yine de iki dizi de eksik olabilir diye tek tek kontrol
  ediliyor — hesapta yalnızca depo tanımlıysa branches hiç gelmiyor.
*/

export interface GondericiKonumu {
  kod: string;
  ad: string;
  sehir: string | null;
  /** warehouse | branch — ekranda ayrımı görünüyor. */
  tur: "depo" | "sube";
}

const metin = (kayit: Record<string, unknown>, ad: string): string | null => {
  const deger = kayit[ad];
  if (typeof deger === "string" && deger.trim()) return deger.trim();
  if (typeof deger === "number") return String(deger);
  return null;
};

function diziyiOku(deger: unknown, tur: GondericiKonumu["tur"]): GondericiKonumu[] {
  if (!Array.isArray(deger)) return [];
  const konumlar: GondericiKonumu[] = [];
  for (const satir of deger) {
    if (!satir || typeof satir !== "object") continue;
    const kayit = satir as Record<string, unknown>;
    const kod = metin(kayit, "code");
    // Kodu olmayan konum işe yaramaz: createOrder'a verilecek değer o.
    if (!kod) continue;
    konumlar.push({
      kod,
      ad: metin(kayit, "name") ?? kod,
      sehir: metin(kayit, "city"),
      tur,
    });
  }
  return konumlar;
}

export function konumlariCozumle(govde: unknown): GondericiKonumu[] {
  if (!govde || typeof govde !== "object") return [];
  const kayit = govde as Record<string, unknown>;
  return [...diziyiOku(kayit.warehouses, "depo"), ...diziyiOku(kayit.branches, "sube")]
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}
