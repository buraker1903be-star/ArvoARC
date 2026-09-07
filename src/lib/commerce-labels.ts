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
