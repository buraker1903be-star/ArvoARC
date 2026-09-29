import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  SİPARİŞ OLAYI KÜTÜĞÜ. PayTR bildirim ucundan çıkarıldı; Tami dönüşü
  de aynı kütüğe yazıyor.

  Olay yazımı ÇAĞIRANIN İŞİNİ BOZMAZ: ödeme kesinleşmesi birincil,
  kütük ikincil. Ama sessizce de geçilmiyor — panelde "ödeme alınmış
  ama sipariş kapanmamış" durumunun tek görünür izi bu kayıtlar.
*/
export async function recordOrderEvent(
  supabase: SupabaseClient,
  order: { id: string; organization_id: string },
  eventType: string,
  eventData: Record<string, string | number | boolean | null>,
) {
  const { error } = await supabase.from("arc_order_events").insert({
    organization_id: order.organization_id,
    order_id: order.id,
    event_type: eventType,
    event_data: eventData,
  });
  if (error) console.error("Sipariş olayı yazılamadı", { eventType, message: error.message });
}
