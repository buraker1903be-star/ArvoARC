import { yetkiYok } from "@/lib/yetki-metni";

/*
  arc_create_order'ın HATALARI TÜRKÇEYE (16.10.2026).

  Manuel sipariş penceresi sunucu hatasını `hataMetni(error.message)`
  ile basıyor; tanınmayan ama içinde boşluk olan metin olduğu gibi
  ekrana gidiyor (lib/panel-bildirim.ts: uydurma kod basılmasın diye
  böyle). Sonuç: stoğu yetmeyen bir kalemde operasyoncu
  "Insufficient stock for SKU '20319" cümlesini görüyordu — panelin
  her yeri Türkçe, hatası İngilizce.

  SKU mesajın İÇİNDE geliyor ("Insufficient stock for SKU %"), yani
  eşleşme tam metin değil ön ek; hangi ürün olduğu cümlede kalıyor,
  yoksa on kalemli siparişte hangisi olduğu kaybolurdu.

  Saf fonksiyon; testi tests/siparis-hatasi.test.ts.
*/
const TAM: Record<string, string> = {
  "Authentication required": "Oturum doğrulanamadı. Çıkıp yeniden girin.",
  "Invalid order source": "Sipariş kaynağı geçersiz.",
  "Order must contain at least one item": "Siparişe en az bir kalem ekleyin.",
  "Invalid order item": "Kalem bilgileri geçersiz: ürün ve adet gerekli.",
  "Variant not found": "Seçilen varyant bulunamadı; liste yenilenmiş olabilir.",
  "All order items must belong to the same organization": "Kalemler aynı mağazaya ait olmalı.",
  "Insufficient permissions": yetkiYok("manuel sipariş oluşturma"),
  "Commerce module is disabled": "Satış modülü kapalı; manuel sipariş oluşturulamaz.",
};

/** Fonksiyonun İngilizce hatası → panel metni. Tanınmıyorsa null. */
export function siparisRpcHatasi(mesaj: string): string | null {
  const temiz = mesaj.trim();
  if (TAM[temiz]) return TAM[temiz];
  const stok = /^Insufficient stock for SKU (.+)$/.exec(temiz);
  if (stok) return `Stok yetmiyor: ${stok[1]}. Adedi düşürün ya da ürünün stoğunu güncelleyin.`;
  return null;
}
