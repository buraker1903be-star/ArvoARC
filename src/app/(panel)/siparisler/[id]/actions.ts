"use server";

import { formTutari } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bildirimBirak, bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { sendEmail } from "@/lib/email/resend";
import { partialRefundEmail, shippingNoticeHtml, statusUpdateEmail } from "@/lib/email/order-confirmation";
import { notifyTransferPaid } from "@/lib/email/transfer-paid";
import { odemeyiIadeEt } from "@/lib/odeme/iade";
import { isBankTransfer, saglayicidanIadeEdilemez } from "@/lib/payment-method";
import { iadeDagilimi, refundOutcome } from "@/lib/refund";
import { claimOrderLock, releaseOrderLock, withoutLock } from "@/lib/order-lock";
import { requireTenant } from "@/lib/tenant";
import { getStoreBrand } from "@/lib/store-brand";
import { tarzyeriSepetiniDogrula } from "@/lib/supplier/tarzyeri-dogrulama";

/*
  İşlem sonucu ÇEREZE yazılıyor, adrese değil: `?error=` adres satırında
  taşındığı için dışarıdan uydurulabiliyordu ve sayfa tanımadığı kodu
  olduğu gibi basıyordu (lib/panel-bildirim.ts). Kod → Türkçe metin
  çevirisi burada yapılıyor.
*/
async function siparise(orderId:string,sonuc:{hata?:string;basari?:string}):Promise<never>{
  if(sonuc.hata)await bildirimBirak({hata:hataMetni(sonuc.hata)});
  else if(sonuc.basari)await bildirimBirak({basari:basariMetni(sonuc.basari)});
  redirect(`/siparisler/${orderId}`);
}

const roles=new Set(["owner","admin","manager"]);
const orderStatuses=new Set(["pending","confirmed","processing","fulfilled","cancelled","refunded"]);
const paymentStatuses=new Set(["pending","authorized","paid","partially_refunded","refunded","failed"]);

export async function updateOrderStatus(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))return await siparise(orderId,{hata:"forbidden"});
  const status=String(formData.get("status")??"");
  const paymentStatus=String(formData.get("payment_status")??"");
  if(!orderId||!orderStatuses.has(status)||!paymentStatuses.has(paymentStatus))return await siparise(orderId,{hata:"invalid-status"});

  /* Önceki ödeme durumu da okunur: havalede "ödendi"ye geçiş müşteriye bildirilir. */
  const {data:ownedOrder}=await supabase.from("arc_orders").select("id,status,payment_status,metadata,total,order_number,customer_name,customer_email").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(!ownedOrder)return await siparise(orderId,{hata:"order-not-found"});
  /*
    Parayı hareket ettirmeden "iade edildi" işaretlemek, iade
    yetkisiyle aynı: yalnızca sahip ve yönetici. Mağaza yöneticisi
    bunu yapınca müşteriye "İadeniz tamamlandı" gidiyor, sipariş de
    gerçek iadeye kapanıyordu.
  */
  const marksRefund=(paymentStatus!==ownedOrder.payment_status&&["refunded","partially_refunded"].includes(paymentStatus))||(status==="refunded"&&ownedOrder.status!=="refunded");
  if(marksRefund&&!["owner","admin"].includes(membership.role))return await siparise(orderId,{hata:"forbidden-para"});
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
  if(error)return await siparise(orderId,{hata:error.message});
  revalidatePath("/");revalidatePath("/siparisler");revalidatePath("/stok");revalidatePath("/urunler");revalidatePath(`/siparisler/${orderId}`);
  return await siparise(orderId,{basari:"durum"});
}


type OrderMetadata={shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string;[key:string]:unknown};

