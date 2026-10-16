/*
  İADE TALEBİNİN DURUMU: ETİKET VE TON TEK YERDE.

  Liste tablosu, iade detayı ve müşteriye giden sipariş sayfası aynı
  talebe aynı şeyi demeli. Eşleme eskiden iade listesinin içinde
  duruyordu; detay sayfası açıldığında oradan import edilmesi gerekti
  ve bir sayfa modülünden sabit okumak, o sayfanın bütün sunucu kodunu
  ve CSS'ini ikinci rotanın ağacına sokuyordu.
*/

export type IadeRozeti = { label: string; tone?: string };

export const IADE_ROZETI: Record<string, IadeRozeti> = {
  beklemede: { label: "Bekliyor", tone: "warn" },
  onaylandi: { label: "Ürün bekleniyor", tone: "warn" },
  reddedildi: { label: "Reddedildi", tone: "bad" },
  tamamlandi: { label: "İade edildi", tone: "muted" },
};

/** Tanınmayan durum ham değeriyle gösterilir: uydurmaktan iyidir. */
export const iadeRozeti = (durum: string): IadeRozeti => IADE_ROZETI[durum] ?? { label: durum };
