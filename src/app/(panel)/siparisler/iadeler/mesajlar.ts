/*
  İade talepleri ekranının işlem sonucu metinleri. Metinler eskiden sayfada duruyordu
  ve işlem yalnızca bir kod gönderiyordu; kod adres satırında taşındığı
  için dışarıdan uydurulabiliyor, tanınmayan kod da olduğu gibi ekrana
  basılıyordu (lib/panel-bildirim.ts).
*/

export const ERRORS: Record<string, string> = {
  "refund-failed": "PayTR iadeyi reddetti. Sipariş numarası ve tutarı kontrol edin.",
  "already-resolved": "Bu talep zaten sonuçlandırılmış.",
  forbidden: "İade işlemi için yönetici yetkisi gerekiyor.",
  "invalid-amount": "Geçerli bir iade tutarı girin: sıfırdan büyük olmalı ve iade edilen kalemlerin (kargo çıkmadıysa kargo bedeli dahil) toplamını aşmamalı. Hesaplanan tutar için alanı boş bırakın.",
  "not-approved": "Para iadesi yalnızca onaylanmış talepte yapılabilir.",
  "already-refunded": "Bu sipariş zaten tamamen iade edilmiş.",
  "over-remaining": "Bu siparişte daha önce iade yapılmış; tutar, kalan iade edilebilir tutarı aşamaz.",
  "not-paid": "Sipariş ödenmemiş; para iadesi yapılamaz.",
  "transfer-order": "Havale siparişi PayTR'dan iade edilemez. Parayı bankadan iade edip siparişi elle kapatın.",
  busy: "Bu talep için iade zaten işleniyor. Sayfayı yenileyip durumu kontrol edin.",
  "save-failed": "Karar kaydedilemedi; müşteriye e-posta gönderilmedi. Tekrar deneyin.",
  "refund-recorded-failed": "İade yapıldı ancak kayıt güncellenemedi. PayTR panelinden doğrulayın; tekrar iade denemeyin.",
};

export const BASARILAR: Record<string, string> = {
  onaylandi: "İade talebi onaylandı.",
  reddedildi: "İade talebi reddedildi.",
  tamamlandi: "İade tamamlandı.",
};

export const hataMetni = (kod: string): string =>
  ERRORS[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
