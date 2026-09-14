import { isOrderClosed } from "./commerce-labels";

/*
  Sipariş akışı doğrusal: alındı → onaylandı → hazırlanıyor →
  kargoya verildi. Liste, detay ve toplu işlem aynı tanımı
  kullanıyor; bir ekranda "Onayla" diyen düğme diğerinde farklı
  bir adıma götürmesin.
*/
export const orderFlow = [
  { key: "pending", label: "Sipariş alındı" },
  { key: "confirmed", label: "Onaylandı" },
  { key: "processing", label: "Hazırlanıyor" },
  { key: "fulfilled", label: "Kargoya verildi" },
] as const;

/**
 * Bir sonraki adım. Kapanmış (iptal / iade) siparişte akış
 * durur: parası geri gitmiş sipariş hazırlanmaya davet edilmez.
 */
export function nextOrderStep(status?: string | null, paymentStatus?: string | null) {
  if (isOrderClosed(status, paymentStatus)) return null;
  if (status === "pending") return { key: "confirmed", label: "Onayla" };
  if (status === "confirmed") return { key: "processing", label: "Hazırlanıyor" };
  if (status === "processing") return { key: "fulfilled", label: "Kargoya ver" };
  return null;
}
