"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { getStoreBrand, type StoreBrand } from "@/lib/store-brand";
import { sendEmail } from "@/lib/email/resend";
import { statusUpdateEmail } from "@/lib/email/order-confirmation";
import { isOrderClosed } from "@/lib/commerce-labels";
import { nextOrderStep } from "@/lib/order-flow";
import { backUrl } from "@/lib/back-url";
import { isBankTransfer } from "@/lib/payment-method";
import { notifyTransferPaid } from "@/lib/email/transfer-paid";
import { claimOrderLock } from "@/lib/order-lock";
import { yetkiYok } from "@/lib/yetki-metni";

const MANAGERS = ["owner", "admin", "manager"];

/* İşlemden sonra kullanıcı geldiği yere döner: listeden "Onayla →"
   demek filtreyi sıfırlayıp ilk sayfaya atıyordu. */
/*
  Sonuç ÇEREZE yazılıyor, adrese değil. backUrl yalnızca GİDİLECEK YOLU
  doğruluyor (dışarıdan gelen "back" değeriyle başka bir bölüme ya da
  dış adrese yönlendirme engelleniyor); mesaj artık o adresin
  parametresi değil.

  27.09.2026: sonuçlar çereze taşınırken burası atlanmıştı ve toplu
  işlemden sonra hiçbir mesaj görünmüyordu — sayfalar adresten okumayı
  bıraktığı için sessizce düşüyordu.
*/
const backTo = async (formData: FormData, result: { hata?: string; basari?: string }): Promise<never> =>
  bildirimliDonus(backUrl(formData.get("back"), "/siparisler", {}), result);

const fromDetail = (formData: FormData) =>
  /^\/siparisler\/(?!iadeler$)[A-Za-z0-9-]+$/.test(String(formData.get("back") ?? "").split("?")[0]);

