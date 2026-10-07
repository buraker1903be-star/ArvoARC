import { yetkiYok } from "@/lib/yetki-metni";

/*
  Ayarlar ekranının işlem sonucu metinleri.

  Metinler eskiden SAYFADA duruyordu ve işlem yalnızca bir kod
  gönderiyordu (`?error=invalid-domain`). Kod adres satırında taşındığı
  için dışarıdan uydurulabiliyordu ve tanınmayan kod `ERRORS[kod] ?? kod`
  ile olduğu gibi ekrana basılıyordu. Artık metni işlem çözüp çereze
  yazıyor (lib/panel-bildirim.ts); tablo bu yüzden ortak bir yerde.
*/

export const SAVED:Record<string,string>={
  general:"Marka ayarları kaydedildi.",
  sales:"Satış ayarları kaydedildi.",
  payments:"Ödeme ayarları kaydedildi.",
  logo:"Logo yüklendi.",
  favicon:"Favicon yüklendi.",
  "logo-removed":"Logo kaldırıldı.",
  "favicon-removed":"Favicon kaldırıldı.",
  "panel-domain":"Panel alan adı kaydedildi. DNS kaydını ekleyip doğrulayın.",
  domain:"Mağaza alan adı kaydedildi.",
  "panel-domain-verified":"Panel alan adı doğrulandı; güvenli bağlantı etkin.",
  "storefront-domain-verified":"Mağaza alan adı doğrulandı; güvenli bağlantı etkin.",
};
export const ERRORS:Record<string,string>={
  forbidden: yetkiYok("mağaza ayarları"),
  "invalid-bank-transfer":"Havale için banka adı, hesap sahibi ve TR ile başlayan 26 haneli IBAN gerekli.",
  "paytr-merchant-required":"PayTR’ı açmak için mağaza numarası gerekli.",
  "garanti-merchant-required":"Garanti’yi açmak için işyeri (firma) kodu ve terminal numarası gerekli.",
  "garanti-key-pair-required":"PROVAUT şifresi ve 3D anahtarı (StoreKey) birlikte girilmeli.",
  "invalid-installment":"Taksit sayısı 0 ile 12 arasında olmalı.",
  "invalid-email-sender":"Gönderen adresi geçersiz. Ya düz adres yazın (siparis@alanadiniz.com) ya da \"Mağaza Adı <siparis@alanadiniz.com>\" biçiminde.",
  "file-required":"Bir dosya seçin.",
  "invalid-brand-file":"Dosya türü veya boyutu uygun değil.",
  "settings-required":"Önce marka ayarlarını kaydedin.",
  "invalid-asset":"Geçersiz dosya.",
  "invalid-panel-domain":"Geçerli bir alan adı girin (örn. app.markaniz.com).",
  "panel-storefront-domain-conflict":"Panel ve mağaza aynı alan adını kullanamaz.",
  "invalid-domain":"Geçerli bir alan adı girin (örn. markaniz.com).",
  "invalid-subdomain":"Alt alan adı yalnızca küçük harf, rakam ve tire içerebilir.",
  "domain-required":"Alt alan adı veya özel alan adı girin.",
  "panel-domain-required":"Önce panel alan adını kaydedin.",
  /* Kimin kullandığı söylenmez: mağazalar birbirinin varlığını öğrenmemeli. */
  "domain-in-use":"Bu alan adı başka bir mağazada kullanılıyor. Size ait olduğunu düşünüyorsanız bize bildirin.",
  "invalid-order-prefix":"Sipariş öneki 1-6 harf olmalı (rakam ve işaret olmaz). Örnek: AC.",
  "invalid-shipping-fee":"Kargo ücreti 0 ile 100.000 ₺ arasında olmalı.",
  "invalid-free-threshold":"Ücretsiz kargo eşiği 0 ile 1.000.000 ₺ arasında olmalı.",
  "invalid-transfer-discount":"Havale indirimi %0 ile %100 arasında olmalı.",
  "order-prefix-in-use":"Bu sipariş öneki başka bir mağazada kullanılıyor. Sipariş numaraları çakışmasın diye önek mağazaya özel olmalı.",
};
export const PENDING:Record<string,string>={
  "panel-dns-not-ready":"Panel DNS kaydı henüz görünmüyor. Kaydın yayılması birkaç dakika sürebilir; sonra tekrar doğrulayın.",
  "storefront-dns-not-ready":"Mağaza DNS kaydı henüz görünmüyor. Kaydın yayılması birkaç dakika sürebilir; sonra tekrar doğrulayın.",
};

/*
  PENDING bir HATA DEĞİL: DNS kaydının yayılmasını beklemek olağan bir
  durum ve kırmızı göstermek kullanıcıyı ayarları düzeltmeye, yani
  yanlış yere yönlendiriyordu.
*/
export const bekleyenMi = (kod: string): boolean => kod in PENDING;

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? PENDING[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => SAVED[kod] ?? kod;
