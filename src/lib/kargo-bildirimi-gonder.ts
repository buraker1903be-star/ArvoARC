import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { shipmentNoticeHtml } from "@/lib/email/shipment-notification";
import { getStoreBrand } from "@/lib/store-brand";
import { takipAdresi } from "@/lib/kargo-firmalari";
import { bildirilmeliMi, paketEtiketi, type BildirimGonderisi } from "@/lib/kargo-bildirimi";

/*
  MÜŞTERİYE KARGO BİLDİRİMİNİN GÖNDERİLMESİ.

  Dört yol aynı noktaya geliyor — etiket üretimi, etiketi sonradan alma,
  durum güncelleme ve elle gönderi girişi — ve hepsinde takip numarası
  ilk kez dolabiliyor. Karar ve gönderim tek yerde: dört ayrı kopyada
  "daha önce haber verdik mi" kontrolünü tutarlı yapmak mümkün değildi.

  GÖNDERİM HATASI İŞLEMİ BAŞARISIZ SAYMIYOR. Etiket üretildi, kayıt
  yazıldı; e-posta gitmedi diye kullanıcıya "işlem tamamlanamadı" demek,
  operasyoncuyu aynı etiketi yeniden üretmeye iter ve ikinci bir gönderi
  parası harcatır.
*/

type GonderiSatiri = BildirimGonderisi & {
  id: string;
  sequence: number;
  tracking_url: string | null;
  carrier_code: string | null;
  carrier_name: string | null;
  arc_shipment_items: { order_item_id: string; quantity: number }[] | null;
};

/**
 * Siparişin bildirilmemiş gönderileri için müşteriye e-posta gönderir.
 *
 * `yalnizcaGonderiId` verilirse yalnızca o paket bakılır; verilmezse
 * siparişin bütün paketleri taranır (durum güncellemesi birkaç pakete
 * birden takip numarası yazabiliyor).
 *
 * @returns gönderilen bildirim sayısı
 */
export async function kargoBildirimiGonder(
  supabase: SupabaseClient,
  organizationId: string,
  orderId: string,
  yalnizcaGonderiId?: string,
): Promise<number> {
  try {
    const [{ data: order }, { data: gonderiler }] = await Promise.all([
      supabase.from("arc_orders").select("order_number,customer_name,customer_email")
        .eq("organization_id", organizationId).eq("id", orderId).maybeSingle(),
      supabase.from("arc_shipments")
        .select("id,sequence,status,tracking_number,tracking_url,carrier_code,carrier_name,customer_notified_at,arc_shipment_items(order_item_id,quantity)")
        .eq("organization_id", organizationId).eq("order_id", orderId).order("sequence"),
    ]);
    if (!order?.customer_email) return 0;

    const hepsi = (gonderiler ?? []) as GonderiSatiri[];
    /*
      TOPLAM PAKET SAYISI iptal edilenler hariç sayılıyor: müşteriye
      "3 paketten 2." demek, üçüncüsü iptal edilmişken yanlış olurdu ve
      gelmeyecek bir paket beklettirirdi.
    */
    const gecerli = hepsi.filter((gonderi) => gonderi.status !== "cancelled");
    const toplam = gecerli.length;

    const bekleyen = gecerli.filter(
      (gonderi) => bildirilmeliMi(gonderi) && (!yalnizcaGonderiId || gonderi.id === yalnizcaGonderiId),
    );
    if (!bekleyen.length) return 0;

    // Kalem adları tek sorguda: paket başına sorgu, üç paketli siparişte üç tur demekti.
    const kalemIdleri = [...new Set(bekleyen.flatMap((g) => (g.arc_shipment_items ?? []).map((k) => k.order_item_id)))];
    const { data: kalemler } = kalemIdleri.length
      ? await supabase.from("arc_order_items").select("id,product_name")
          .eq("organization_id", organizationId).in("id", kalemIdleri)
      : { data: [] };
    const kalemAdi = new Map(((kalemler ?? []) as { id: string; product_name: string }[]).map((k) => [k.id, k.product_name]));

    const brand = await getStoreBrand(supabase, organizationId);
    let gonderilen = 0;

    for (const gonderi of bekleyen) {
      const takipNo = gonderi.tracking_number!.trim();
      const html = shipmentNoticeHtml({
        brand,
        orderNumber: (order.order_number as string) ?? "",
        customerName: (order.customer_name as string) || "değerli müşterimiz",
        carrier: gonderi.carrier_name?.trim() || null,
        trackingNumber: takipNo,
        /*
          Takip adresi elle girilen bağlantıyı tercih ediyor, yoksa firma
          şablonundan üretiliyor ve şablon yoksa null kalıyor: uydurma bir
          adres, müşteriyi çalışmayan bir bağlantıya götürürdü.
        */
        trackingUrl: gonderi.tracking_url?.trim() || takipAdresi(gonderi.carrier_code, takipNo),
        paketEtiketi: paketEtiketi(gonderi.sequence, toplam),
        kalemler: (gonderi.arc_shipment_items ?? []).map((kalem) => ({
          ad: kalemAdi.get(kalem.order_item_id) ?? "Ürün",
          adet: kalem.quantity,
        })),
        /*
          Kalan paket: bu siparişin HENÜZ BİLDİRİLMEMİŞ diğer paketleri.
          Yola çıkmış paketleri "kalan" saymak, müşteriye zaten haber
          verilmiş bir gönderiyi tekrar bekletirdi.
        */
        kalanPaketSayisi: gecerli.filter((diger) => diger.id !== gonderi.id && !diger.customer_notified_at).length,
      });

      await sendEmail({
        to: order.customer_email as string,
        subject: toplam > 1
          ? `Paketiniz kargoda · ${order.order_number} (${gonderi.sequence}/${toplam})`
          : `Siparişiniz kargoda · ${order.order_number}`,
        html,
        from: brand.from,
        replyTo: brand.replyTo,
      });

      /*
        Damga GÖNDERİMDEN SONRA yazılıyor: önce yazıp sonra göndermek,
        e-posta düşerse müşteriyi hiç haberdar edilmemiş bırakır ve bir
        daha denenmez.
      */
      await supabase.from("arc_shipments").update({ customer_notified_at: new Date().toISOString() })
        .eq("id", gonderi.id).eq("organization_id", organizationId);
      gonderilen += 1;
    }
    return gonderilen;
  } catch (hata) {
    console.error("Kargo bildirimi gönderilemedi:", hata);
    return 0;
  }
}
