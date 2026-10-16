/*
  İNDİRİMİN GÖSTERİMİ: ETİKET, DEĞER VE DURUM TEK YERDE.

  Liste, kampanya detayı ve ileride gelecek her ekran aynı kurala aynı
  şeyi demeli. Eşlemeler indirim listesinin içinde duruyordu; detay
  sayfası açılınca oradan import etmek, o sayfanın bütün sunucu kodunu
  ikinci rotanın ağacına sokardı.
*/

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

const TUR_ADI: Record<string, string> = {
  percentage: "Yüzde indirim",
  fixed_amount: "Sepet indirimi",
  free_shipping: "Ücretsiz kargo",
};

/** Tanınmayan tür ham değeriyle gösterilir: uydurmaktan iyidir. */
export const indirimTuruAdi = (tur: string): string => TUR_ADI[tur] ?? tur;

/** Kuralın değeri: yüzde, tutar ya da ücretsiz kargo. */
export function indirimDegeri(tur: string, deger: number): string {
  if (tur === "percentage") return `%${deger}`;
  if (tur === "fixed_amount") return money.format(deger / 100);
  return "Ücretsiz";
}

/*
  KURALIN TEK CÜMLESİ: "ne veriyor".

  Listede "Tür" ve "Değer" ayrı sütunlardı ve birbirini tekrarlıyordu:
  "Yüzde indirim" + "%10". Satırı okuyan kişi iki hücreden tek bir şey
  çıkarıyordu. Değer zaten türü söylüyor; cümle onu bir hücreye
  topluyor.
*/
export function indirimKuralYazisi(tur: string, deger: number): string {
  if (tur === "percentage") return `%${deger} indirim`;
  if (tur === "fixed_amount") return `${money.format(deger / 100)} indirim`;
  if (tur === "free_shipping") return "Ücretsiz kargo";
  return indirimTuruAdi(tur);
}

export const INDIRIM_DURUM_ROZETI: Record<string, { label: string; tone?: string }> = {
  active: { label: "Aktif", tone: "success" },
  paused: { label: "Duraklatıldı", tone: "warning" },
  draft: { label: "Taslak", tone: "neutral" },
  expired: { label: "Süresi doldu", tone: "neutral" },
};

export const indirimDurumu = (durum: string) => INDIRIM_DURUM_ROZETI[durum] ?? { label: durum, tone: "neutral" };
