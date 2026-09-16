"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendEmail } from "@/lib/email/resend";
import { partialRefundEmail, shippingNoticeHtml, statusUpdateEmail } from "@/lib/email/order-confirmation";
import { notifyTransferPaid } from "@/lib/email/transfer-paid";
import { refundPayment } from "@/lib/paytr/refund";
import { isBankTransfer } from "@/lib/payment-method";
import { refundOutcome } from "@/lib/refund";
import { claimOrderLock, releaseOrderLock, withoutLock } from "@/lib/order-lock";
import { requireTenant } from "@/lib/tenant";
import { getStoreBrand } from "@/lib/store-brand";

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

  /* Önceki ödeme durumu da okunur: havalede "ödendi"ye geçiş müşteriye bildirilir. */
  const {data:ownedOrder}=await supabase.from("arc_orders").select("id,status,payment_status,metadata,total,order_number,customer_name,customer_email").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(!ownedOrder)redirect(`/siparisler/${orderId}?error=order-not-found`);
  /*
    Parayı hareket ettirmeden "iade edildi" işaretlemek, iade
    yetkisiyle aynı: yalnızca sahip ve yönetici. Mağaza yöneticisi
    bunu yapınca müşteriye "İadeniz tamamlandı" gidiyor, sipariş de
    gerçek iadeye kapanıyordu.
  */
  const marksRefund=(paymentStatus!==ownedOrder.payment_status&&["refunded","partially_refunded"].includes(paymentStatus))||(status==="refunded"&&ownedOrder.status!=="refunded");
  if(marksRefund&&!["owner","admin"].includes(membership.role))redirect(`/siparisler/${orderId}?error=forbidden`);
  const {error}=await supabase.rpc("arc_update_order_status",{p_order_id:orderId,p_status:status,p_payment_status:paymentStatus});

  /*
    Durum bildirimi.

    Yalnızca müşteriyi ilgilendiren durumlarda gönderilir:
    kargoya verildi, teslim edildi, iptal, iade. "Beklemede" ya
    da "onaylandı" gibi ara durumlarda e-posta atmak gürültü
    yaratır ve müşteri sonraki bildirimleri de görmezden gelir.

    Gönderim hatası durum güncellemesini başarısız saymaz.
  */
  /* Yalnızca durum gerçekten değiştiyse: yalnızca ödemeyi düzeltmek için yapılan kayıt aynı e-postayı tekrar göndermez. */
  if(!error&&status!==ownedOrder.status){
    try{
      const {data:order}=await supabase.from("arc_orders").select("order_number,customer_name,customer_email,metadata").eq("id",orderId).single();
      /* Takip numarası girildiyse takip bilgili kargo e-postası zaten gitti. */
      const trackingSent=Boolean((order?.metadata as {tracking_number?:string}|null)?.tracking_number);
      /* Ödenmemiş siparişin iptalinde iade vaadi yerine "tutar alınmadı" yazılır. */
      const unpaid=!["paid","partially_refunded","refunded"].includes(paymentStatus);
      const mail=statusUpdateEmail(status,order?.order_number??"",order?.customer_name||"değerli müşterimiz",await getStoreBrand(supabase,organization.id),{trackingSent,unpaid});
      if(order?.customer_email&&mail){
        await sendEmail({to:order.customer_email,...mail});
      }
    }catch(mailError){
      console.error("Durum bildirimi gönderilemedi:",mailError);
    }
  }
  /*
    Havalede ödeme panelden onaylanıyor. Ödeme "ödendi"ye geçince
    müşteriye "ödemeniz alındı" gider; kart ödemesinde bu bilgiyi
    PayTR onayıyla giden e-posta veriyor. Zaten ödenmiş siparişte
    yeniden kaydetmek ikinci e-posta göndermez.
  */
  if(!error&&ownedOrder.payment_status!=="paid"&&paymentStatus==="paid"&&isBankTransfer(ownedOrder.metadata)){
    await notifyTransferPaid(ownedOrder, await getStoreBrand(supabase, organization.id));
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
          brand: await getStoreBrand(supabase, organization.id),
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
      "id,order_number,total,payment_status,status,metadata,customer_name,customer_email,updated_at",
    )
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  if (!order) redirect("/siparisler?error=invalid-order");

  const meta = (order.metadata ?? {}) as Record<string, unknown>;

  /*
    Önce "zaten iade edilmiş" kontrolü; sıralama ters olduğunda
    kullanıcı "ödenmediği için iade edilemez" gibi yanlış bir mesaj
    görüyordu.

    Kısmi iadeden sonra sipariş açık kaldığı için kalan tutar da
    buradan iade edilebilir (örneğin sipariş sonradan iptal edilirse).
    İade tutarı kaydı olmayan eski iadeli siparişlerde kalan
    hesaplanamaz; onlar ikinci kez iade edilmez.
  */
  const alreadyRefunded = Math.max(0, Number(meta.refunded_amount ?? 0) || 0);
  const remaining = Math.max(0, (order.total ?? 0) - alreadyRefunded);
  if (order.payment_status === "refunded" || remaining <= 0 || (meta.refunded_at && alreadyRefunded <= 0)) {
    redirect(`/siparisler/${orderId}?error=already-refunded`);
  }

  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    redirect(`/siparisler/${orderId}?error=not-paid`);
  }

  /* Havale PayTR'dan geçmediği için PayTR'dan iade edilemez. */
  if (isBankTransfer(meta)) {
    redirect(`/siparisler/${orderId}?error=transfer-order`);
  }

  /*
    Kısmi iade formdan gelebilir ama iade edilebilir kalan tutarı
    aşamaz. Boş bırakılırsa kalanın tamamı iade edilir.
  */
  /*
    `Number.isFinite` kontrolü şart: "abc" ya da "1.234,56" gibi
    bir girdi `NaN` üretiyor ve `NaN > 0` false olduğu için
    sessizce tam iadeye düşülüyordu. Kullanıcı 50 ₺ yazdığını
    sanırken siparişin tamamı iade edilebiliyordu.
  */
  /* Yalnızca boş alan "tamamı" demek; "0", eksi ya da sayı olmayan girdi reddedilir (önceden tam iadeye düşüyordu). */
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const requested = Number(rawAmount.replace(",", "."));
  if (rawAmount && (!Number.isFinite(requested) || requested <= 0)) {
    redirect(`/siparisler/${orderId}?error=invalid-amount`);
  }
  const amountKurus = rawAmount ? Math.round(requested * 100) : remaining;

  if (amountKurus <= 0 || amountKurus > remaining) {
    redirect(`/siparisler/${orderId}?error=invalid-amount`);
  }

  /* PayTR her iadede ayrı referans görmeli; ilk iade eski biçimde kalır. */
  const priorRefunds = Math.max(Number(meta.refund_count ?? 0) || 0, alreadyRefunded > 0 ? 1 : 0);

  /*
    PayTR sipariş numarasını harf ve rakam dışındaki karakterler
    olmadan bekliyor; ödeme oluşturulurken de böyle gönderilmişti.
  */
  const merchantOid = order.order_number.replace(/[^A-Za-z0-9]/g, "");

  /* Sipariş iade için kilitlenir: çift tıklama ya da ikinci sekme aynı iadeyi PayTR'a iki kez göndermesin (bkz. lib/order-lock). */
  const lockedMeta = await claimOrderLock(supabase, organization.id, order, "refund_lock");
  if (!lockedMeta) redirect(`/siparisler/${orderId}?error=busy`);

  const result = await refundPayment({
    supabase,
    organizationId: organization.id,
    merchantOid,
    amountKurus,
    referenceNo: `ARC${orderId.replace(/-/g, "").slice(0, 12)}${priorRefunds ? `K${priorRefunds + 1}` : ""}`,
  });

  if (!result.ok) {
    await releaseOrderLock(supabase, organization.id, orderId, lockedMeta, "refund_lock");
    console.error("İade başarısız:", order.order_number, result.message);
    redirect(`/siparisler/${orderId}?error=refund-failed`);
  }

  /*
    Tamamı iade edilen sipariş kapanır; kısmi iadede sipariş olduğu
    adımda kalır ve kalan ürünler gönderilebilir (bkz. refundOutcome).
    Ödeme durumu her iki hâlde de değişir: parası kısmen geri gitmiş
    sipariş "Ödendi" görünmez.
  */
  const refundedTotal = alreadyRefunded + amountKurus;
  const outcome = refundOutcome({ orderTotal: order.total ?? 0, refundedTotal, status: order.status });

  const { error } = await supabase
    .from("arc_orders")
    .update({
      payment_status: outcome.paymentStatus,
      status: outcome.status,
      metadata: {
        ...withoutLock(lockedMeta, "refund_lock"),
        refunded_at: new Date().toISOString(),
        refunded_amount: refundedTotal,
        refund_count: priorRefunds + 1,
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
  if (order.customer_email) {
    try {
      const customerName = order.customer_name || "değerli müşterimiz";
      const mail = outcome.full
        ? statusUpdateEmail("refunded", order.order_number, customerName, await getStoreBrand(supabase, organization.id))
        : partialRefundEmail({
          brand: await getStoreBrand(supabase, organization.id), orderNumber: order.order_number, customerName, amount: amountKurus, shipped: order.status === "fulfilled" });
      if (mail) await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("İade bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=refund`);
}
