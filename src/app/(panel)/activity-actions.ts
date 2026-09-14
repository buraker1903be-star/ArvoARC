"use server";

import { cookies } from "next/headers";
import { requireTenant } from "@/lib/tenant";
import { inventoryKindLabel, orderBadge, orderStatusLabel } from "@/lib/commerce-labels";
import { DAY } from "@/lib/tr-time";
import { SEEN_COOKIE, type ActivityAlert, type ActivityFeed, type ActivityItem } from "@/lib/activity";

/* Operasyon merkeziyle aynı ölçütler. */
const PAYMENT = ["pending", "authorized", "failed"];
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const nowMs = () => Date.now();

type OrderRef = { order_number?: string | null; customer_name?: string | null };
const firstRef = (value: unknown): OrderRef => (Array.isArray(value) ? (value[0] ?? {}) : (value ?? {})) as OrderRef;

/**
 * Rozet: son görülmeden bu yana gelen sipariş ve iade talebi sayısı.
 * Çerez yoksa son 24 saat; en fazla 7 gün geriye bakılır.
 */
export async function activityUnread(): Promise<number> {
  const [{ supabase, organization }, store] = await Promise.all([requireTenant(), cookies()]);
  const now = nowMs();
  const raw = Number(store.get(SEEN_COOKIE)?.value);
  const seen = Number.isFinite(raw) && raw > 0 ? raw : now - DAY;
  const since = new Date(Math.max(seen, now - 7 * DAY)).toISOString();
  const [orders, returns] = await Promise.all([
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).gt("created_at", since),
    supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).gt("created_at", since),
  ]);
  return (orders.count ?? 0) + (returns.count ?? 0);
}

/**
 * Son 7 günün hareketleri ve dikkat gerektiren sayaçlar. Bir kaynak
 * okunamazsa diğerleri yine gösterilir; hepsi başarısızsa hata döner.
 */
