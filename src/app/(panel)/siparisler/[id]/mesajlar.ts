/*
  Sipariş ekranının işlem sonucu metinleri.

  Neden ayrı dosya: metinler eskiden SAYFADA duruyordu ve işlem yalnızca
  bir kod gönderiyordu (`?error=not-paid`). Kod adres satırında taşındığı
  için dışarıdan uydurulabiliyordu ve tanınmayan kod `ERRORS[kod] ?? kod`
  ile olduğu gibi ekrana basılıyordu. Artık metni işlem çözüyor, çereze
  yazıyor ve sayfa yalnızca yazılanı gösteriyor — bu yüzden tablonun
  ikisinden de erişilebilir bir yerde olması gerekti.
*/

export const HATALAR: Record<string, string> = {
  "not-paid": "Bu sipariş ödenmediği için iade edilemez.",
  "already-refunded": "Bu sipariş zaten iade edilmiş.",
  "invalid-amount": "Geçerli bir iade tutarı girin: sıfırdan büyük olmalı ve iade edilebilir kalan tutarı aşmamalı. Tamamını iade etmek için alanı boş bırakın.",
  "refund-failed": "PayTR iade talebini reddetti. Ayrıntı için sunucu günlüklerine bakın.",
  "refund-recorded-failed": "İade yapıldı ancak sipariş kaydı güncellenemedi. PayTR panelinden doğrulayın; tekrar iade denemeyin.",
  "transfer-order": "Havale siparişi PayTR'dan iade edilemez. Parayı bankadan iade edip siparişi elle kapatın.",
  busy: "Bu sipariş için iade zaten işleniyor. Sayfayı yenileyip durumu kontrol edin.",
  "order-closed": "Bu sipariş kapandığı (iptal ya da iade) için akışta ilerletilemez.",
  "order-not-found": "Sipariş bulunamadı.",
  "invalid-order": "Sipariş bulunamadı.",
  forbidden: "Bu işlem için yetkiniz yok.",
  "invalid-status": "Geçersiz sipariş durumu.",
  "invalid-fulfillment": "Kargo bilgileri çok uzun.",
  "invalid-tracking-url": "Takip bağlantısı https:// ile başlayan geçerli bir adres olmalı.",
  "save-failed": "Durum kaydedilemedi, tekrar deneyin.",
  "not-transfer": "Bu sipariş havale ile verilmemiş; kart ödemeleri PayTR bildirimiyle kapanır.",
  "already-paid": "Bu siparişin ödemesi zaten onaylanmış.",
  "in-progress": "Bu sipariş az önce başka bir sekmeden ya da kullanıcı tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.",
  // Gönderi (bölünmüş kargo) işlemleri
  "gonderi-bulunamadi": "Gönderi bulunamadı.",
  "gonderi-zaten-olusturuldu": "Bu gönderi zaten oluşturulmuş; yeni etiket için yeni bir taslak açın.",
  "gonderi-olusturulamadi": "Gönderi kaydı oluşturulamadı.",
  "kargo-firmasi-gecersiz": "Geçersiz kargo firması.",
  "takip-numarasi-gerekli": "Tedarikçinin kendi gönderdiği kayıtta takip numarası zorunlu.",
  "tryoto-kapali": "tryOTO entegrasyonu kapalı ya da anahtar girilmemiş. Ayarlar → Kargo altyapısı bölümünden açın.",
};

export const BASARILAR: Record<string, string> = {
  fulfillment: "Kargo ve operasyon bilgileri kaydedildi.",
  refund: "İade tamamlandı.",
  payment: "Havale ödemesi onaylandı. Müşterinin e-posta adresi varsa “Ödemeniz alındı” bildirimi gönderildi.",
  cancelled: "Sipariş iptal edildi. Müşterinin e-posta adresi varsa “Siparişiniz iptal edildi” bildirimi gönderildi.",
  gonderi: "Gönderi kaydedildi.",
  "gonderi-iptal": "Gönderi iptal edildi; kalemleri yeniden bölünebilir.",
  taslak: "Gönderi taslağı oluşturuldu. Ağırlık ve ölçüyü girip fiyatları sorun.",
  etiket: "Etiket üretildi.",
  "etiket-alindi": "Etiket alındı.",
  durum: "Sipariş durumu güncellendi.",
  teslim: "Gönderi teslim edildi olarak işaretlendi.",
};

/*
  TANINMAYAN KOD OLDUĞU GİBİ BASILMIYOR. Veritabanından gelen ham hata
  mesajları (`error.message`) zaten metin olarak geçiyor; kod gibi
  görünen ama tabloda olmayan bir değer genel mesaja düşüyor, çünkü
  ekranda "23505" yazması kullanıcıya hiçbir şey söylemiyor.
*/
export const hataMetni = (kod: string): string =>
  HATALAR[kod] ?? (kod.includes(" ") ? kod : "İşlem tamamlanamadı. Lütfen tekrar deneyin.");

export const basariMetni = (kod: string): string => BASARILAR[kod] ?? kod;
