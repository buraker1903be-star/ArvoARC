"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email/resend";
import { shippingNoticeHtml, statusUpdateEmail } from "@/lib/email/order-confirmation";
import { refundPayment } from "@/lib/paytr/refund";
import { requireTenant } from "@/lib/tenant";

const roles=new Set(["owner","admin","manager"]);
const orderStatuses=new Set(["pending","confirmed","processing","fulfilled","cancelled","refunded"]);
const paymentStatuses=new Set(["pending","authorized","paid","partially_refunded","refunded","failed"]);

export async function updateOrderStatus(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))redirect(`/siparisler/${orderId}?error=forbidden`);
  const status=String(formData.get("status")??"");
  const paymentStatus=String(formData.get("payment_status")??"");
  if(!orderId||!orderStatuses.has(status)||!paymentStatuses.has(paymentStatus))redirect(`/siparisler/${orderId}?error=invalid-status`);

  const {data:ownedOrder}=await supabase.from("arc_orders").select("id").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(!ownedOrder)redirect(`/siparisler/${orderId}?error=order-not-found`);
  const {error}=await supabase.rpc("arc_update_order_status",{p_order_id:orderId,p_status:status,p_payment_status:paymentStatus});

  /*
    Durum bildirimi.

    Yalnızca müşteriyi ilgilendiren durumlarda gönderilir:
    kargoya verildi, teslim edildi, iptal, iade. "Beklemede" ya
    da "onaylandı" gibi ara durumlarda e-posta atmak gürültü
    yaratır ve müşteri sonraki bildirimleri de görmezden gelir.

    Gönderim hatası durum güncellemesini başarısız saymaz.
  */
  if(!error){
    try{
      const {data:order}=await supabase.from("arc_orders").select("order_number,customer_name,customer_email").eq("id",orderId).single();
      const mail=statusUpdateEmail(status,order?.order_number??"",order?.customer_name||"değerli müşterimiz");
      if(order?.customer_email&&mail){
        await sendEmail({to:order.customer_email,...mail});
      }
    }catch(mailError){
      console.error("Durum bildirimi gönderilemedi:",mailError);
    }
  }
  if(error)redirect(`/siparisler/${orderId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");revalidatePath("/siparisler");revalidatePath("/stok");revalidatePath("/urunler");revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=1`);
}


type OrderMetadata={shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string;[key:string]:unknown};

export async function updateFulfillmentDetails(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))redirect(`/siparisler/${orderId}?error=forbidden`);
  const carrier=String(formData.get("shipping_carrier")??"").trim();
  const trackingNumber=String(formData.get("tracking_number")??"").trim();
  const trackingInput=String(formData.get("tracking_url")??"").trim();
  const internalNote=String(formData.get("internal_note")??"").trim();
  if(carrier.length>100||trackingNumber.length>160||internalNote.length>1000)redirect(`/siparisler/${orderId}?error=invalid-fulfillment`);
  let trackingUrl="";
  if(trackingInput){
    try{const parsed=new URL(trackingInput);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error();trackingUrl=parsed.toString();}
    catch{redirect(`/siparisler/${orderId}?error=invalid-tracking-url`);}
  }

  const {data:order,error:readError}=await supabase.from("arc_orders").select("metadata").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(readError||!order)redirect(`/siparisler/${orderId}?error=order-not-found`);
  const metadata=(order.metadata??{}) as OrderMetadata;
  const {error}=await supabase.from("arc_orders").update({metadata:{...metadata,shipping_carrier:carrier||null,tracking_number:trackingNumber||null,tracking_url:trackingUrl||null,internal_note:internalNote||null},updated_at:new Date().toISOString()}).eq("organization_id",organization.id).eq("id",orderId);

  /*
    Kargo bildirimi.

    Yalnızca takip numarası YENİ girildiğinde gönderilir: aynı
    siparişi tekrar kaydettiğinizde müşteriye ikinci bir e-posta
    gitmemeli.

    Gönderim hatası kaydetmeyi başarısız saymaz; bilgi zaten
    veritabanına yazıldı.
  */
  if(!error&&trackingNumber&&trackingNumber!==metadata.tracking_number){
    try{
      const {data:order}=await supabase.from("arc_orders").select("order_number,customer_name,customer_email").eq("id",orderId).single();
      if(order?.customer_email){
        await sendEmail({
          to:order.customer_email,
          subject:`Siparişiniz kargoda · ${order.order_number}`,
          html:shippingNoticeHtml({
            orderNumber:order.order_number,
            customerName:order.customer_name||"değerli müşterimiz",
            carrier:carrier||"Kargo",
            trackingNumber,
            trackingUrl:trackingUrl||null,
          }),
        });
      }
    }catch(mailError){
      console.error("Kargo bildirimi gönderilemedi:",mailError);
    }
  }
  if(error)redirect(`/siparisler/${orderId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/siparisler");revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=fulfillment`);
}