export async function createOrder(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return await bildirimliDonus("/siparisler",{hata:hataMetni("forbidden")});

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const variantIds = formData.getAll("variant_id").map(String);
  const quantities = formData.getAll("quantity").map((value) => Number(value));

  if (!variantIds.length || variantIds.length !== quantities.length) return await bildirimliDonus("/siparisler",{hata:hataMetni("invalid-order")});

  const items = variantIds.map((variantId, index) => ({ variant_id: variantId, quantity: quantities[index] }));
  if (items.some((item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) return await bildirimliDonus("/siparisler",{hata:hataMetni("invalid-order")});

  const { data, error } = await supabase.rpc("arc_create_order", {
    p_customer_name: customerName,
    p_customer_email: customerEmail,
    p_items: items,
    p_source: "native",
  });

  if (error) return await bildirimliDonus(`/siparisler`,{hata:hataMetni(error.message)});

  revalidatePath("/");
  revalidatePath("/stok");
  revalidatePath("/siparisler");
  const orderNumber = data?.[0]?.order_number ?? "created";
  /* Sipariş numarası artık ADRESTE değil MESAJDA. */
  return await bildirimliDonus("/siparisler",{basari:`${orderNumber} numaralı sipariş oluşturuldu.`});
}

/* Müşteri bildirimi; gönderim hatası durum güncellemesini geçersiz kılmaz. */
async function notifyStatus(order: { order_number: string; customer_name: string | null; customer_email: string | null; metadata?: unknown; payment_status?: string | null }, status: string, brand: StoreBrand) {
  if (!order.customer_email) return;
  try {
    /* Takip numarası girildiyse takip bilgili kargo e-postası zaten gitti. */
    const trackingSent = Boolean((order.metadata as { tracking_number?: string } | null)?.tracking_number);
    /* Ödenmemiş siparişin iptalinde iade vaadi yerine "tutar alınmadı" yazılır. */
    const unpaid = Boolean(order.payment_status) && !["paid", "partially_refunded", "refunded"].includes(order.payment_status ?? "");
    const mail = statusUpdateEmail(status, order.order_number, order.customer_name || "değerli müşterimiz", brand, { trackingSent, unpaid });
    if (mail) await sendEmail({ to: order.customer_email, ...mail });
  } catch (mailError) {
    console.error("Durum bildirimi gönderilemedi:", order.order_number, mailError);
  }
}

/**
 * Listeden (veya detay başlığından) hızlı durum değişikliği.
 *
 * Sipariş detayına girmeden bir sonraki adıma geçirmek için.
 * Günde on sipariş geldiğinde her birini açıp kapatmak otuz
 * tıklama demekti.
 *
 * Ödeme durumuna dokunulmuyor: o PayTR bildirimiyle geliyor ve
 * elle değiştirmek muhasebeyle uyumsuzluk yaratır.
 */
export type IslemSonucu = { hata?: string; basari?: string };

/*
  DURUM İLERLETMENİN ÇEKİRDEĞİ — iki yerden çağrılıyor ve ikisi sonucu
  farklı taşıyor:

    quickStatus            sipariş DETAYINDA, sunucu formu. Sonucu
                           çereze yazıp geri yönlendiriyor.
    durumIlerletSonuc      LİSTEDE, istemciden. Sonucu DÖNDÜRÜYOR,
                           yönlendirmiyor.

  Ayrım neden gerekli: listede her durum değişikliği tam bir gezinme
  başlatıyordu. Kaydırma yeri gidiyor, seçim sıfırlanıyor, liste baştan
  çiziliyordu — kırk kayıtlık bir listede üç siparişi ilerletmek üç kez
  başa dönmek demekti. Yönlendirme kalkınca revalidatePath yine veriyi
  yeniliyor ama kullanıcı yerinde kalıyor.

  Mantık TEK YERDE: yetki, adım atlama kontrolü ve bildirim iki yolda
  da aynı çalışmalı; kopyalamak birinde düzeltilen bir kuralın ötekinde
  kalması demekti.
*/
async function durumIlerlet(orderId: string, status: string): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();

  if (!MANAGERS.includes(membership.role)) return { hata: hataMetni("forbidden") };

  const allowed = new Set(["confirmed", "processing", "fulfilled", "cancelled"]);
  if (!orderId || !allowed.has(status)) return { hata: hataMetni("invalid-status") };

  const { data: order } = await supabase
    .from("arc_orders")
    .select("status,payment_status,order_number,customer_name,customer_email,metadata")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .single();

  /*
    Kayıt okunamadıysa devam edilmiyor. Öncesinde `order` null
    olsa bile RPC çağrılıyor ve ödeme durumu `?? "pending"` ile
    geçiliyordu: ödenmiş siparişin ödeme durumu sessizce
    "Ödeme bekliyor"a düşebiliyordu.
  */
  if (!order) return { hata: hataMetni("order-not-found") };

  /* Kapanmış sipariş akışta ilerletilemez. Düğme zaten gizli;
     bu kontrol elle gönderilen isteğe karşı. */
  if (isOrderClosed(order.status, order.payment_status)) return { hata: hataMetni("order-closed") };

  /* Yalnızca akıştaki bir sonraki adım ya da iptal (toplu işlemle aynı kural): elle gönderilen istek adım atlatamaz. */
  if (status !== "cancelled" && nextOrderStep(order.status, order.payment_status)?.key !== status) {
    return { hata: hataMetni("invalid-status") };
  }

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: status,
    // Ödeme durumu değiştirilmiyor.
    p_payment_status: order.payment_status,
  });

  if (error) return { hata: hataMetni("save-failed") };

  await notifyStatus(order, status, await getStoreBrand(supabase, membership.organization_id));

  revalidatePath("/");
  revalidatePath("/siparisler");
  revalidatePath(`/siparisler/${orderId}`);
  return { basari: "Sipariş durumu güncellendi." };
}

/** Sipariş detayı: sonucu çereze yazıp geldiği yere döner. */
export async function quickStatus(formData: FormData) {
  const sonuc = await durumIlerlet(String(formData.get("order_id") ?? ""), String(formData.get("status") ?? ""));
  return await backTo(formData, sonuc);
}

/**
 * Liste: sonucu DÖNDÜRÜR, yönlendirmez.
 *
 * Kimlik ve durum istemciden geliyor ama yetki, sipariş sahipliği ve
 * adım kuralı çekirdekte doğrulanıyor — istemciye güvenilmiyor,
 * yalnızca sonucun nereye gideceği değişiyor.
 */
export async function durumIlerletSonuc(orderId: string, status: string): Promise<IslemSonucu> {
  return await durumIlerlet(String(orderId ?? ""), String(status ?? ""));
}