export async function loadActivity(): Promise<ActivityFeed> {
  const { supabase, organization } = await requireTenant();
  const org = organization.id;
  const since = new Date(nowMs() - 7 * DAY).toISOString();

  const [orders, events, returns, movements, negative, payment, pendingReturns] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,total,status,payment_status,created_at").eq("organization_id", org).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    supabase.from("arc_order_events").select("id,order_id,event_type,event_data,created_at").eq("organization_id", org).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    supabase.from("arc_return_requests").select("id,status,reason,created_at,arc_orders(order_number,customer_name)").eq("organization_id", org).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabase.from("arc_inventory_movements").select("id,variant_id,kind,quantity,note,created_at").eq("organization_id", org).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", org).lt("stock", 0),
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", org).in("payment_status", PAYMENT).not("status", "in", "(cancelled,refunded)"),
    supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "beklemede"),
  ]);

  if (orders.error && events.error && returns.error && movements.error) {
    return { ok: false, error: "Bildirimler yüklenemedi. Lütfen tekrar deneyin." };
  }

  const orderRows = orders.error ? [] : (orders.data ?? []);
  const eventRows = events.error ? [] : (events.data ?? []);
  const movementRows = movements.error ? [] : (movements.data ?? []);

  /* Olayların sipariş numaraları: listede olmayan eski siparişler ayrıca okunur. */
  const orderNumbers = new Map(orderRows.map((order) => [order.id, order.order_number]));
  const missingOrderIds = [...new Set(eventRows.map((event) => event.order_id).filter((id) => id && !orderNumbers.has(id)))];
  const variantIds = [...new Set(movementRows.map((movement) => movement.variant_id).filter(Boolean))];
  const [extraOrders, variants] = await Promise.all([
    missingOrderIds.length ? supabase.from("arc_orders").select("id,order_number").eq("organization_id", org).in("id", missingOrderIds) : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
    variantIds.length ? supabase.from("arc_product_variants").select("id,sku").eq("organization_id", org).in("id", variantIds) : Promise.resolve({ data: [] as { id: string; sku: string | null }[] }),
  ]);
  for (const order of extraOrders.data ?? []) orderNumbers.set(order.id, order.order_number);
  const skus = new Map((variants.data ?? []).map((variant) => [variant.id, variant.sku]));

  const items: ActivityItem[] = [
    ...orderRows.map((order): ActivityItem => {
      const badge = orderBadge(order.status, order.payment_status);
      return {
        id: `order-${order.id}`, kind: "order", tone: "info", at: order.created_at, href: `/siparisler/${order.id}`,
        title: `Yeni sipariş ${order.order_number}`,
        detail: `${order.customer_name || "Misafir müşteri"} · ${money.format(order.total / 100)} · ${badge.label}`,
      };
    }),
    ...eventRows.map((event): ActivityItem => {
      const data = (event.event_data ?? {}) as Record<string, string | null>;
      const number = orderNumbers.get(event.order_id) ?? "Sipariş";
      if (event.event_type === "status_updated") {
        const closed = data.new_status === "cancelled" || data.new_status === "refunded";
        return {
          id: `event-${event.id}`, kind: "status", tone: closed ? "danger" : "success", at: event.created_at, href: `/siparisler/${event.order_id}`,
          title: `${number} · ${orderStatusLabel(data.new_status)}`,
          detail: `${orderStatusLabel(data.old_status)} → ${orderStatusLabel(data.new_status)}`,
        };
      }
      return {
        id: `event-${event.id}`, kind: "shipping", tone: "muted", at: event.created_at, href: `/siparisler/${event.order_id}`,
        title: `${number} · Kargo bilgisi güncellendi`,
        detail: `${data.shipping_carrier || "Kargo firması yok"} · ${data.tracking_number || "Takip numarası yok"}`,
      };
    }),
    ...(returns.error ? [] : (returns.data ?? [])).map((request): ActivityItem => {
      const ref = firstRef((request as { arc_orders?: unknown }).arc_orders);
      return {
        id: `return-${request.id}`, kind: "return", tone: request.status === "beklemede" ? "warning" : "muted", at: request.created_at,
        href: `/siparisler/iadeler?filter=${encodeURIComponent(request.status)}`,
        title: `İade talebi ${ref.order_number ?? ""}`.trim(),
        detail: `${ref.customer_name || "Müşteri"} · ${request.reason || "Neden belirtilmedi"}`,
      };
    }),
    ...movementRows.map((movement): ActivityItem => {
      const sku = skus.get(movement.variant_id) || "Silinmiş varyant";
      return {
        id: `stock-${movement.id}`, kind: "stock", tone: movement.quantity < 0 ? "warning" : "success", at: movement.created_at,
        href: `/stok?q=${encodeURIComponent(skus.get(movement.variant_id) ?? "")}`,
        title: `${sku} · ${inventoryKindLabel(movement.kind)}`,
        detail: `${movement.quantity > 0 ? "+" : ""}${movement.quantity.toLocaleString("tr-TR")} adet${movement.note ? ` · ${movement.note}` : ""}`,
      };
    }),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);

  const alerts: ActivityAlert[] = [
    ...(negative.count ? [{ key: "negative", label: "Eksi stok", detail: "Varyant stokları sıfırın altında", count: negative.count, href: "/stok?filter=negative", tone: "danger" as const }] : []),
    ...(payment.count ? [{ key: "payment", label: "Ödeme bekleyen sipariş", detail: "Ödemesi tamamlanmamış", count: payment.count, href: "/operasyon", tone: "warning" as const }] : []),
    ...(pendingReturns.count ? [{ key: "returns", label: "Bekleyen iade talebi", detail: "Yanıt bekliyor", count: pendingReturns.count, href: "/siparisler/iadeler", tone: "warning" as const }] : []),
  ];

  return { ok: true, items, alerts, loadedAt: nowMs() };
}
