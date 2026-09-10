const labels = {
  product: {
    draft: "Taslak",
    active: "Aktif",
    archived: "Arşivlenmiş",
  },
  order: {
    pending: "Bekliyor",
    confirmed: "Onaylandı",
    processing: "Hazırlanıyor",
    fulfilled: "Tamamlandı",
    cancelled: "İptal",
    refunded: "İade",
  },
  payment: {
    pending: "Ödeme bekliyor",
    authorized: "Onaylandı",
    paid: "Ödendi",
    partially_refunded: "Kısmi iade",
    refunded: "İade edildi",
    failed: "Başarısız",
  },
  source: {
    native: "ARVO ARC",
    shopify: "Shopify arşivi",
  },
  importKind: {
    products: "Ürünler",
    orders: "Siparişler",
  },
  importStatus: {
    pending: "Bekliyor",
    processing: "İşleniyor",
    completed: "Tamamlandı",
    failed: "Hatalı",
  },
  inventoryKind: {
    in: "Stok girişi",
    out: "Stok çıkışı",
    adjustment: "Düzeltme",
    sale: "Satış",
    return: "İade",
    sync: "Senkronizasyon",
  },
} as const;

function resolveLabel(group: Record<string, string>, value?: string | null) {
  if (!value) return "—";
  return group[value] ?? value;
}

export const productStatusLabel = (value?: string | null) => resolveLabel(labels.product, value);
export const orderStatusLabel = (value?: string | null) => resolveLabel(labels.order, value);
export const paymentStatusLabel = (value?: string | null) => resolveLabel(labels.payment, value);
export const sourceLabel = (value?: string | null) => resolveLabel(labels.source, value);
export const importKindLabel = (value?: string | null) => resolveLabel(labels.importKind, value);
export const importStatusLabel = (value?: string | null) => resolveLabel(labels.importStatus, value);
export const inventoryKindLabel = (value?: string | null) => resolveLabel(labels.inventoryKind, value);

export const orderStatusOptions = Object.entries(labels.order);
export const paymentStatusOptions = Object.entries(labels.payment);

/**
 * Sipariş kapandı mı?
 *
 * Kapanmış sipariş akışta ilerlemez: iade edilmiş bir siparişi
 * "Onayla" ya da "Kargoya ver" diye önermek, parası geri gitmiş
 * ürünü göndermeye davet etmek demek.
 *
 * Kısmi iade de kapanma sayılıyor. Kısmi iade pratikte müşterinin
 * siparişin bir kısmından vazgeçmesi; kalan kalemler gönderilecekse
 * bu, sipariş detayından bilinçli olarak yapılmalı.
 */
export function isOrderClosed(status?: string | null, paymentStatus?: string | null) {
  return (
    status === "cancelled" ||
    status === "refunded" ||
    paymentStatus === "refunded" ||
    paymentStatus === "partially_refunded"
  );
}

/**
 * Listede ve detayda gösterilen durum rozeti.
 *
 * Tek yerden üretiliyor: öncesinde liste `data-tone="danger"`
 * kullanıyordu, detay `"bad"`. Tasarım sisteminde `danger` diye
 * bir ton yok, dolayısıyla iptal edilmiş sipariş listede
 * renksiz görünüyordu — yani gözden kaçması en kolay kayıt,
 * en görünmez olanıydı.
 */
export function orderBadge(status?: string | null, paymentStatus?: string | null) {
  /*
    İade edilmiş sipariş tek kelimeyle "İptal edildi" yazıyor.
    "İade · İade edildi" hem tekrar ediyordu hem de siparişin
    kapandığını söylemiyordu.
  */
  if (status === "cancelled" || status === "refunded" || paymentStatus === "refunded") {
    return { label: "İptal edildi", tone: "bad" as const };
  }
  if (paymentStatus === "partially_refunded") {
    return { label: "Kısmi iade", tone: "bad" as const };
  }
  if (paymentStatus === "failed") {
    return { label: "Ödeme başarısız", tone: "bad" as const };
  }

  const label = `${orderStatusLabel(status)} · ${paymentStatusLabel(paymentStatus)}`;

  if (paymentStatus === "pending" || paymentStatus === "authorized" || status === "pending") {
    return { label, tone: "warn" as const };
  }
  if (status === "fulfilled") {
    return { label, tone: "muted" as const };
  }
  return { label, tone: undefined };
}
