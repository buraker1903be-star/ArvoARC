/**
 * İade edilecek tutarın hesabı.
 *
 * Panel ile sunucu aksiyonu aynı sayıyı üretmeli: ekranda
 * "540,00 iade edilecek" yazıp başka bir tutar göndermek,
 * parasal işlemde kabul edilebilir bir fark değil. Bu yüzden
 * hesap tek yerde duruyor ve iki taraf da buradan okuyor.
 */
export type RefundBreakdown = {
  /** İade edilecek toplam (kuruş). */
  amount: number;
  /** İade edilen kalemlerin toplamı (kuruş). */
  itemsTotal: number;
  /** Tutara eklenen kargo bedeli (kuruş). Kargo çıktıysa 0. */
  shippingRefund: number;
  /** Kargo çıkmış mı? */
  shipped: boolean;
};

export function calculateRefund(input: {
  /** İade edilen kalemlerin toplamı (kuruş). */
  itemsTotal: number;
  /** Siparişin tahsil edilen toplamı (kuruş). */
  orderTotal: number;
  /** Siparişte tahsil edilen kargo bedeli (kuruş). */
  shipping?: number | null;
  /** Siparişin durumu; "fulfilled" ise kargo çıkmıştır. */
  orderStatus?: string | null;
}): RefundBreakdown {
  const orderTotal = Math.max(0, Number(input.orderTotal) || 0);
  const itemsTotal = Math.max(0, Number(input.itemsTotal) || 0);

  /*
    Kargo çıkmadıysa kargo bedeli de iade edilir.

    Müşteri kargo parasını ödedi ama eline hiçbir şey geçmedi;
    o bedeli üstünde bırakmak haksız. Kargoya verilmişse bedel
    fiilen harcanmıştır, iadeye girmez.
  */
  const shipped = input.orderStatus === "fulfilled";
  const shipping = Math.max(0, Number(input.shipping) || 0);
  const shippingRefund = shipped ? 0 : shipping;

  /*
    Kalem toplamı okunamıyorsa (talep kaydında `total` alanı yoksa)
    kalemlerden hesap yapılamaz; siparişin tamamı esas alınır.
  */
  const raw = itemsTotal > 0 ? itemsTotal + shippingRefund : orderTotal;

  /* Tahsil edilenden fazlası hiçbir koşulda iade edilemez. */
  const amount = Math.min(raw, orderTotal);

  return { amount, itemsTotal, shippingRefund, shipped };
}
