import { yetkiYok } from "@/lib/yetki-metni";

/*
  Ürünler ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  forbidden: yetkiYok("ürün işlemleri"),
  "invalid-product": "Ürün bilgilerini kontrol edin: ad, SKU ve geçerli bir fiyat gerekli.",
  "23505": "Bu SKU zaten kullanılıyor.",
  "invalid-status": "Geçersiz ürün durumu.",
  "bulk-needs-filter": "Toplu işlem için en az bir tedarikçi veya koleksiyon seçin.",
  "collection-not-found": "Koleksiyon bulunamadı.",
  "empty-collection": "Koleksiyonda ürün yok.",
  "bulk-failed": "Toplu işlem tamamlanamadı.",
  "bulk-empty": "Toplu işlem için ürün seçilmedi.",
};

export const BASARILAR: Record<string, string> = {
  created: "Ürün başarıyla oluşturuldu.",
  bulk: "Toplu durum değişikliği uygulandı.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