/**
 * Siparişi PayTR üzerinden iade eder.
 *
 * PayTR dokümanı yanlış entegrasyonun maddi kayba yol
 * açabileceğini vurguluyor. Bu yüzden:
 *
 *   - Tutar sunucuda hesaplanıyor, formdan gelen değere
 *     güvenilmiyor
 *   - Daha önce iade edilmiş sipariş tekrar iade edilemiyor
 *   - Ödenmemiş siparişte iade denenmiyor
 */
export async function refundOrder(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  /* İade yalnızca sahip ve yöneticide: parasal işlem. */
  if (!["owner", "admin"].includes(membership.role)) {
    redirect("/siparisler?error=forbidden");
  }

  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/siparisler?error=invalid-order");

  const { data: order } = await supabase
    .from("arc_orders")
    .select(
      "id,order_number,total,payment_status,status,metadata,customer_name,customer_email",
    )
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  if (!order) redirect("/siparisler?error=invalid-order");

  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  /*
    Önce "zaten iade edilmiş" kontrolü.

    Kısmi iadeden sonra ödeme durumu artık "partially_refunded"
    olduğu için sıralama ters olduğunda kullanıcı "Bu sipariş
    ödenmediği için iade edilemez" gibi yanlış bir mesaj
    görüyordu.
  */
  if (meta.refunded_at) {
    redirect(`/siparisler/${orderId}?error=already-refunded`);
  }

  if (order.payment_status !== "paid") {
    redirect(`/siparisler/${orderId}?error=not-paid`);
  }

  /*
    Kısmi iade formdan gelebilir ama sipariş tutarını aşamaz.
    Boş bırakılırsa tam iade yapılır.
  */
  const requested = Number(formData.get("amount") ?? 0);
  const amountKurus =
    requested > 0 ? Math.round(requested * 100) : (order.total ?? 0);

  if (amountKurus <= 0 || amountKurus > (order.total ?? 0)) {
    redirect(`/siparisler/${orderId}?error=invalid-amount`);
  }

  /*
    PayTR sipariş numarasını harf ve rakam dışındaki karakterler
    olmadan bekliyor; ödeme oluşturulurken de böyle gönderilmişti.
  */
  const merchantOid = order.order_number.replace(/[^A-Za-z0-9]/g, "");

  const result = await refundPayment({
    merchantOid,
    amountKurus,
    referenceNo: `ARC${orderId.replace(/-/g, "").slice(0, 12)}`,
  });

  if (!result.ok) {
    console.error("İade başarısız:", order.order_number, result.message);
    redirect(`/siparisler/${orderId}?error=refund-failed`);
  }

  const tamIade = amountKurus >= (order.total ?? 0);

  /*
    İade edilen sipariş akıştan çıkar.

    Öncesinde kısmi iadede `payment_status` "paid" bırakılıyor ve
    durum hiç değişmiyordu: parası geri gitmiş sipariş listede
    hâlâ "Bekliyor · Ödendi" görünüyor ve "Onayla →" düğmesiyle
    hazırlanmaya davet ediliyordu.

    Kargoya verilmemiş bir siparişin iadesi pratikte iptaldir;
    kargoya verilmişse ürün yola çıkmış demektir, durumu
    "Tamamlandı" kalır ve iade yalnızca ödeme tarafında görünür.
  */
  const kargolandi = order.status === "fulfilled";
  const yeniDurum = tamIade ? "refunded" : kargolandi ? order.status : "cancelled";

  const { error } = await supabase
    .from("arc_orders")
    .update({
      payment_status: tamIade ? "refunded" : "partially_refunded",
      status: yeniDurum,
      metadata: {
        ...meta,
        refunded_at: new Date().toISOString(),
        refunded_amount: amountKurus,
        refund_reference: result.reference ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", orderId);

  if (error) {
    /*
      Para iade edildi ama kayıt güncellenemedi. Sessizce
      geçmek tehlikeli: aynı sipariş ikinci kez iade edilebilir.
    */
    console.error(
      "İADE YAPILDI AMA KAYIT GÜNCELLENEMEDİ:",
      order.order_number,
      amountKurus,
      error.message,
    );
    redirect(`/siparisler/${orderId}?error=refund-recorded-failed`);
  }

  /* Müşteriye bildirim; hata iadeyi geçersiz kılmaz. */
  if (order.customer_email && tamIade) {
    try {
      const mail = statusUpdateEmail(
        "refunded",
        order.order_number,
        order.customer_name || "değerli müşterimiz",
      );
      if (mail) await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("İade bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=refund`);
}
