import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoreBrand } from "@/lib/store-brand";
import { orderConfirmationHtml } from "@/lib/email/order-confirmation";
import { sendEmail } from "@/lib/email/resend";
import { siparisTelefonu, waSiparisBildirimi, waTutar } from "@/lib/whatsapp/bildirim";
import { arvoosBildirimi, bildirimTutari } from "@/lib/arvoos-bildirim";

/*
  SİPARİŞ ONAY E-POSTASI. PayTR bildirim ucunun içinden çıkarıldı:
  Tami dönüşü de aynı postayı gönderiyor ve ikinci bir kopya yazmak,
  birinde düzeltilen bir eksiğin ötekinde kalması demekti (bu depoda
  aynı kusuru fiyat doğrulamasında ve arama sorgusunda iki kez
  temizledik).

  Gönderim hatası çağıranın işini bozmamalı: posta ikincil bir iş,
  ödeme kesinleşmesi birincil.
*/
export async function sendOrderConfirmation(
  supabase: SupabaseClient,
  orderId: string,
) {
  const { data: order } = await supabase
    .from("arc_orders")
    .select(
      "order_number, customer_name, customer_email, subtotal, shipping, total, metadata, organization_id, public_token",
    )
    .eq("id", orderId)
    .single();

  if (!order?.customer_email) return;

  const { data: items } = await supabase
    .from("arc_order_items")
    .select("product_name, quantity, total")
    .eq("order_id", orderId);

  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const rawAddress = (meta.shipping_address ?? meta.address ?? {}) as Record<
    string,
    string | null
  >;

  const brand = await getStoreBrand(supabase, order.organization_id);
  const html = orderConfirmationHtml({
    brand,
    orderNumber: order.order_number,
    customerName: order.customer_name || "değerli müşterimiz",
    items: (items ?? []).map((item: {
      product_name: string;
      quantity: number;
      total: number;
    }) => ({
      name: item.product_name,
      quantity: item.quantity,
      total: item.total,
    })),
    subtotal: order.subtotal ?? 0,
    discount: Number(meta.discount ?? 0),
    shipping: order.shipping ?? 0,
    total: order.total ?? 0,
    address: {
      line: rawAddress.line ?? rawAddress.address1 ?? undefined,
      district: rawAddress.district ?? rawAddress.province ?? undefined,
      city: rawAddress.city ?? undefined,
      postal: rawAddress.postal ?? rawAddress.zip ?? undefined,
    },
    publicToken: order.public_token,
  });

  await sendEmail({
    from: brand.from,
    replyTo: brand.replyTo,
    to: order.customer_email,
    subject: `${brand.name} · siparişiniz alındı · ${order.order_number}`,
    html,
  });

  /*
    Aynı olayın WhatsApp'ı. Postadan SONRA ve ayrı: bildirim
    gönderimi postanın gitmesini engellememeli, hatası da buraya
    sızmamalı (lib/whatsapp/bildirim hiçbir zaman fırlatmıyor).
    Müşteri onayı yoksa gönderilmiyor, yalnızca kayda geçiyor.
  */
  await waSiparisBildirimi({
    organizationId: order.organization_id,
    orderId,
    anahtar: "siparis_alindi",
    numara: siparisTelefonu(order.metadata),
    metadata: order.metadata,
    degerler: {
      musteri: order.customer_name || "değerli müşterimiz",
      siparis_no: order.order_number,
      tutar: waTutar(order.total ?? 0),
    },
    paylasimAnahtari: order.public_token,
  });

  /*
    KURUM SAHİBİNİN PANELİNE. ArvoARC'ın kendi çekmecesi siparişi
    zaten sayıyor; bu satır ArvoOS panelini de haberdar ediyor —
    iki ürünü birlikte kullanan kiracı tek yere bakabilsin.

    Tekrar anahtarı sipariş kimliği: ödeme sağlayıcısı bildirimi
    yanıt alana kadar TEKRARLIYOR ve bu akış her tekrarda yeniden
    çalışabiliyor. Anahtarsız bırakılsa aynı sipariş için üç
    bildirim görünürdü.
  */
  await arvoosBildirimi({
    organizationId: order.organization_id,
    kategori: "arc_siparis",
    baslik: "Yeni sipariş",
    metin: `${order.order_number} · ${order.customer_name || "Müşteri"} · ${bildirimTutari(order.total ?? 0)}`,
    tekrarAnahtari: orderId,
    ekBilgi: { order_id: orderId, order_number: order.order_number },
  });
}

