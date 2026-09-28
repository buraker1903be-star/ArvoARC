import { yetkiYok } from "@/lib/yetki-metni";

/*
  Tedarikçi ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  "invalid-margin": "Kâr oranı 0 ile 500 arasında olmalı.",
  "invalid-shipping": "Kargo payı geçersiz.",
  "invalid-round": "Yuvarlama 0 ile 99 kuruş arasında olmalı.",
  "invalid-service": "Ek hizmet bedeli geçersiz.",
  "invalid-buffer": "Stok tamponu 0 ile 100 arasında olmalı.",
  "missing-code": "Tedarikçi kodu eksik.",
  "save-failed": "Ayarlar kaydedilemedi, tekrar deneyin.",
  forbidden: yetkiYok("tedarikçi ayarları", "sahiplik"),
};

export const BASARILAR: Record<string, string> = {
  saved: "Tedarikçi ayarları kaydedildi.",
  reset: "Aktarım imleci sıfırlandı.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