export async function updateFulfillmentDetails(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))return await siparise(orderId,{hata:"forbidden"});
  const carrier=String(formData.get("shipping_carrier")??"").trim();
  const trackingNumber=String(formData.get("tracking_number")??"").trim();
  const trackingInput=String(formData.get("tracking_url")??"").trim();
  const internalNote=String(formData.get("internal_note")??"").trim();
  if(carrier.length>100||trackingNumber.length>160||internalNote.length>1000)return await siparise(orderId,{hata:"invalid-fulfillment"});
  let trackingUrl="";
  if(trackingInput){
    try{const parsed=new URL(trackingInput);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error();trackingUrl=parsed.toString();}
    catch{return await siparise(orderId,{hata:"invalid-tracking-url"});}
  }

  const {data:order,error:readError}=await supabase.from("arc_orders").select("metadata").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(readError||!order)return await siparise(orderId,{hata:"order-not-found"});
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
      /*
        BÖLÜNMÜŞ GÖNDERİSİ OLAN siparişte bu e-posta gönderilmiyor.
        Paketlerin kendi bildirimi var (lib/kargo-bildirimi-gonder.ts) ve
        buradaki tek numaralı özet, üç paketli bir siparişte müşteriye
        yanlış bilgi verirdi: tek takip numarası siparişin tamamını
        temsil etmiyor. İki yol birlikte çalışsaydı müşteri aynı sipariş
        için hem paket başına hem toplu bildirim alırdı.
      */
      const {count:gonderiSayisi}=await supabase.from("arc_shipments")
        .select("id",{count:"exact",head:true})
        .eq("organization_id",organization.id).eq("order_id",orderId).neq("status","cancelled");
      const {data:order}=await supabase.from("arc_orders").select("order_number,customer_name,customer_email").eq("id",orderId).single();
      if(order?.customer_email&&!gonderiSayisi){
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
  if(error)return await siparise(orderId,{hata:error.message});
  revalidatePath("/siparisler");revalidatePath(`/siparisler/${orderId}`);
  return await siparise(orderId,{basari:"fulfillment"});
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
    return await bildirimliDonus("/siparisler",{hata:hataMetni("forbidden-para")});
  }

  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return await bildirimliDonus("/siparisler",{hata:hataMetni("invalid-order")});

  const { data: order } = await supabase
    .from("arc_orders")
    .select(
      "id,order_number,total,payment_status,status,metadata,customer_name,customer_email,updated_at",
    )
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  if (!order) return await bildirimliDonus("/siparisler",{hata:hataMetni("invalid-order")});

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
  /*
    DÜZENLEME ALACAĞI (16.10.2026): ödenmiş siparişten kalem çıkarılınca
    toplam düşüyor, müşterinin fazla ödediği fark burada bekliyor. Bu fark
    da iade edilebilir tutara girer (lib/refund → iadeDagilimi).
  */
  const alacak = Math.max(0, Number(meta.duzenleme_alacagi ?? 0) || 0);
  const remaining = Math.max(0, (order.total ?? 0) - alreadyRefunded) + alacak;
  if (order.payment_status === "refunded" || remaining <= 0 || (meta.refunded_at && alreadyRefunded <= 0)) {
    return await siparise(orderId,{hata:"already-refunded"});
  }

  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return await siparise(orderId,{hata:"not-paid"});
  }

  /* Havale ve NAKİT sanal POS'tan geçmedi; oradan iade de edilemez. */
  if (saglayicidanIadeEdilemez(meta)) {
    return await siparise(orderId,{hata:"transfer-order"});
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
  /*
    TÜRKÇE YAZIM (16.10.2026). Tutar `Number(x.replace(",", "."))` ile
    okunuyordu: "1.500" (bin beş yüz) 1,50 ₺, "1.234,56" NaN oluyordu —
    yani müşteriye istenenin binde biri iade ediliyordu. Kutu da
    type="number" idi ve Chrome tr-TR'de "1.500" yazılınca değer yine
    1,5 geliyordu. Artık metin kutusu ve parseMoneyToCents (bin ayırıcı
    ve ondalık virgülü tanıyor). Okunamayan ya da sıfır tutar reddedilir.
  */
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const requestedKurus = rawAmount ? (formTutari(rawAmount) ?? 0) : 0;
  if (rawAmount && requestedKurus <= 0) {
    return await siparise(orderId,{hata:"invalid-amount"});
  }
  const amountKurus = rawAmount ? requestedKurus : remaining;

  if (amountKurus <= 0 || amountKurus > remaining) {
    return await siparise(orderId,{hata:"invalid-amount"});
  }

  /* PayTR her iadede ayrı referans görmeli; ilk iade eski biçimde kalır. */
  const priorRefunds = Math.max(Number(meta.refund_count ?? 0) || 0, alreadyRefunded > 0 ? 1 : 0);

  /*
    PayTR sipariş numarasını harf ve rakam dışındaki karakterler
    olmadan bekliyor; ödeme oluşturulurken de böyle gönderilmişti.
  */
  /* Sipariş iade için kilitlenir: çift tıklama ya da ikinci sekme aynı iadeyi PayTR'a iki kez göndermesin (bkz. lib/order-lock). */
  const lockedMeta = await claimOrderLock(supabase, organization.id, order, "refund_lock");
  if (!lockedMeta) return await siparise(orderId,{hata:"busy"});

  const result = await odemeyiIadeEt({
    supabase,
    organizationId: organization.id,
    order: { id: order.id, order_number: order.order_number, metadata: (order.metadata ?? null) as Record<string, unknown> | null },
    amountKurus,
    referenceNo: `ArvoARC${orderId.replace(/-/g, "").slice(0, 12)}${priorRefunds ? `K${priorRefunds + 1}` : ""}`,
  });

  if (!result.ok) {
    await releaseOrderLock(supabase, organization.id, orderId, lockedMeta, "refund_lock");
    console.error("İade başarısız:", order.order_number, result.message);
    return await siparise(orderId,{hata:"refund-failed"});
  }

  /*
    Tamamı iade edilen sipariş kapanır; kısmi iadede sipariş olduğu
    adımda kalır ve kalan ürünler gönderilebilir (bkz. refundOutcome).
    Ödeme durumu her iki hâlde de değişir: parası kısmen geri gitmiş
    sipariş "Ödendi" görünmez.
  */
  /*
    Düzenleme alacağından ödenen kısım refunded_amount'a YAZILMIYOR:
    toplam o kalem çıkarılırken zaten düştü, ciro "total - refunded_amount"
    olduğu için eklemek ciroyu ikinci kez düşürürdü. Yalnızca alacak
    ödeniyorsa sipariş "Ödendi" kalır — müşteri kalan ürünlerin parasını
    ödemiş durumda. refunded_at da yazılmıyor: o alan "iade yapıldı"
    anlamında okunuyor (geçmiş, ikinci iade engeli).
  */
  const dagilim = iadeDagilimi({ tutar: amountKurus, alacak });
  const refundedTotal = alreadyRefunded + dagilim.normal;
  const outcome = refundOutcome({ orderTotal: order.total ?? 0, refundedTotal, status: order.status });
  const simdi = new Date().toISOString();
  const temizMeta = withoutLock(lockedMeta, "refund_lock");
  const alacakBilgisi = dagilim.alacaktan > 0 ? {
    duzenleme_alacagi: alacak - dagilim.alacaktan,
    duzenleme_iadesi: Math.max(0, Number(meta.duzenleme_iadesi ?? 0) || 0) + dagilim.alacaktan,
    duzenleme_iade_at: simdi,
  } : {};

  const { error } = await supabase
    .from("arc_orders")
    .update({
      payment_status: dagilim.normal > 0 ? outcome.paymentStatus : order.payment_status,
      status: dagilim.normal > 0 ? outcome.status : order.status,
      metadata: {
        ...temizMeta,
        ...alacakBilgisi,
        ...(dagilim.normal > 0 ? { refunded_at: simdi, refunded_amount: refundedTotal } : {}),
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
    return await siparise(orderId,{hata:"refund-recorded-failed"});
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
  return await siparise(orderId,{basari:"refund"});
}

/*
  SİPARİŞ KALEMİNİ DÜZENLE (16.10.2026): kaldır, adedini değiştir ya da
  başka bir varyantla değiştir. İşin tamamı veritabanında, tek işlemde
  (arc_siparis_kalemi_duzenle): stok, toplam, KDV ve olay kaydı birlikte.
  Burada yalnızca giriş okunuyor ve Tarzyeri ürünü siparişe GİRİYORSA
  stoğu canlı sayfasından doğrulanıyor — vitrin ödemesindeki kuralın
  aynısı: veritabanındaki stok on dakikada bir yenileniyor, "stokta yok"
  diye çıkarılan ürünün yerine konan da bitmiş olabilir.
*/
export async function kalemiDuzenle(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!roles.has(membership.role)) return await siparise(orderId, { hata: "forbidden" });
  const itemId = String(formData.get("item_id") ?? "");
  const adet = Number.parseInt(String(formData.get("adet") ?? ""), 10);
  const varyant = String(formData.get("variant_id") ?? "").trim() || null;
  if (!orderId || !itemId || !Number.isInteger(adet) || adet < 0 || adet > 999) {
    return await siparise(orderId, { hata: "Geçersiz adet." });
  }

  if (adet > 0) {
    const { data: kalem, error: kalemHatasi } = await supabase.from("arc_order_items")
      .select("variant_id,quantity").eq("organization_id", organization.id).eq("id", itemId).maybeSingle();
    if (kalemHatasi) return await siparise(orderId, { hata: "Kalem okunamadı: " + kalemHatasi.message });
    const hedef = varyant ?? kalem?.variant_id ?? null;
    /* Yalnızca adet AZALIYORSA doğrulamaya gerek yok: yeni stok istenmiyor. */
    const yeniStokGerekir = Boolean(hedef) && (varyant !== null && varyant !== kalem?.variant_id || adet > (kalem?.quantity ?? 0));
    if (hedef && yeniStokGerekir) {
      const { data: v, error: vHatasi } = await supabase.from("arc_product_variants")
        .select("sku").eq("organization_id", organization.id).eq("id", hedef).maybeSingle();
      if (vHatasi || !v) return await siparise(orderId, { hata: "Varyant okunamadı." });
      const dogrulama = await tarzyeriSepetiniDogrula(supabase, organization.id, [{ sku: v.sku, quantity: adet }]);
      if (!dogrulama.ok) return await siparise(orderId, { hata: dogrulama.message });
    }
  }

  const { data, error } = await supabase.rpc("arc_siparis_kalemi_duzenle", {
    p_order_id: orderId, p_item_id: itemId, p_adet: adet, p_variant_id: varyant,
  });
  /* İşlevin hata metinleri Türkçe ve kullanıcıya yönelik ("önce gönderiyi iptal edin"). */
  if (error) return await siparise(orderId, { hata: error.message });

  const sonuc = (data ?? {}) as { islem?: string; alacak?: number };
  revalidatePath(`/siparisler/${orderId}`);
  revalidatePath("/siparisler");
  const metin = sonuc.islem === "kaldirildi" ? "Kalem siparişten çıkarıldı; stok geri verildi ve toplam yeniden hesaplandı."
    : sonuc.islem === "degisti" ? "Kalem değiştirildi; stok ve toplam güncellendi."
    : "Adet güncellendi; stok ve toplam yeniden hesaplandı.";
  return await siparise(orderId, { basari: sonuc.alacak ? `${metin} Müşteriye iade edilecek fark Ödeme bölümünde.` : metin });
}

/*
  HAVALE SİPARİŞİNDE DÜZENLEME ALACAĞI KAPATMA. Havale PayTR'dan geçmediği
  için fark panelden geri ödenemiyor; kurum bankadan gönderip burada
  işaretliyor. Para işlemi olduğu için iadeyle aynı kapı: sahip ve
  yönetici. Tutar refunded_amount'a YAZILMAZ (iadeDagilimi ile aynı
  gerekçe): toplam kalem çıkarılırken zaten düştü.
*/
export async function alacakKapat(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!["owner", "admin"].includes(membership.role)) return await siparise(orderId, { hata: "forbidden-para" });
  const { data: order, error: okumaHatasi } = await supabase.from("arc_orders")
    .select("id,metadata").eq("organization_id", organization.id).eq("id", orderId).maybeSingle();
  if (okumaHatasi) return await siparise(orderId, { hata: "Sipariş okunamadı: " + okumaHatasi.message });
  if (!order) return await siparise(orderId, { hata: "order-not-found" });
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  if (!isBankTransfer(meta)) return await siparise(orderId, { hata: "Bu sipariş havale değil; fark İade sekmesinden karta geri ödenir." });
  const alacak = Math.max(0, Number(meta.duzenleme_alacagi ?? 0) || 0);
  if (alacak <= 0) return await siparise(orderId, { hata: "Bu siparişte iade edilecek fark yok." });
  const simdi = new Date().toISOString();
  const { error } = await supabase.from("arc_orders").update({
    metadata: {
      ...meta,
      duzenleme_alacagi: 0,
      duzenleme_iadesi: Math.max(0, Number(meta.duzenleme_iadesi ?? 0) || 0) + alacak,
      duzenleme_iade_at: simdi,
    },
    updated_at: simdi,
  }).eq("organization_id", organization.id).eq("id", orderId);
  if (error) return await siparise(orderId, { hata: "Kaydedilemedi: " + error.message });
  revalidatePath(`/siparisler/${orderId}`);
  return await siparise(orderId, { basari: "Fark bankadan iade edildi olarak işaretlendi." });
}
