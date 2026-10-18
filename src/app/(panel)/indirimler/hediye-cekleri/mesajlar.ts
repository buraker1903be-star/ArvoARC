import { yetkiYok } from "@/lib/yetki-metni";

/*
  Hediye çeki ekranının işlem sonucu metinleri.

  Metin işlemde çözülüp çereze yazılıyor (lib/panel-bildirim.ts);
  adres satırında kod taşımak, dışarıdan uydurulmuş bir mesajı
  kullanıcıya sistemin ürettiği gibi göstermeye açık kapı
  bırakıyordu (indirimler/mesajlar.ts'teki aynı gerekçe).
*/

export const ERRORS: Record<string, string> = {
  forbidden: yetkiYok("hediye çeki yönetimi"),
  "invalid-card": "Kod en az dört karakter ve tutar sıfırdan büyük olmalı.",
  "invalid-date": "Son kullanım tarihi geçersiz.",
  "past-date": "Son kullanım tarihi bugünden sonra olmalı.",
  "23505": "Bu kod başka bir hediye çekinde kullanılıyor.",
  "not-found": "Hediye çeki bulunamadı. Başka bir mağazaya ait olabilir.",
  invalid: "İstek anlaşılamadı. Sayfayı yenileyip tekrar deneyin.",
};

export const BASARILAR: Record<string, string> = {
  created: "Hediye çeki tanımlandı.",
  disabled: "Hediye çeki kapatıldı.",
  enabled: "Hediye çeki yeniden açıldı.",
};

/* Tanınmayan kod olduğu gibi basılmıyor: ham bir veritabanı kodu
   kullanıcıya hiçbir şey söylemiyor. */
export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
