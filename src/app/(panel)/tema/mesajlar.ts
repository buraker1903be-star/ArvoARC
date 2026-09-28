import { yetkiYok } from "@/lib/yetki-metni";

/*
  Tema ekranının işlem sonucu metinleri. Metinler eskiden sayfada
  duruyordu ve işlem yalnızca bir kod gönderiyordu; kod adres satırında
  taşındığı için dışarıdan uydurulabiliyordu (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  forbidden: yetkiYok("tema düzenleme"),
  "required-fields": "Hero ana başlığı ve açıklaması boş bırakılamaz.",
  "invalid-theme-image": "Bir görsel seçin. PNG, JPG, WebP veya AVIF olmalı ve 4 MB’ı geçmemeli.",
  "draft-not-found": "Kayıtlı taslak bulunamadı. Önce taslağı kaydedin.",
};

export const BASARILAR: Record<string, string> = {
  draft: "Taslak kaydedildi.",
  published: "Tema yayına alındı.",
  hero: "Görsel yüklendi.",
  banner: "Görsel yüklendi.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

/* Bilinmeyen anahtar OLDUĞU GİBİ geçiyor: görsel yuvalarının adı
   (${slot}) tabloda tek tek yazılı değil ve "hero yüklendi" demek
   yanlış olmaz. */
export const basariMetni = (kod: string): string => BASARILAR[kod] ?? "Kaydedildi.";
