/*
  SİPARİŞ KÂRI. Saf modül; testi tests/siparis-kari.test.ts.

  Kâr = kalem geliri − kalem maliyeti.

  MALİYET SATIŞ ANINDA DONUYOR: arc_order_items.cost_price, kalem
  eklenirken tetikleyiciyle varyanttan kopyalanıyor
  (private.arc_order_item_cost, 20260927162152). Önce varyantın BUGÜNKÜ
  cost_price'ı okunuyordu ve tedarikçi fiyatı değişince geçmiş
  siparişlerin kârı da değişmiş görünüyordu; bu modül o değeri değil,
  çağıranın verdiği donmuş maliyeti kullanıyor.

  EKSİK MALİYETTE SAYI GÖSTERİLMİYOR. Bir kalemin maliyeti yoksa kâr
  olduğundan yüksek çıkar; yarım bir sayı, sayı olmamasından daha
  yanıltıcı — operasyoncu ona bakıp fiyat kararı verir.
*/

export interface KarKalemi {
  /** Kalemin satış geliri (kuruş). */
  toplamKurus: number;
  adet: number;
  /** Satış anında donmuş birim alış fiyatı (kuruş); bilinmiyorsa null. */
  maliyetKurus: number | null;
}

export interface KarSonucu {
  kurus: number;
  /** Kâr / gelir oranı, yüzde; gelir sıfırsa 0. */
  oran: number;
}

/*
  Kapanmış siparişte kâr YOK. İptal edilen sipariş hiç gerçekleşmedi;
  iade edilende para geri gitti. İkisini de kâra saymak ciroyu ve kâr
  toplamını şişirirdi — countsAsRevenue ile aynı kural.
*/
const KAPALI_DURUM = new Set(["cancelled", "refunded"]);

export function siparisKari(
  kalemler: KarKalemi[],
  durum: string | null | undefined,
  odemeDurumu: string | null | undefined,
): KarSonucu | null {
  if (!kalemler.length) return null;
  if (KAPALI_DURUM.has(durum ?? "") || odemeDurumu === "refunded") return null;
  /*
    Kısmi iade: gelirin bir kısmı geri gitti ama hangi kalemden gittiği
    kayıtlı değil. Kâr hesaplanamaz; tahmin yürütmek yanlış sayı
    üretirdi.
  */
  if (odemeDurumu === "partially_refunded") return null;

  let gelir = 0;
  let maliyet = 0;
  for (const kalem of kalemler) {
    // Maliyeti bilinmeyen tek kalem bile sonucu geçersiz kılıyor.
    if (kalem.maliyetKurus === null || !Number.isFinite(kalem.maliyetKurus)) return null;
    gelir += kalem.toplamKurus;
    maliyet += kalem.maliyetKurus * kalem.adet;
  }

  const kurus = gelir - maliyet;
  return { kurus, oran: gelir > 0 ? Math.round((kurus / gelir) * 1000) / 10 : 0 };
}