/**
 * Havale ödemesini tek tıkla onaylar (Operasyon Merkezi).
 *
 * Öncesinde sipariş detayına girip ödeme ve durum listelerini
 * değiştirmek gerekiyordu. Yalnızca havale siparişinde ve ödeme
 * beklerken çalışır; sipariş "onaylandı + ödendi" olur ve müşteriye
 * "ödemeniz alındı" gider. Kart ödemesi PayTR bildirimiyle kapanır.
 */
/*
  HAVALE ÖDEMESİNİ ONAYLA — çekirdek. İki yolu var:

    confirmTransferPayment  form gönderimi (JavaScript kapalıyken de
                            çalışan yol), çereze yazıp yönlendiriyor.
    havaleOnaySonuc         Operasyon Merkezi'nden, sonucu döndürüyor.

  Operasyon Merkezi sabah açılan ekran ve genellikle birkaç havale
  birikiyor; her onayda tam bir gezinme, üç ödemeyi onaylamak için üç
  kez sayfayı baştan çizmek demekti. Yönlendirme kalkınca
  revalidatePath satırı listeden düşürüyor — istenen geri bildirim
  zaten bu.

  KİLİT DURUYOR: çift tıklama ya da ikinci sekme siparişi kilitliyor,
  müşteriye ikinci "Ödemeniz alındı" gitmiyor. Yerinde işlem bu korumayı
  daha da gerekli kılıyor, çünkü düğme sayfa yenilenmediği için ekranda
  kalıyor; düğme de işlenirken kilitleniyor.
*/
async function havaleOnayla(orderId: string): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return { hata: hataMetni("forbidden") };
  const { data: order } = await supabase
    .from("arc_orders")
    .select("status,payment_status,metadata,order_number,customer_name,customer_email,total,updated_at")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { hata: hataMetni("order-not-found") };
  if (!isBankTransfer(order.metadata)) return { hata: hataMetni("not-transfer") };
  if (order.payment_status === "paid") return { hata: hataMetni("already-paid") };
  if (!["pending", "authorized"].includes(order.payment_status) || isOrderClosed(order.status, order.payment_status)) return { hata: hataMetni("order-closed") };

  /* Çift tıklama ya da ikinci sekme: sipariş kilitlenir, müşteriye ikinci "Ödemeniz alındı" gitmez. */
  if (!(await claimOrderLock(supabase, organization.id, { id: orderId, updated_at: order.updated_at, metadata: order.metadata }, "transfer_lock"))) {
    return { hata: hataMetni("in-progress") };
  }

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: order.status === "pending" ? "confirmed" : order.status,
    p_payment_status: "paid",
  });
  if (error) return { hata: hataMetni("save-failed") };

  await notifyTransferPaid(order, await getStoreBrand(supabase, membership.organization_id));

  revalidatePath("/");
  revalidatePath("/operasyon");
  revalidatePath("/siparisler");
  revalidatePath(`/siparisler/${orderId}`);
  return { basari: `${order.order_number} · havale ödemesi onaylandı. Müşterinin e-posta adresi varsa bildirim gönderildi.` };
}

/** Form gönderimi: sonucu çereze yazıp geldiği yere döner. */
export async function confirmTransferPayment(formData: FormData) {
  const sonuc = await havaleOnayla(String(formData.get("order_id") ?? ""));
  return await bildirimliDonus(
    backUrl(formData.get("back"), fromDetail(formData) ? "/siparisler" : "/operasyon", {}),
    sonuc,
  );
}

/** Operasyon Merkezi: sonucu döndürür, yönlendirmez. */
export async function havaleOnaySonuc(orderId: string): Promise<IslemSonucu> {
  return await havaleOnayla(String(orderId ?? ""));
}

/**
 * Ödenmeyen havale siparişini iptal eder (Operasyon Merkezi).
 *
 * Havale siparişi ödenmezse "ödeme bekliyor" durumunda süresiz
 * kalıyordu. Yalnızca havalede, ödeme beklerken ve sipariş
 * kapanmamışken çalışır; müşteriye "Siparişiniz iptal edildi" gider.
 * Otomatik değil: kararı her seferinde bir yönetici verir.
 */
