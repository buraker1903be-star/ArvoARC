import { WA_SABLONLARI } from "@/lib/whatsapp/sablonlar";

/*
  SİPARİŞ DURUMU → WHATSAPP ŞABLONU.

  Karar neden burada, panel işleminin içinde değil: aynı olay iki
  kanaldan gidiyor (e-posta + WhatsApp) ve ikisi AYRI yerlerde
  yazıldığında kaçınılmaz olarak ayrışıyor. 17.10.2026'da tam bu
  olmuştu: personel takip numarası girmeden siparişi "kargoya
  verildi" yapınca e-posta gidiyor, WhatsApp gitmiyordu — tek
  kargo şablonu takip numarası istiyor, olmayan değerle de
  gönderilemiyordu. Müşteri aynı olayı bir kanalda öğrenip
  ötekinde öğrenemiyordu ve hiçbir yerde hata görünmüyordu.

  Artık karar saf bir fonksiyonda ve testi, e-postanın gönderdiği
  HER durumda burada da bir şablon olduğunu sabitliyor
  (tests/whatsapp-durum-anahtari.test.ts).

  SESSİZ KALAN DURUMLAR BİLİNÇLİ: `pending` ve `confirmed` müşteri
  için sipariş anından ayırt edilemiyor; her ara durumda mesaj
  atmak müşteriyi sonraki bildirimleri de görmezden gelmeye
  alıştırıyor. E-posta tarafında da aynı gerekçe yazılı.
*/
export function durumWaAnahtari(
  status: string,
  { trackingSent = false }: { trackingSent?: boolean } = {},
): string | null {
  switch (status) {
    case "processing":
      return "siparis_hazirlaniyor";
    case "fulfilled":
      /*
        Takip numarası girildiyse kargo bildirimi (siparis_kargoda)
        o anda zaten gitti; ikincisi gürültü. E-posta da aynı
        koşulda susuyor.
      */
      return trackingSent ? null : "siparis_kargolandi";
    case "cancelled":
      /*
        Ödenmemiş iptalde e-posta ayrı bir metin kullanıyor ("tutar
        alınmadı"). WhatsApp şablonu "Ödemeniz alınmışsa…" dediği
        için iki hâli de doğru karşılıyor; ikinci bir şablon
        onaylatmaya değmez.
      */
      return "siparis_iptal";
    case "refunded":
      return "iade_tamamlandi";
    default:
      return null;
  }
}

/** Bu dosyanın ürettiği her anahtarın şablonu olmalı. */
export const durumSablonlariTanimli = () =>
  ["processing", "fulfilled", "cancelled", "refunded"]
    .map((durum) => durumWaAnahtari(durum))
    .filter((anahtar): anahtar is string => Boolean(anahtar))
    .every((anahtar) => Boolean(WA_SABLONLARI[anahtar]));
