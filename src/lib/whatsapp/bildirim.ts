import "server-only";
import { waSablonGonder } from "@/lib/whatsapp/gonder";
import type { WaDegerleri } from "@/lib/whatsapp/sablonlar";

/*
  SİPARİŞ OLAYLARINDAN WHATSAPP BİLDİRİMİ.

  Postanın gönderildiği her yere ikinci bir blok yazmak yerine tek
  giriş noktası: onay denetimi, gönderim ve sonucun raporlanması
  burada. İki kopya yazılsaydı birinde düzeltilen bir eksik ötekinde
  kalırdı — bu depoda aynı kusur sipariş onay postasında, fiyat
  doğrulamasında ve vitrin fonksiyonlarında üç kez temizlendi.

  ÜÇ KURAL:

  1. HİÇBİR ZAMAN FIRLATMAZ. Bildirim ikincil iş; ödeme kesinleşmesi
     ya da kargo kaydı WhatsApp yüzünden durmamalı. Postada da aynı
     karar verilmişti (lib/siparis-onay-postasi).

  2. MESAJ KAYDI ARVOOS'TA, BURADA DEĞİL. Önceden her deneme
     arc_whatsapp_messages'a yazılıyordu; o tablo ArvoOS'taki
     whatsapp_messages'ın kopyasıydı ve "mesaj gitti mi" sorusunun
     iki ayrı yanıtı olurdu. Kapı her gönderimi (başarılı ve
     başarısız) kendi kütüğüne yazıyor, ArvoOS'un gelen kutusu
     ekranı oradan okuyor. Kapıya hiç ulaşmayan hâller — onay yok,
     kurulum eksik, numara bozuk — sunucu günlüğüne düşüyor:
     "neden mesaj gitmedi" sorusunun yanıtı yine bir yerde duruyor.

  3. ONAYSIZ GÖNDERİLMEZ. WhatsApp politikası işletmenin başlattığı
     mesaj için onay istiyor. Onay siparişin kaydında
     (metadata.whatsapp_onay); vitrindeki ödeme formunda müşteri
     işaretliyor ve kutucuk İŞARETSİZ başlıyor.
*/

type Durum = "gonderildi" | "basarisiz" | "yapilandirilmadi" | "onay_yok";

/** Siparişin kaydındaki onay işareti. */
export function whatsappOnayiVar(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return meta.whatsapp_onay === true || meta.whatsapp_onay === "true";
}

/**
 * Sipariş olayı için WhatsApp bildirimi gönderir.
 *
 * `numara` siparişin kaydındaki telefon; biçimi
 * lib/whatsapp/sablonlar içinde düzeltiliyor. Gönderen numara
 * KURUMA bağlı ve ArvoOS'ta duruyor (Ayarlar → Entegrasyonlar);
 * burada mağaza ayarından numara okunmuyor.
 */
export async function waSiparisBildirimi(input: {
  organizationId: string;
  orderId: string | null;
  anahtar: string;
  numara: string | null | undefined;
  metadata: unknown;
  degerler: WaDegerleri;
}): Promise<Durum> {
  const kim = `[whatsapp ${input.anahtar} sipariş=${input.orderId ?? "-"}]`;

  try {
    if (!whatsappOnayiVar(input.metadata)) {
      /* Beklenen hâl, kusur değil: müşteri kutucuğu işaretlememiş. */
      return "onay_yok";
    }

    const sonuc = await waSablonGonder({
      organizationId: input.organizationId,
      anahtar: input.anahtar,
      numara: input.numara,
      degerler: input.degerler,
    });

    if (sonuc.durum === "gonderildi") {
      if (sonuc.arvoNumarasinaDustu) {
        /*
          Mesaj gitti ama MAĞAZANIN numarasından değil Arvo'nun ortak
          numarasından: müşteri tanımadığı bir numaradan "siparişiniz
          kargoda" mesajı almış olur. Gönderim başarılı sayılıyor,
          ama sebebi görünür kalmalı — kurum numarasını bağlayınca
          kendiliğinden düzeliyor.
        */
        console.warn(`${kim} mağazanın numarası bağlı değil; Arvo'nun ortak numarasından gönderildi.`);
      }
      return "gonderildi";
    }
    if (sonuc.durum === "yapilandirilmadi") {
      console.warn(`${kim} gönderilmedi: ${sonuc.sebep}`);
      return "yapilandirilmadi";
    }
    console.error(`${kim} gönderilemedi: ${sonuc.hata}`);
    return "basarisiz";
  } catch (sebep) {
    /* Buraya düşmek bir kusur: gönderici kendi hatalarını sonuç
       olarak döndürüyor. Yine de akış durmasın. */
    console.error(`${kim} beklenmedik hata:`, (sebep as Error).message);
    return "basarisiz";
  }
}

/*
  Tutarın mesajda görünen biçimi. E-posta şablonu aynı biçimi kendi
  içinde kuruyor; WhatsApp için dördüncü bir kopya yazmamak adına
  burada tek satır, ama ikisi de aynı kuralı uyguluyor: kuruş
  tamsayıdan TL'ye, Türkçe ayırıcılarla.
*/
export const waTutar = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format((kurus ?? 0) / 100);

/** Siparişin kaydındaki telefon numarası (ödeme formundan geliyor). */
export function siparisTelefonu(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const dogrudan = typeof meta.phone === "string" ? meta.phone : null;
  if (dogrudan) return dogrudan;
  const adres = (meta.shipping_address ?? meta.address ?? {}) as Record<string, unknown>;
  return typeof adres.phone === "string" ? adres.phone : null;
}
