/*
  Müşteriye kargo bildirimi kuralları. Saf modül; testi
  tests/kargo-bildirimi.test.ts.

  Bölünmüş kargoda bir siparişin birden çok paketi oluyor ve her paketin
  kendi takip numarası var. Bildirim GÖNDERİ BAŞINA gidiyor: tek bildirim
  göndermek, müşterinin eline siparişin bir kısmını alıp gerisini kayıp
  sanmasına yol açardı.
*/

export interface BildirimGonderisi {
  status: string;
  tracking_number: string | null;
  customer_notified_at: string | null;
}

/**
 * Bu gönderi için müşteriye haber verilmeli mi?
 *
 * Tek bir yerde toplanıyor çünkü dört ayrı yol aynı kararı veriyor:
 * etiket üretimi, etiketi sonradan alma, durum güncelleme ve elle
 * gönderi girişi.
 */
export function bildirilmeliMi(gonderi: BildirimGonderisi): boolean {
  // Takip numarası olmadan bildirimin söyleyeceği bir şey yok.
  if (!gonderi.tracking_number?.trim()) return false;
  // Aynı paket iki kez duyurulmaz; numara sonradan değişse bile.
  if (gonderi.customer_notified_at) return false;
  /*
    Taslak henüz OTO'da yok, iptal edilen gönderi yola çıkmayacak. İkisi
    için de "siparişiniz kargoda" demek yanlış bilgi.
  */
  return !["draft", "cancelled"].includes(gonderi.status);
}

/**
 * Paketin sipariş içindeki yeri: "3 paketten 2." gibi.
 *
 * Tek paketli siparişte hiç yazılmıyor — "1 paketten 1." demek, olmayan
 * bir bölünmeyi varmış gibi gösterir ve müşteriyi başka paket beklemeye
 * iter.
 */
export function paketEtiketi(sira: number, toplam: number): string | null {
  if (toplam <= 1 || sira < 1) return null;
  return `${toplam} paketten ${sira}.`;
}
