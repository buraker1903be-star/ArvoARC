import { yetkiYok } from "@/lib/yetki-metni";

/*
  Siparişler ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  "order-closed": "Bu sipariş kapandığı (iptal ya da iade) için akışta ilerletilemez.",
  "order-not-found": "Sipariş bulunamadı.",
  forbidden: yetkiYok("sipariş işlemleri"),
  "invalid-status": "Geçersiz sipariş durumu.",
  "invalid-order": "Sipariş bilgileri eksik.",
  "save-failed": "Durum kaydedilemedi, tekrar deneyin.",
  "bulk-empty": "Toplu işlem için sipariş seçilmedi.",
};

export const BASARILAR: Record<string, string> = {
  created: "Sipariş oluşturuldu.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