/*
  ÖDENMEYEN HAVALE SİPARİŞİNİ İPTAL — çekirdek. Onaylamayla aynı iki yol
  (form gönderimi ve Operasyon Merkezi'nden yerinde çağrı) ve aynı
  gerekçe. Kilit de aynı sebeple duruyor: müşteriye ikinci "iptal
  edildi" gitmesin.
*/
async function havaleIptal(orderId: string): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return { hata: hataMetni("forbidden") };
  const { data: order } = await supabase
    .from("arc_orders")
    .select("status,payment_status,metadata,order_number,customer_name,customer_email,updated_at")
    .eq("organization_id", organization.id)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { hata: hataMetni("order-not-found") };
  if (!isBankTransfer(order.metadata)) return { hata: hataMetni("not-transfer") };
  if (order.payment_status === "paid") return { hata: hataMetni("already-paid") };
  if (!["pending", "authorized"].includes(order.payment_status) || isOrderClosed(order.status, order.payment_status)) return { hata: hataMetni("order-closed") };

  /* Çift gönderim ya da aynı anda "Ödeme alındı": sipariş kilitlenir, ikinci istek durur. */
  if (!(await claimOrderLock(supabase, organization.id, { id: orderId, updated_at: order.updated_at, metadata: order.metadata }, "transfer_lock"))) {
    return { hata: hataMetni("in-progress") };
  }

  const { error } = await supabase.rpc("arc_update_order_status", {
    p_order_id: orderId,
    p_status: "cancelled",
    p_payment_status: order.payment_status,
  });
  if (error) return { hata: hataMetni("save-failed") };

  await notifyStatus(order, "cancelled", await getStoreBrand(supabase, membership.organization_id));

  revalidatePath("/");
  revalidatePath("/operasyon");
  revalidatePath("/siparisler");
  revalidatePath(`/siparisler/${orderId}`);
  return { basari: `${order.order_number} · sipariş iptal edildi. Müşterinin e-posta adresi varsa bildirim gönderildi.` };
}

/** Form gönderimi: sonucu çereze yazıp geldiği yere döner. */
export async function cancelTransferOrder(formData: FormData) {
  const sonuc = await havaleIptal(String(formData.get("order_id") ?? ""));
  return await bildirimliDonus(
    backUrl(formData.get("back"), fromDetail(formData) ? "/siparisler" : "/operasyon", {}),
    sonuc,
  );
}

/** Operasyon Merkezi: sonucu döndürür, yönlendirmez. */
export async function havaleIptalSonuc(orderId: string): Promise<IslemSonucu> {
  return await havaleIptal(String(orderId ?? ""));
}

/**
 * Toplu durum değişikliği.
 *
 * Yalnızca akıştaki bir sonraki adım uygulanır: "Kargoya ver"
 * seçildiğinde yalnızca hazırlanan siparişler kargoya geçer,
 * henüz onaylanmamış olanlar atlanır. Kapanmış (iptal / iade)
 * siparişler hiçbir adıma geçmez. Kurallar hızlı işlemle aynı;
 * uygunluk sunucuda yeniden hesaplanıyor, formdaki listeye
 * güvenilmiyor.
 */
/*
  TOPLU DURUM — çekirdek. İki yolu var, mantık burada:

    bulkStatus        form gönderimi (JavaScript kapalıyken de çalışır),
                      sonucu çereze yazıp yönlendiriyor.
    topluDurumSonuc   listeden, sonucu DÖNDÜRÜYOR.

  Toplu işlem de tam bir gezinme başlatıyordu: kaydırma yeri ve seçim
  gidiyor, liste baştan çiziliyordu.
*/
async function topluDurumCekirdek(rawIds: string[], status: string): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return { hata: hataMetni("forbidden") };

  const ids = [...new Set(rawIds.map(String).filter(Boolean))].slice(0, 100);

  if (!["confirmed", "processing", "fulfilled"].includes(status)) return { hata: hataMetni("invalid-status") };
  if (!ids.length) return { hata: hataMetni("bulk-empty") };

  const { data: orders, error } = await supabase
    .from("arc_orders")
    .select("id,status,payment_status,order_number,customer_name,customer_email,metadata")
    .eq("organization_id", organization.id)
    .in("id", ids);
  if (error) return { hata: hataMetni("save-failed") };

  const eligible = (orders ?? []).filter((order) => nextOrderStep(order.status, order.payment_status)?.key === status);
  const updated: typeof eligible = [];
  for (const order of eligible) {
    const { error: rpcError } = await supabase.rpc("arc_update_order_status", {
      p_order_id: order.id,
      p_status: status,
      p_payment_status: order.payment_status,
    });
    if (rpcError) console.error("Toplu durum güncellenemedi:", order.order_number, rpcError.message);
    else updated.push(order);
  }

  const toplu = await getStoreBrand(supabase, membership.organization_id);
  await Promise.all(updated.map((order) => notifyStatus(order, status, toplu)));

  revalidatePath("/");
  revalidatePath("/siparisler");
  /* Sayılar MESAJIN İÇİNDE: adres satırında taşınırken dışarıdan
     uydurulabiliyordu. */
  return {
    basari: `${updated.length} siparişin durumu güncellendi${ids.length - updated.length ? ` · ${ids.length - updated.length} sipariş atlandı` : ""}.`,
  };
}

