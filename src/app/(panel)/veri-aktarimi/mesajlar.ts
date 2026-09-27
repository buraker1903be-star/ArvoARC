/*
  Veri aktarımı ekranının işlem sonucu metinleri.

  Bu ekranda SAYILAR da adres satırında taşınıyordu
  (`?imported=120&errors=3`) ve sayfa onları olduğu gibi basıyordu: bir
  bağlantı, hiç çalışmamış bir aktarım için "120 ürün aktarıldı" yazdırıp
  kullanıcıyı katalogu aktarılmış sanmaya itebiliyordu. Sayılar artık
  mesajın içinde, çerezde geliyor (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  forbidden: "Aktarım için yetkiniz yok.",
  "csv-required": "Shopify Products dışa aktarımından bir .csv dosyası seçin.",
  "orders-csv-required": "Shopify Orders dışa aktarımından bir .csv dosyası seçin.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "Aktarım başlatılamadı. Lütfen tekrar deneyin.");
