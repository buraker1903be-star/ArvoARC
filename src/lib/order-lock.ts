import "server-only";
import type { requireTenant } from "./tenant";

/*
  Sipariş kilidi: para hareketi ve müşteri e-postası tetikleyen
  işlemler (iade, havale onayı, havale iptali) aynı siparişte aynı
  anda iki kez çalışmasın.

  Kilit siparişin metadata'sına zaman damgası olarak yazılır ve
  yazma, siparişin okunduğu andaki updated_at değerine koşulludur:
  - kilitten ÖNCE okuyan ikinci istek kilidi alamaz (updated_at değişti);
  - kilitten SONRA okuyan istek damgayı görüp durur.
  Öncesinde kilit yalnızca updated_at'i değiştiriyordu; kilit alındıktan
  sonra okuyan istek kontrollerden geçip PayTR'a ikinci iadeyi
  gönderebiliyordu.

  Damga ORDER_LOCK_MS sonra bırakılmış sayılır: işlem yarıda
  kesilirse sipariş sonsuza kadar kilitli kalmaz.
*/
type Client = Awaited<ReturnType<typeof requireTenant>>["supabase"];
export type OrderLockKey = "refund_lock" | "transfer_lock";

export const ORDER_LOCK_MS = 2 * 60_000;

/** Kilit hâlâ geçerli mi? */
export function isOrderLocked(metadata: unknown, key: OrderLockKey, now = Date.now()) {
  const stamp = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[key] : undefined;
  const at = Date.parse(String(stamp ?? ""));
  return Number.isFinite(at) && now - at < ORDER_LOCK_MS;
}

/** Kilit damgası çıkarılmış kopya (girdi değişmez). */
export function withoutLock(metadata: Record<string, unknown>, key: OrderLockKey) {
  const copy = { ...metadata };
  delete copy[key];
  return copy;
}

/**
 * Kilidi alır; alınan kilitle birlikte yazılan metadata'yı döner.
 * Başka bir istek kilidi tutuyorsa ya da sipariş okunduktan sonra
 * değiştiyse null döner.
 */
export async function claimOrderLock(
  supabase: Client,
  organizationId: string,
  order: { id: string; updated_at: string | null; metadata: unknown },
  key: OrderLockKey,
) {
  if (isOrderLocked(order.metadata, key)) return null;
  const now = new Date().toISOString();
  const metadata = { ...((order.metadata ?? {}) as Record<string, unknown>), [key]: now };
  const query = supabase.from("arc_orders").update({ metadata, updated_at: now }).eq("organization_id", organizationId).eq("id", order.id);
  const { data } = await (order.updated_at ? query.eq("updated_at", order.updated_at) : query.is("updated_at", null)).select("id");
  return data?.length ? metadata : null;
}

/** İşlem başarısız olunca kilidi bırakır. */
export async function releaseOrderLock(supabase: Client, organizationId: string, orderId: string, metadata: Record<string, unknown>, key: OrderLockKey) {
  await supabase
    .from("arc_orders")
    .update({ metadata: withoutLock(metadata, key), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", orderId);
}
