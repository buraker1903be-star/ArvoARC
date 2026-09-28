import { yetkiYok } from "@/lib/yetki-metni";

/*
  Stok ekranının işlem sonucu metinleri.

  NEDEN AYRI DOSYA. adjustInventory sonucu ADRES SATIRINA yazıyordu
  (?updated= / ?error=) ama sayfa çerezi okuyan PanelBildirimi'ni
  çiziyordu: stok girişi de çıkışı da, başarı da hata da EKRANDA HİÇ
  GÖRÜNMÜYORDU. Sayfadaki yorum bunu "buraya hata yazan bir işlem yok"
  diye yazıyordu, yani kusur kayda geçmiş bir varsayımla korunuyordu.

  Metinler burada tutuluyor çünkü kod adres satırında taşınırken
  dışarıdan uydurulabiliyor ve tanınmayan kod olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts); panelin geri kalanı da bu düzende.
*/

export const ERRORS: Record<string, string> = {
  forbidden: yetkiYok("stok hareketi"),
  "invalid-movement": "Hareket bilgilerini kontrol edin: varyant ve sıfırdan büyük bir adet gerekli.",
  "variant-not-found": "Varyant bulunamadı. SKU'yu kontrol edin.",
  "save-failed": "Stok hareketi kaydedilemedi. Lütfen tekrar deneyin.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
