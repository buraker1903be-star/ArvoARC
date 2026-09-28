"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { stogaDonecekler } from "@/lib/iade-stok";
import { getStoreBrand } from "@/lib/store-brand";
import { refundPayment } from "@/lib/paytr/refund";
import { sendEmail } from "@/lib/email/resend";
import { returnDecisionEmail } from "@/lib/email/order-confirmation";
import { calculateRefund, refundOutcome } from "@/lib/refund";
import { isBankTransfer } from "@/lib/payment-method";
import { claimOrderLock, releaseOrderLock, withoutLock } from "@/lib/order-lock";

/**
 * İade talebini sonuçlandırır.
 *
 * Onay PayTR iadesini tetikler; para gerçekten iade edilir.
 * Bu yüzden yalnızca sahip ve yönetici yapabiliyor.
 */
export async function resolveReturn(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin"].includes(membership.role)) {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("forbidden")});
  }

  const id = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  if (!id || !["onayla", "reddet", "iade-et"].includes(decision)) {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("invalid")});
  }

  const { data: request } = await supabase
    .from("arc_return_requests")
    .select("id,order_id,items,status,updated_at,arc_orders(order_number,status,payment_status,total,shipping,customer_name,customer_email,metadata,updated_at)")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .single();

  if (!request) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("not-found")});
  /*
    Onay ve ret yalnızca bekleyen talepte; para iadesi yalnızca
    onaylanmış talepte yapılabiliyor.
  */
  if (decision === "iade-et" && request.status !== "onaylandi") {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("not-approved")});
  }
  if (decision !== "iade-et" && request.status !== "beklemede") {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("already-resolved")});
  }

  const order = (Array.isArray(request.arc_orders)
    ? request.arc_orders[0]
    : request.arc_orders) as {
    order_number: string;
    status: string;
    payment_status: string | null;
    total: number;
    shipping: number | null;
    customer_name: string | null;
    customer_email: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
  } | null;

  if (!order) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("not-found")});

  /* --- Ret --- */
  /*
    Ret ve onay yalnızca hâlâ bekleyen talepte yazılır ve sonucu
    kontrol edilir. Öncesinde kayıt başarısız olsa da müşteriye
    karar e-postası gidiyordu; iki sekmeden verilen iki karar da
    üst üste yazılabiliyordu.
  */
  if (decision === "reddet") {
    const { data: rejected, error: rejectError } = await supabase
      .from("arc_return_requests")
      .update({
        status: "reddedildi",
        status_note: note || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("id", id)
      .eq("status", "beklemede")
      .select("id");

    if (rejectError) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("save-failed")});
    if (!rejected?.length) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("already-resolved")});

    if (order.customer_email) {
      try {
        const mail = returnDecisionEmail({
          brand: await getStoreBrand(supabase, organization.id),
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
    return await bildirimliDonus("/siparisler/iadeler",{basari:basariMetni("reddedildi")});
  }

  /* --- Onay: para henüz iade edilmiyor --- */

  /*
    Onay yalnızca "ürünü gönderebilirsiniz" demek. Para, ürün
    elimize ulaşıp kontrol edildikten sonra iade ediliyor.

    Öncesinde onay anında iade yapılıyordu: ürün gelmezse ya da
    hasarlı gelirse elimizde bir şey kalmıyordu.
  */
  if (decision === "onayla") {
    const { data: approved, error: approveError } = await supabase
      .from("arc_return_requests")
      .update({
        status: "onaylandi",
        status_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("id", id)
      .eq("status", "beklemede")
      .select("id");

    if (approveError) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("save-failed")});
    if (!approved?.length) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("already-resolved")});

    if (order.customer_email) {
      try {
        const mail = returnDecisionEmail({
          brand: await getStoreBrand(supabase, organization.id),
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
    /* Süzgeç adreste KALIYOR: kullanıcı onayladığı talebi listede görmeli.
     Adresten çıkan yalnızca mesaj. */
    return await bildirimliDonus("/siparisler/iadeler?filter=onaylandi",{basari:basariMetni("onaylandi")});
  }

  /* --- Ürün teslim alındı: PayTR iadesi --- */

  /*
    Siparişin ödeme durumu kontrol edilir. Öncesinde bu akış daha
    önce yapılmış iadeye bakmıyordu: sipariş detayından tam iade
    edilmiş sipariş buradan ikinci kez iade edilebiliyordu.
  */
  const orderMeta = (order.metadata ?? {}) as Record<string, unknown>;
  if (isBankTransfer(orderMeta)) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("transfer-order")});
  if (order.payment_status === "refunded") return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("already-refunded")});
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("not-paid")});
  }
  /* Aynı siparişe birden çok talep olabilir; iade edilen tutar birikir. */
  const alreadyRefunded = Math.max(0, Number(orderMeta.refunded_amount ?? 0) || 0);
  const remaining = Math.max(0, order.total - alreadyRefunded);

  /*
    Tutar seçilen kalemlerden hesaplanıyor. Formdan gelen
    değere güvenmiyoruz: parasal işlem.
  */
  const items = (request.items ?? []) as Array<{ total?: number }>;
  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.total ?? 0),
    0,
  );

  /*
    Kargo çıkmadıysa kargo bedeli de iadeye giriyor. Hesap
    `calculateRefund` içinde; panel de aynı fonksiyondan okuyor,
    ekranda yazan tutarla gönderilen tutar ayrışmasın.
  */
  const breakdown = calculateRefund({
    itemsTotal,
    orderTotal: order.total,
    shipping: order.shipping,
    orderStatus: order.status,
  });

  /*
    Elle girilen tutar.

    `Number.isFinite` şart: "abc" ya da "1.234,56" gibi bir girdi
    `NaN` üretiyor, `NaN > 0` da false olduğu için sessizce
    varsayılan tutara düşülüyordu. Kullanıcı 50 ₺ yazdığını
    sanırken siparişin tamamı iade edilebiliyordu.
  */
  /* Yalnızca boş alan "hesaplanan tutar" demek; "0", eksi ya da sayı olmayan girdi reddedilir. */
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const custom = Number(rawAmount.replace(",", "."));
  if (rawAmount && (!Number.isFinite(custom) || custom <= 0)) {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("invalid-amount")});
  }
  const amountKurus = rawAmount ? Math.round(custom * 100) : breakdown.amount;

  /*
    Üst sınır artık siparişin tamamı değil, iade edilen kalemler
    (ve varsa kargo bedeli). Öncesinde 50 ₺'lik tek bir kalemin
    iadesinde 5.000 ₺'lik siparişin tamamı geçirilebiliyordu.
  */
  if (amountKurus > remaining) {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("over-remaining")});
  }
  if (amountKurus <= 0 || amountKurus > breakdown.amount) {
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("invalid-amount")});
  }

  /*
    Sipariş kilitlenir (talep değil): aynı talebin çift gönderimi de,
    aynı siparişe ait iki talebin aynı anda işlenmesi de durur. Kilit
    okunduğu andaki updated_at'e koşullu olduğu için yukarıda okunan
    "önceden iade edilen" tutar kilit süresince geçerli kalır; iki
    talep toplamda ödenenden fazlasını iade edemez (bkz. lib/order-lock).
  */
  const lockedMeta = await claimOrderLock(supabase, organization.id, { id: request.order_id, updated_at: order.updated_at, metadata: order.metadata }, "refund_lock");
  if (!lockedMeta) return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("busy")});

  const merchantOid = order.order_number.replace(/[^A-Za-z0-9]/g, "");

  const result = await refundPayment({
    supabase,
    organizationId: organization.id,
    merchantOid,
    amountKurus,
    referenceNo: `ARCIADE${id.replace(/-/g, "").slice(0, 12)}`,
  });

  if (!result.ok) {
    await releaseOrderLock(supabase, organization.id, request.order_id, lockedMeta, "refund_lock");
    console.error("İade başarısız:", order.order_number, result.message);
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("refund-failed")});
  }

  const refundedTotal = alreadyRefunded + amountKurus;
  const outcome = refundOutcome({ orderTotal: order.total, refundedTotal, status: order.status });

  /*
    Test siparişinin iadesinde gerçek para hareketi olmuyor.
    Notta belirtiliyor ki panelde "iade edildi" görüp PayTR'da
    bulamama karışıklığı yaşanmasın.
  */
  const testNote = result.isTest
    ? "TEST siparişi — gerçek para iadesi yapılmadı."
    : null;

  const { error: requestError } = await supabase
    .from("arc_return_requests")
    .update({
      status: "tamamlandi",
      status_note: [note, testNote].filter(Boolean).join(" · ") || null,
      refund_amount: amountKurus,
      refund_reference: result.reference ?? null,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", id);

  /*
    STOĞA GERİ EKLEME.

    İade akışında stok hiç güncellenmiyordu: müşteri ürünü geri
    gönderiyor, para iade ediliyor, ama sistem ürünü hâlâ satılmış
    sayıyordu. Sipariş iptalinde stok geri veriliyor
    (arc_update_order_status) — aynı fiziksel olay, iki farklı sonuç.

    KARAR OPERASYONCUNUN: geri gelen ürün hasarlı ya da açılmışsa
    stoğa girmemeli ve bunu sistem bilemez. Ekrandaki onay kutusu
    varsayılan olarak işaretli, çünkü iadelerin çoğu satılabilir
    dönüyor ve iptal akışı da stoğu soru sormadan geri veriyor.

    HATA PARA İADESİNİ GEÇERSİZ SAYMIYOR: para çoktan gitti. Stok elle
    de düzeltilebilir, oysa burada hata dönmek operasyoncuyu iadeyi
    ikinci kez yapmaya iterdi.
  */
  let stogaEklenen = 0;
  if (String(formData.get("stoga_ekle") ?? "") === "on") {
    /*
      SİPARİŞİN GERÇEK KALEMLERİ sınır olarak veriliyor: iade talebinin
      kalemleri müşterinin tarayıcısından geliyor ve RPC onları
      doğrulamadan saklıyor.
    */
    const { data: siparisKalemleri, error: kalemHatasi } = await supabase.from("arc_order_items")
      .select("sku,quantity").eq("organization_id", organization.id).eq("order_id", request.order_id);
    /*
      Hata akışı KESMİYOR (para çoktan gitti, yukarıdaki gerekçe) ama
      artık iz bırakıyor. Yutulduğunda sınır listesi boş kalıyor,
      stogaDonecekler hiçbir şey döndürmüyor ve stok sessizce eksik
      kalıyordu: "neden eklenmedi" sorusunun hiçbir cevabı yoktu.
    */
    if (kalemHatasi) console.error("İade stoğu için sipariş kalemleri okunamadı:", request.order_id, kalemHatasi.message);
    const donecekler = stogaDonecekler(request.items, (siparisKalemleri ?? []) as Array<{ sku: string | null; quantity: number }>);
    if (donecekler.length) {
      const { data: varyantlar, error: varyantHatasi } = await supabase.from("arc_product_variants")
        .select("id,sku").eq("organization_id", organization.id)
        .in("sku", donecekler.map((k) => k.sku));
      // Aynı gerekçe: okunamadıysa hiçbir SKU eşleşmez ve stok sessizce eksik kalır.
      if (varyantHatasi) console.error("İade stoğu için varyantlar okunamadı:", request.order_id, varyantHatasi.message);
      const varyantBySku = new Map(((varyantlar ?? []) as Array<{ id: string; sku: string }>).map((v) => [v.sku, v.id]));
      for (const kalem of donecekler) {
        const varyantId = varyantBySku.get(kalem.sku);
        /* Varyantı bulunamayan SKU atlanıyor: silinmiş ürün olabilir. */
        if (!varyantId) continue;
        const { error: stokHatasi } = await supabase.rpc("arc_adjust_inventory", {
          p_variant_id: varyantId,
          p_quantity: kalem.adet,
          p_kind: "return",
          p_reference_type: "return_request",
          p_reference_id: id,
          p_note: `İade: ${order.order_number}`,
        });
        if (stokHatasi) console.error("İade stoğa eklenemedi:", kalem.sku, stokHatasi.message);
        else stogaEklenen += kalem.adet;
      }
    }
  }

  /*
    Sipariş detayındaki iade akışıyla aynı kural (refundOutcome):
    tamamı iade edilen sipariş kapanır, kısmi iadede sipariş olduğu
    adımda kalır. İki akış aynı siparişi farklı duruma bırakmamalı.
  */
  const { error: orderError } = await supabase
    .from("arc_orders")
    .update({
      payment_status: outcome.paymentStatus,
      status: outcome.status,
      metadata: {
        ...withoutLock(lockedMeta, "refund_lock"),
        refunded_at: new Date().toISOString(),
        refunded_amount: refundedTotal,
        refund_count: (Number(orderMeta.refund_count ?? 0) || 0) + 1,
        refund_reference: result.reference ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("id", request.order_id);

  /*
    Para iade edildi ama kayıt güncellenemedi. Sessizce geçmek
    tehlikeli: talep "onaylandı" kalırsa aynı iade tekrar denenebilir.
  */
  if (requestError || orderError) {
    console.error("İADE YAPILDI AMA KAYIT GÜNCELLENEMEDİ:", order.order_number, amountKurus, requestError?.message, orderError?.message);
    return await bildirimliDonus("/siparisler/iadeler",{hata:hataMetni("refund-recorded-failed")});
  }

  if (order.customer_email) {
    try {
      const mail = returnDecisionEmail({
          brand: await getStoreBrand(supabase, organization.id),
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
  /* Stok da değiştiyse o ekranlar tazeleniyor. */
  if (stogaEklenen) {
    revalidatePath("/stok");
    revalidatePath("/urunler");
    revalidatePath("/");
  }
  return await bildirimliDonus("/siparisler/iadeler", {
    basari: stogaEklenen
      ? `İade tamamlandı · ${stogaEklenen} ürün stoğa geri eklendi.`
      : "İade tamamlandı.",
  });
}