/** Form gönderimi: sonucu çereze yazıp geldiği yere döner. */
export async function bulkStatus(formData: FormData) {
  const sonuc = await topluDurumCekirdek(
    formData.getAll("order_id").map(String),
    String(formData.get("status") ?? ""),
  );
  return await backTo(formData, sonuc);
}

/** Liste: sonucu döndürür, yönlendirmez. */
export async function topluDurumSonuc(ids: string[], status: string): Promise<IslemSonucu> {
  return await topluDurumCekirdek(Array.isArray(ids) ? ids : [], String(status ?? ""));
}


/*
  SİPARİŞ SİLME (toplu).

  Silme GERİ ALINAMAZ ve kaydı gerçekten yok eder; kalemler, olaylar,
  gönderiler ve iade talepleri CASCADE ile gider. Bu yüzden veritabanı
  fonksiyonuyla yapılıyor (public.arc_delete_order): kural sunucuda
  değil VERİTABANINDA duruyor, yani API'ye doğrudan gelen bir istek de
  aynı korumadan geçiyor.

  Fonksiyon iki şeyi garantiliyor:
   - Sipariş açıksa önce iptal ediliyor, böylece STOK GERİ VERİLİYOR.
     Vitrin satışı stoğu düşürürken hareket kaydı yazmıyor; düz bir
     DELETE stoğu kalıcı olarak düşük bırakırdı.
   - Siparişin stok hareketleri siliniyor: yabancı anahtar olmadığı için
     CASCADE onlara ulaşmıyor, var olmayan siparişi işaret eden satırlar
     kalırdı.

  Yetki veritabanında owner/admin ile sınırlı; buradaki kontrol yalnızca
  kullanıcıya erken ve Türkçe cevap vermek için.
*/
export async function siparisleriSil(formData: FormData) {
  const { supabase, membership } = await requireTenant();
  if (!["owner", "admin"].includes(membership.role)) {
    return await backTo(formData, { hata: yetkiYok("sipariş silme", "sahiplik") });
  }

  /*
    Üst sınır 100: toplu işlemle aynı sınır. Tek istekte binlerce kayıt
    silmek hem zaman aşımına girer hem de yanlış seçimin bedelini
    büyütür.
  */
  const ids = [...new Set(formData.getAll("order_id").map(String).filter(Boolean))].slice(0, 100);
  if (!ids.length) return await backTo(formData, { hata: "Silinecek sipariş seçilmedi." });

  const silinen: string[] = [];
  const hatalar: string[] = [];
  for (const id of ids) {
    /*
      Tek tek çağrılıyor: bir siparişin silinememesi ötekileri
      durdurmamalı ve hangisinin neden düştüğü söylenebilmeli.
    */
    const { data, error } = await supabase.rpc("arc_delete_order", { p_order_id: id });
    if (error) hatalar.push(error.message);
    else silinen.push(typeof data === "string" ? data : id);
  }

  revalidatePath("/siparisler");
  revalidatePath("/operasyon");
  revalidatePath("/stok");

  if (!silinen.length) {
    return await backTo(formData, { hata: `Sipariş silinemedi: ${hatalar[0] ?? "bilinmeyen hata"}` });
  }
  return await backTo(formData, {
    basari: `${silinen.length} sipariş silindi${hatalar.length ? ` · ${hatalar.length} sipariş silinemedi` : ""}.`,
  });
}
