/*
  Sipariş olaylarının tek etiket kaynağı.

  Önce iki ayrı yerde (panel akışı ve sipariş detayı) aynı mantık elle
  yazılmıştı ve ikisi de aynı biçimde kuruluydu:

    event_type === "status_updated" ? "durum güncellendi" : "kargo güncellendi"

  Yani "status_updated" DIŞINDAKİ HER olay, ne olursa olsun, "Kargo
  bilgileri güncellendi" olarak gösteriliyordu. Yeni bir olay türü eklemek
  panelde yanlış etiket üretiyordu — hiç göstermemekten daha kötüsü.

  Burada tanınmayan tür açıkça "tanınmayan" olarak gösterilir.
*/

export type OrderEventView = {
  kind: "status" | "shipping" | "payment" | "unknown";
  tone: "success" | "danger" | "muted";
  title: string;
  detail: string;
};

type EventData = Record<string, string | number | null | undefined>;

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export function describeOrderEvent(
  eventType: string,
  data: EventData,
  labels: {
    orderStatusLabel: (value: string | null | undefined) => string;
    paymentStatusLabel: (value: string | null | undefined) => string;
    money: (kurus: number) => string;
  },
): OrderEventView {
  if (eventType === "status_updated") {
    const next = text(data.new_status);
    const closed = next === "cancelled" || next === "refunded";
    return {
      kind: "status",
      tone: closed ? "danger" : "success",
      title: "Sipariş durumu güncellendi",
      detail: `${labels.orderStatusLabel(text(data.old_status))} → ${labels.orderStatusLabel(next)} · Ödeme: ${labels.paymentStatusLabel(text(data.new_payment_status))}`,
    };
  }

  /* PayTR bildirdiği tutar siparişin tutarını tutmuyor. Sipariş ÖDENDİ
     YAPILMAZ; bir insan bakmalı. */
  if (eventType === "payment_amount_mismatch") {
    const reported = Number(data.reported_amount ?? 0);
    const expected = Number(data.expected_amount ?? 0);
    return {
      kind: "payment",
      tone: "danger",
      title: "Ödeme tutarı siparişle uyuşmuyor",
      detail: `PayTR ${labels.money(reported)} bildirdi, sipariş ${labels.money(expected)}. Sipariş ödendi olarak işaretlenmedi.`,
    };
  }

  /* Bildirim geldi ama işlenemedi. Eskiden sessizce yutuluyordu: ödenmiş
     sipariş sonsuza kadar "ödeme bekliyor"da kalıyordu. */
  if (eventType === "payment_settle_failed") {
    return {
      kind: "payment",
      tone: "danger",
      title: "Ödeme bildirimi işlenemedi",
      detail: `${text(data.reason) || "Sebep kaydedilmedi"} · Ödeme alınmış olabilir, PayTR panelinden doğrulayın.`,
    };
  }

  /* Kargo olayı TÜR ADINA göre değil İÇERİĞE göre tanınıyor: olayları yazan
     arc_log_order_event tetikleyicisi bu depoda tanımlı değil (canlıda
     yaşıyor), yani tür adını varsayamayız. Kargo alanlarını taşıyan olay
     kargo olayıdır. */
  if (data.shipping_carrier !== undefined || data.tracking_number !== undefined) {
    return {
      kind: "shipping",
      tone: "muted",
      title: "Kargo bilgileri güncellendi",
      detail: `${text(data.shipping_carrier) || "Kargo firması yok"} · ${text(data.tracking_number) || "Takip numarası yok"}`,
    };
  }

  return {
    kind: "unknown",
    tone: "muted",
    title: "Sipariş olayı",
    detail: eventType || "Tür kaydedilmemiş",
  };
}
