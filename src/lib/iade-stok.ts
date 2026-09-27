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
export function stogaDonecekler(kalemler: unknown): StogaDonecek[] {
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
  return [...toplu.entries()].map(([sku, adet]) => ({ sku, adet }));
}
