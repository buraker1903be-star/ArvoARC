/*
  Koleksiyonlar ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS:Record<string,string>={
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-collection":"Koleksiyon adı ve bağlantısı zorunlu.",
  "23505":"Bu bağlantı başka bir koleksiyonda kullanılıyor.",
  "not-found":"Koleksiyon bulunamadı.",
};

export const BASARILAR: Record<string, string> = {
  created: "Koleksiyon oluşturuldu. Ürünleri seçip SEO bilgilerini ekledikten sonra durumunu Aktif yapın.",
  saved: "Koleksiyon kaydedildi.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
