/*
  Ürün detayı ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS:Record<string,string>={
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-product":"Ürün adı ve ürün bağlantısı zorunlu.",
  "product-not-found":"Ürün bulunamadı.",
  "invalid-variant":"Varyant bilgilerini kontrol edin: SKU ve geçerli bir fiyat gerekli.",
  "23505":"Bu SKU veya ürün bağlantısı başka bir kayıtta kullanılıyor.",
  "invalid-images":"Tek seferde en fazla 5 görsel seçin.",
  "max-8-images":"Bir üründe en fazla 8 görsel olabilir.",
  "invalid-image-file":"Yalnızca JPG, PNG, WEBP, GIF veya AVIF; dosya başına en fazla 4 MB.",
  "invalid-image-path":"Geçersiz görsel.",
  "image-not-found":"Görsel bulunamadı.",
  /* Kopyalama: iki sınır da "aynı üründen çok fazla kopya" demek. */
  "copy-slug-full":"Bu üründen çok fazla kopya var; eski kopyaları arşivleyin.",
  "copy-sku-full":"Varyant kodları için boş numara kalmadı; eski kopyaları temizleyin.",
};

export const BASARILAR: Record<string, string> = {
  product: "Ürün bilgileri kaydedildi.",
  variant: "Varyant güncellendi.",
  "variant-created": "Varyant eklendi.",
  images: "Görseller yüklendi.",
  "image-removed": "Görsel kaldırıldı.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
