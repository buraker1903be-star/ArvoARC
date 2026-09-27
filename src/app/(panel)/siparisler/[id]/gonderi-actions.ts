"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { bolmeSorunu, type Gonderi, type SiparisKalemi } from "@/lib/kargo-bolme";
import { KARGO_FIRMALARI, takipAdresi } from "@/lib/kargo-firmalari";

/*
  GÖNDERİ İŞLEMLERİ.

  İki çalışma biçimi var ve bu dosya şimdilik ikincisini karşılıyor:
   1. Etiketi biz üretiyoruz (tryOTO) — ayrı bir tur.
   2. Tedarikçi kendi gönderiyor, bize takip numarası veriyor. Burada OTO
      hiç devreye girmiyor, OTO bakiyesi harcanmıyor.

  Adet bütünlüğü asıl olarak VERİTABANI TETİKLEYİCİSİNDE korunuyor
  (arvo_arc_shipment_item_guard). Buradaki denetim kullanıcıya anlaşılır
  mesaj vermek için; tetikleyicinin mesajı teknik ve hangi ürün olduğunu
  söylemiyor.
*/

const MANAGERS = ["owner", "admin", "manager"];

/* Dönüş tipi never: redirect akışı kesiyor ve derleyici bunu ancak böyle
   biliyor — yoksa sonraki satırlar "değer null olabilir" diye uyarıyor. */
const geriDon = (orderId: string, sonuc: Record<string, string>): never => {
  const p = new URLSearchParams(sonuc);
  redirect(`/siparisler/${orderId}?${p.toString()}`);
};

/** Formdaki "kalem_<id>" alanlarından seçilen adetler. */
function secimiOku(formData: FormData): Record<string, number> {
  const secim: Record<string, number> = {};
  for (const [ad, deger] of formData.entries()) {
    if (!ad.startsWith("kalem_")) continue;
    const adet = Number(String(deger).trim());
    if (Number.isFinite(adet) && adet > 0) secim[ad.slice(6)] = adet;
  }
  return secim;
}

export async function elleGonderiEkle(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });

  const carrierCode = String(formData.get("carrier_code") ?? "").trim();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const elleAdres = String(formData.get("tracking_url") ?? "").trim();
  const secim = secimiOku(formData);

  if (!KARGO_FIRMALARI.some((firma) => firma.kod === carrierCode)) return geriDon(orderId, { error: "kargo-firmasi-gecersiz" });
  /*
    Takip numarası burada da isteniyor, veritabanı da istiyor. İkisi
    birden: veritabanı kuralı güvenlik sınırı, buradaki ise kullanıcıya
    Türkçe ve alanı işaret eden bir mesaj verebilmek için.
  */
  if (!trackingNumber) return geriDon(orderId, { error: "takip-numarasi-gerekli" });

  const [{ data: kalemler }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_order_items").select("id,quantity,product_name").eq("organization_id", organization.id).eq("order_id", orderId),
    supabase.from("arc_shipments").select("id,status,sequence,arc_shipment_items(order_item_id,quantity)").eq("organization_id", organization.id).eq("order_id", orderId),
  ]);

  const mevcutGonderiler: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
    .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
  const sorun = bolmeSorunu(secim, (kalemler ?? []) as SiparisKalemi[], mevcutGonderiler);
  if (sorun) return geriDon(orderId, { error: sorun });

  // Sipariş içindeki sıra: ekranda "2. paket" diye okunuyor.
  const sonrakiSira = Math.max(0, ...((gonderiler ?? []) as { sequence: number }[]).map((s) => s.sequence)) + 1;

  const { data: gonderi, error } = await supabase.from("arc_shipments").insert({
    organization_id: organization.id,
    order_id: orderId,
    sequence: sonrakiSira,
    source: "manual",
    status: "created",
    carrier_code: carrierCode,
    carrier_name: KARGO_FIRMALARI.find((firma) => firma.kod === carrierCode)?.ad ?? carrierCode,
    tracking_number: trackingNumber,
    tracking_url: takipAdresi(carrierCode, trackingNumber, elleAdres),
    supplier: supplier || null,
    shipped_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !gonderi) return geriDon(orderId, { error: error?.message ?? "gonderi-olusturulamadi" });

  /*
    Kalemler gönderiden SONRA yazılıyor; tetikleyici gönderinin siparişini
    kontrol ediyor, yani önce gönderi var olmalı. Bir kalem reddedilirse
    gönderi kalemsiz kalıyor — kullanıcıya hata gösteriliyor ve boş gönderi
    siliniyor, yoksa ekranda "0 ürün" taşıyan bir paket duruyordu.
  */
  const satirlar = Object.entries(secim).map(([kalemId, adet]) => ({
    organization_id: organization.id,
    shipment_id: gonderi.id,
    order_item_id: kalemId,
    quantity: adet,
  }));
  const { error: kalemHatasi } = await supabase.from("arc_shipment_items").insert(satirlar);
  if (kalemHatasi) {
    await supabase.from("arc_shipments").delete().eq("id", gonderi.id).eq("organization_id", organization.id);
    geriDon(orderId, { error: kalemHatasi.message });
  }

  revalidatePath(`/siparisler/${orderId}`);
  geriDon(orderId, { saved: "gonderi" });
}

/*
  Gönderi iptali kaydı SİLMİYOR, durumunu değiştiriyor: iptal edilen
  gönderinin kalemleri yeniden bölünebilir sayılıyor (tetikleyici iptali
  saymıyor) ve geçmişte hangi firmaya ne verildiği görünür kalıyor.
*/
export async function gonderiIptal(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");

  const { error } = await supabase.from("arc_shipments")
    .update({ status: "cancelled" })
    .eq("id", gonderiId).eq("organization_id", organization.id);
  if (error) return geriDon(orderId, { error: error.message });

  revalidatePath(`/siparisler/${orderId}`);
  geriDon(orderId, { saved: "gonderi-iptal" });
}
