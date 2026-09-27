import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrderClosed } from "@/lib/commerce-labels";
import { kargoDurumu, kargoyaVerildiMi, type Gonderi, type SiparisKalemi } from "@/lib/kargo-bolme";

/*
  SİPARİŞİ "KARGOYA VERİLDİ"YE GEÇİRME.

  Önceden durumu elle değiştirmek gerekiyordu: etiket üretiliyor, müşteriye
  takip numarası gidiyor, ama sipariş panelde ve müşterinin hesabında hâlâ
  "Hazırlanıyor" görünüyordu. Aynı siparişe ikinci kez bakan operasyoncu
  gönderiyi tekrar oluşturmaya kalkıyordu.

  Gönderi oluşturan her yol buraya uğruyor (etiket üretimi, etiketi
  sonradan alma, durum güncelleme, elle gönderi girişi).

  E-POSTA GÖNDERMİYOR. Müşteriye zaten paket başına takip numaralı
  bildirim gidiyor (lib/kargo-bildirimi-gonder.ts); ayrıca genel bir
  "siparişiniz kargoya verildi" yollamak aynı olayı iki kez duyurmak
  olurdu ve ikincisinde takip numarası bulunmuyor.
*/
export async function siparisiKargoyaVerildiYap(
  supabase: SupabaseClient,
  organizationId: string,
  orderId: string,
): Promise<boolean> {
  try {
    const [{ data: order }, { data: kalemler }, { data: gonderiler }] = await Promise.all([
      supabase.from("arc_orders").select("id,status,payment_status")
        .eq("organization_id", organizationId).eq("id", orderId).maybeSingle(),
      supabase.from("arc_order_items").select("id,quantity,product_name")
        .eq("organization_id", organizationId).eq("order_id", orderId),
      supabase.from("arc_shipments").select("id,status,arc_shipment_items(order_item_id,quantity)")
        .eq("organization_id", organizationId).eq("order_id", orderId),
    ]);
    if (!order) return false;

    const gonderiListesi: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
      .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
    const durum = kargoDurumu((kalemler ?? []) as SiparisKalemi[], gonderiListesi);
    if (!kargoyaVerildiMi(order.status as string, durum, isOrderClosed(order.status as string, order.payment_status as string))) {
      return false;
    }

    const { error } = await supabase.from("arc_orders")
      .update({ status: "fulfilled", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("id", orderId);
    if (error) {
      console.error("Sipariş kargoya verildiye geçirilemedi:", error.message);
      return false;
    }

    /*
      Olay kaydı: durumu KİMİN değiştirdiği sorusu panelde sorulacak ve
      "kendiliğinden" cevabı ancak yazılıysa verilebilir. created_by boş
      bırakılıyor — bunu bir kullanıcı yapmadı.
    */
    await supabase.from("arc_order_events").insert({
      organization_id: organizationId,
      order_id: orderId,
      event_type: "status_updated",
      event_data: { new_status: "fulfilled", previous_status: order.status, source: "kargo" },
    });
    return true;
  } catch (hata) {
    /*
      Hata gönderiyi geçersiz saymıyor: etiket üretildi, kayıt yazıldı.
      Durum elle de değiştirilebilir, oysa hata dönmek operasyoncuyu
      ikinci bir etiket üretmeye iterdi.
    */
    console.error("Sipariş durumu güncellenemedi:", hata);
    return false;
  }
}
