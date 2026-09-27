/*
  İADE EDİLEN ÜRÜNÜN STOĞA DÖNÜŞÜ. Saf modül; testi tests/iade-stok.test.ts.

  İade akışında stok hiç güncellenmiyordu: müşteri ürünü geri
  gönderiyor, para iade ediliyor, ama sistem ürünü hâlâ satılmış
  sayıyordu. Sipariş iptalinde stok geri veriliyor
  (arc_update_order_status), iadede verilmiyordu — aynı fiziksel olay,
  iki farklı sonuç.

  KARAR OPERASYONCUNUN: geri gelen ürün hasarlıysa ya da açılmışsa
  stoğa girmemeli ve bunu sistem bilemez. Bu yüzden iade ekranında
  onay kutusu var; burası yalnızca hangi kalemlerin ne kadar
  döneceğini çözüyor.
*/

export interface StogaDonecek {
  sku: string;
  adet: number;
}

/**
 * İade talebinin kalemlerinden stoğa dönecek olanlar.
 *
 * SKU'su ya da geçerli adedi olmayan kalem atlanıyor: iade talebi
 * müşteri tarafında oluşuyor ve kalemler jsonb olarak saklanıyor, yani
 * şekli veritabanı tarafından güvence altında değil.
 */
export interface SiparisKalemi {
  sku: string | null;
  quantity: number;
}

/**
 * İade talebinin kalemlerinden stoğa dönecekler.
 *
 * SİPARİŞİN KALEMLERİYLE SINIRLANIYOR. arc_return_requests.items
 * müşterinin tarayıcısından geliyor ve RPC onu doğrulamadan saklıyor
 * (create_arvoculture_return_request → coalesce(p_items, '[]')), yani
 * istenen SKU ve adet gönderilebilir. Para tarafı sipariş toplamıyla
 * sınırlı olduğu için korunuyordu; stok tarafında böyle bir sınır
 * yoktu ve {sku:"X", quantity:9999} stoğu şişirebilirdi.
 *
 * `siparisKalemleri` verilmezse sınır uygulanmıyor: eski çağrılar için
 * değil, yalnızca birim testinde saf davranışı görmek için.
 */
export function stogaDonecekler(kalemler: unknown, siparisKalemleri?: SiparisKalemi[]): StogaDonecek[] {
  if (!Array.isArray(kalemler)) return [];
  const toplu = new Map<string, number>();
  for (const ham of kalemler) {
    if (!ham || typeof ham !== "object") continue;
    const kayit = ham as Record<string, unknown>;
    const sku = typeof kayit.sku === "string" ? kayit.sku.trim() : "";
    if (!sku) continue;
    const adet = Number(kayit.quantity);
    // Sıfır ve eksi adet stoğu bozar; kesirli adet varyantta anlamsız.
    if (!Number.isInteger(adet) || adet <= 0) continue;
    /*
      Aynı SKU birden çok satırda gelebiliyor (farklı sebeplerle iade
      edilen aynı ürün); tek harekette toplanıyor ki stok kütüğünde
      ikiye bölünmüş görünmesin.
    */
    toplu.set(sku, (toplu.get(sku) ?? 0) + adet);
  }
  if (!siparisKalemleri) return [...toplu.entries()].map(([sku, adet]) => ({ sku, adet }));

  /* Siparişte o SKU'dan kaç adet var: aynı SKU birden çok satırda olabilir. */
  const siparistekiAdet = new Map<string, number>();
  for (const kalem of siparisKalemleri) {
    const sku = (kalem.sku ?? "").trim();
    if (!sku) continue;
    const adet = Number(kalem.quantity);
    if (!Number.isFinite(adet) || adet <= 0) continue;
    siparistekiAdet.set(sku, (siparistekiAdet.get(sku) ?? 0) + adet);
  }

  const sonuc: StogaDonecek[] = [];
  for (const [sku, adet] of toplu) {
    const sinir = siparistekiAdet.get(sku);
    // Siparişte olmayan SKU hiç eklenmiyor.
    if (!sinir) continue;
    sonuc.push({ sku, adet: Math.min(adet, sinir) });
  }
  return sonuc;
}
