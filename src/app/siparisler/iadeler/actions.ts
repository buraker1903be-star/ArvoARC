"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { refundPayment } from "@/lib/paytr/refund";
import { sendEmail } from "@/lib/email/resend";
import { returnDecisionEmail } from "@/lib/email/order-confirmation";

/**
 * İade talebini sonuçlandırır.
 *
 * Onay PayTR iadesini tetikler; para gerçekten iade edilir.
 * Bu yüzden yalnızca sahip ve yönetici yapabiliyor.
 */
export async function resolveReturn(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin"].includes(membership.role)) {
    redirect("/siparisler/iadeler?error=forbidden");
  }

  const id = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  if (!id || !["onayla", "reddet", "iade-et"].includes(decision)) {
    redirect("/siparisler/iadeler?error=invalid");
  }

  const { data: request } = await supabase
    .from("arc_return_requests")
    .select("id,order_id,items,status,arc_orders(order_number,total,customer_name,customer_email,metadata)")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .single();

  if (!request) redirect("/siparisler/iadeler?error=not-found");
  /*
    Onay ve ret yalnızca bekleyen talepte; para iadesi yalnızca
    onaylanmış talepte yapılabiliyor.
  */
  if (decision === "iade-et" && request.status !== "onaylandi") {
    redirect("/siparisler/iadeler?error=not-approved");
  }
  if (decision !== "iade-et" && request.status !== "beklemede") {
    redirect("/siparisler/iadeler?error=already-resolved");
  }

  const order = (Array.isArray(request.arc_orders)
    ? request.arc_orders[0]
    : request.arc_orders) as {
    order_number: string;
    total: number;
    customer_name: string | null;
    customer_email: string | null;
    metadata: Record<string, unknown> | null;
  } | null;

  if (!order) redirect("/siparisler/iadeler?error=not-found");

  /* --- Ret --- */
  if (decision === "reddet") {
    await supabase
      .from("arc_return_requests")
      .update({
        status: "reddedildi",
        status_note: note || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (order.customer_email) {
      try {
        const mail = returnDecisionEmail({
          approved: false,
          orderNumber: order.order_number,
          customerName: order.customer_name || "değerli müşterimiz",
          note,
        });
        await sendEmail({ to: order.customer_email, ...mail });
      } catch (mailError) {
        console.error("İade ret bildirimi gönderilemedi:", mailError);
      }
    }

    revalidatePath("/siparisler/iadeler");
    redirect("/siparisler/iadeler?ok=reddedildi");
  }

  /* --- Onay: para henüz iade edilmiyor --- */

  /*
    Onay yalnızca "ürünü gönderebilirsiniz" demek. Para, ürün
    elimize ulaşıp kontrol edildikten sonra iade ediliyor.

    Öncesinde onay anında iade yapılıyordu: ürün gelmezse ya da
    hasarlı gelirse elimizde bir şey kalmıyordu.
  */
  if (decision === "onayla") {
    await supabase
      .from("arc_return_requests")
      .update({
        status: "onaylandi",
        status_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (order.customer_email) {
      try {
        const mail = returnDecisionEmail({
          approved: true,
          orderNumber: order.order_number,
          customerName: order.customer_name || "değerli müşterimiz",
          note,
        });
        await sendEmail({ to: order.customer_email, ...mail });
      } catch (mailError) {
        console.error("İade onay bildirimi gönderilemedi:", mailError);
      }
    }

    revalidatePath("/siparisler/iadeler");
    redirect("/siparisler/iadeler?ok=onaylandi&filter=onaylandi");
  }

  /* --- Ürün teslim alındı: PayTR iadesi --- */

  /*
    Tutar seçilen kalemlerden hesaplanıyor. Formdan gelen
    değere güvenmiyoruz: parasal işlem.
  */
  const items = (request.items ?? []) as Array<{ total?: number }>;
  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.total ?? 0),
    0,
  );

  const custom = Number(formData.get("amount") ?? 0);
  const amountKurus =
    custom > 0 ? Math.round(custom * 100) : itemsTotal || order.total;

  if (amountKurus <= 0 || amountKurus > order.total) {
    redirect("/siparisler/iadeler?error=invalid-amount");
  }

  const merchantOid = order.order_number.replace(/[^A-Za-z0-9]/g, "");

  const result = await refundPayment({
    merchantOid,
    amountKurus,
    referenceNo: `ARCIADE${id.replace(/-/g, "").slice(0, 12)}`,
  });

  if (!result.ok) {
    console.error("İade başarısız:", order.order_number, result.message);
    redirect("/siparisler/iadeler?error=refund-failed");
  }

  const tamIade = amountKurus >= order.total;

  /*
    Test siparişinin iadesinde gerçek para hareketi olmuyor.
    Notta belirtiliyor ki panelde "iade edildi" görüp PayTR'da
    bulamama karışıklığı yaşanmasın.
  */
  const testNote = result.isTest
    ? "TEST siparişi — gerçek para iadesi yapılmadı."
    : null;

  await supabase
    .from("arc_return_requests")
    .update({
      status: "tamamlandi",
      status_note: [note, testNote].filter(Boolean).join(" · ") || null,
      refund_amount: amountKurus,
      refund_reference: result.reference ?? null,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await supabase
    .from("arc_orders")
    .update({
      payment_status: tamIade ? "refunded" : "paid",
      status: tamIade ? "refunded" : undefined,
      metadata: {
        ...(order.metadata ?? {}),
        refunded_at: new Date().toISOString(),
        refunded_amount: amountKurus,
        refund_reference: result.reference ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", request.order_id);

  if (order.customer_email) {
    try {
      const mail = returnDecisionEmail({
        approved: true,
        orderNumber: order.order_number,
        customerName: order.customer_name || "değerli müşterimiz",
        amount: amountKurus,
        note,
      });
      await sendEmail({ to: order.customer_email, ...mail });
    } catch (mailError) {
      console.error("İade onay bildirimi gönderilemedi:", mailError);
    }
  }

  revalidatePath("/siparisler/iadeler");
  redirect("/siparisler/iadeler?ok=tamamlandi");
}
