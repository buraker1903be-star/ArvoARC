import { yetkiYok } from "@/lib/yetki-metni";

/*
  İndirimler ekranının işlem sonucu metinleri.

  Metinler eskiden SAYFADA duruyordu ve işlem yalnızca bir kod
  gönderiyordu. Kod adres satırında taşındığı için dışarıdan
  uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana basılıyordu.
  Artık metni işlem çözüp çereze yazıyor (lib/panel-bildirim.ts).
*/

export const ERRORS:Record<string,string>={
  forbidden: yetkiYok("indirim yönetimi"),
  "invalid-discount":"Kampanya adı, türü ve geçerli bir indirim değeri gerekli.",
  "23505":"Bu kupon kodu başka bir kampanyada kullanılıyor.",
  "invalid-date":"Başlangıç veya bitiş tarihi geçersiz.",
  "invalid-range":"Bitiş tarihi başlangıçtan sonra olmalı.",
  "not-found":"Kampanya bulunamadı. Silinmiş olabilir ya da başka bir mağazaya ait.",
  invalid:"İstek anlaşılamadı. Sayfayı yenileyip tekrar deneyin.",
};

export const BASARILAR: Record<string, string> = {
  created: "İndirim paketi oluşturuldu.",
  status: "İndirim durumu güncellendi.",
  deleted: "İndirim paketi silindi.",
  updated: "Kampanya güncellendi.",
};

/* Tanınmayan kod olduğu gibi basılmıyor: ham bir veritabanı kodu
   kullanıcıya hiçbir şey söylemiyor. Boşluk içeren değer zaten metindir
   (error.message), olduğu gibi geçiyor. */
export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
