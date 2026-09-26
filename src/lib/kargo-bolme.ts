/*
  BÖLÜNMÜŞ KARGO — bir siparişin kalemlerini birden çok gönderiye ayırma
  mantığı. Saf modül; testi tests/kargo-bolme.test.ts.

  Neden bölünüyor: bir siparişin kalemleri farklı kargo firmalarına
  verilebiliyor (kırılgan ürün bir firmaya, ağır ürün başkasına) ve her
  parçanın kendi takip numarası oluyor. tryOTO'nun modeli de bunu dayatıyor:
  createShipment tek bir orderId alıyor, yani bir ArvoARC siparişini ikiye
  bölmek OTO'da iki ayrı sipariş açmak demek.

  BURASI YALNIZCA HESAP YAPAR. Adet bütünlüğünün asıl koruması veritabanı
  tetikleyicisinde (arvo_arc_shipment_item_guard): panelin oturum jetonu
  tarayıcıda ve bu tabloya yazma yetkisi olan biri API'den doğrudan istediği
  adedi gönderebilir. Buradaki denetim kullanıcıya anlaşılır mesaj vermek
  içindir, güvenlik sınırı değildir.
*/

/** İptal edilen gönderinin kalemleri yeniden bölünebilir sayılır. */
export const IPTAL = "cancelled";

export interface SiparisKalemi {
  id: string;
  quantity: number;
  product_name: string;
}

export interface GonderiKalemi {
  order_item_id: string;
  quantity: number;
}

export interface Gonderi {
  id: string;
  status: string;
  items: GonderiKalemi[];
}

/** Yeni gönderi için kullanıcının seçtiği adetler: kalem kimliği → adet. */
export type Secim = Record<string, number>;

/**
 * Her sipariş kalemi için HENÜZ KARGOYA VERİLMEMİŞ adet.
 *
 * İptal edilmiş gönderiler sayılmıyor: yanlış firmaya verilip iptal edilen
 * bir gönderi siparişi sonsuza kadar kilitlerdi.
 */
export function kalanAdetler(kalemler: SiparisKalemi[], gonderiler: Gonderi[]): Map<string, number> {
  const kalan = new Map(kalemler.map((kalem) => [kalem.id, kalem.quantity]));
  for (const gonderi of gonderiler) {
    if (gonderi.status === IPTAL) continue;
    for (const satir of gonderi.items) {
      const onceki = kalan.get(satir.order_item_id);
      // Siparişte olmayan bir kaleme ait satır yok sayılıyor: veri bozulmuşsa
      // hesabı durdurmak yerine görünen kalemler üzerinden devam ediliyor.
      if (onceki === undefined) continue;
      kalan.set(satir.order_item_id, onceki - satir.quantity);
    }
  }
  return kalan;
}

/**
 * Seçim geçerliyse null, değilse kullanıcıya gösterilecek Türkçe sebep.
 * Tek tek değil TOPLU bakılıyor: kullanıcı üç kalemi birden seçmişse üç kez
 * kaydete basıp üç ayrı hata görmemeli.
 */
export function bolmeSorunu(secim: Secim, kalemler: SiparisKalemi[], gonderiler: Gonderi[]): string | null {
  const girisler = Object.entries(secim).filter(([, adet]) => adet > 0);
  if (!girisler.length) return "Gönderiye en az bir ürün ekleyin.";

  const kalan = kalanAdetler(kalemler, gonderiler);
  const adlar = new Map(kalemler.map((kalem) => [kalem.id, kalem.product_name]));

  for (const [kalemId, adet] of girisler) {
    if (!Number.isInteger(adet)) return `${adlar.get(kalemId) ?? "Ürün"}: adet tam sayı olmalı.`;
    const kalanAdet = kalan.get(kalemId);
    if (kalanAdet === undefined) return "Seçilen ürün bu siparişte yok.";
    if (adet > kalanAdet) {
      return kalanAdet > 0
        ? `${adlar.get(kalemId)}: kargoya verilebilecek ${kalanAdet} adet kaldı, ${adet} seçildi.`
        : `${adlar.get(kalemId)}: bu ürünün tamamı kargoya verilmiş.`;
    }
  }
  return null;
}

export type KargoDurumu = "yok" | "kismi" | "tamam";

/**
 * Siparişin kargo durumu gönderilerden TÜRETİLİYOR, ayrı bir sütunda
 * tutulmuyor: iki kaynak zamanla ayrışır ve hangisinin doğru olduğu
 * belirsizleşir.
 */
export function kargoDurumu(kalemler: SiparisKalemi[], gonderiler: Gonderi[]): KargoDurumu {
  if (!kalemler.length) return "yok";
  const kalan = kalanAdetler(kalemler, gonderiler);
  const toplamKalan = [...kalan.values()].reduce((toplam, adet) => toplam + Math.max(adet, 0), 0);
  const toplamSiparis = kalemler.reduce((toplam, kalem) => toplam + kalem.quantity, 0);
  if (toplamKalan === toplamSiparis) return "yok";
  return toplamKalan === 0 ? "tamam" : "kismi";
}

/*
  tryOTO durumları → ArvoARC gönderi durumu.

  OTO kendi akışında daha ayrıntılı adımlar kullanıyor (arrivedTerminal,
  outForDelivery…); panelde bunların hepsi "yolda" olarak okunuyor, çünkü
  operasyoncunun kararını değiştiren üç şey var: çıktı mı, teslim edildi mi,
  bir sorun mu var.

  Bilinmeyen durum 'in_transit' sayılıyor: OTO yeni bir adım eklediğinde
  gönderi "taslak"a düşüp kullanıcıyı yeniden oluşturmaya itmemeli. Ham
  değer ayrıca saklanıyor (arc_shipments.failure_reason değil, olay
  geçmişi), yani kaybolmuyor.
*/
export const OTO_DURUM_ESLEME: Record<string, string> = {
  new: "created",
  created: "created",
  pickupRequested: "created",
  pickedUp: "picked_up",
  inTransit: "in_transit",
  arrivedTerminal: "in_transit",
  outForDelivery: "in_transit",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  returned: "failed",
  failed: "failed",
  lost: "failed",
};

export function otoDurumunuCevir(otoDurumu: string | null | undefined): string {
  if (!otoDurumu) return "created";
  return OTO_DURUM_ESLEME[otoDurumu] ?? "in_transit";
}
