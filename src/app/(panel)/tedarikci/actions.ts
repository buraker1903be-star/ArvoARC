"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

/**
 * Tedarikçi fiyat kuralını günceller.
 *
 * Öncesinde bu ayarı değiştirmek için doğrudan veritabanına SQL
 * yazmak gerekiyordu.
 */
export async function updateSupplier(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin"].includes(membership.role)) {
    redirect("/tedarikci?error=forbidden");
  }

  const code = String(formData.get("code") ?? "").trim();
  const margin = Number(formData.get("margin_percent") ?? 0);
  const shipping = Number(formData.get("shipping_markup") ?? 0);
  const round = Number(formData.get("round_to_kurus") ?? 0);
  /* Ek hizmet bedeli: paketleme, kalite kontrol, etiket gibi
     tedarikçi hizmetlerinin ürün başına maliyeti. */
  const service = Number(formData.get("service_fee") ?? 0);
  /* Stok tamponu: tedarikçi stoğu bu değerin altına düşerse
     ürün satışa kapanır. */
  const buffer = Number(formData.get("stock_buffer") ?? 5);
  const publishDirectly = formData.get("publish_directly") === "on";

  if (!code) redirect("/tedarikci?error=missing-code");

  /*
    Sınırlar: negatif kâr oranı zararına satış demektir ve
    kazayla girilmesi kolaydır. Üst sınır da makul bir yerde
    duruyor; %1000 kâr oranı yazım hatası olma ihtimali yüksek.
  */
  if (!Number.isFinite(margin) || margin < 0 || margin > 500) {
    redirect("/tedarikci?error=invalid-margin");
  }
  if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100000) {
    redirect("/tedarikci?error=invalid-shipping");
  }
  if (!Number.isFinite(round) || round < 0 || round > 99) {
    redirect("/tedarikci?error=invalid-round");
  }
  if (!Number.isFinite(service) || service < 0 || service > 10000) {
    redirect("/tedarikci?error=invalid-service");
  }
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 100) {
    redirect("/tedarikci?error=invalid-buffer");
  }

  const { data: saved, error } = await supabase
    .from("arc_suppliers")
    .update({
      margin_percent: Math.round(margin),
      // Kargo payı, ek hizmet bedeli ve yuvarlama kuruş cinsinden saklanıyor.
      shipping_markup: Math.round(shipping * 100),
      round_to_kurus: Math.round(round),
      /*
        service_fee ve stock_buffer okunuyor ve doğrulanıyordu ama update
        gövdesinde YOKTU: kullanıcı değeri giriyor, "kaydedildi" görüyor,
        değer hiçbir yere yazılmıyordu. service_fee içe aktarımda satış
        fiyatına giriyor (api/tedarikci/ice-aktar), yani kaydedilmemesi
        doğrudan fiyatı etkiliyordu.

        NOT: stock_buffer artık saklanıyor ama henüz hiçbir davranışı yok —
        "tedarikçi stoğu bu değerin altına düşerse ürün satışa kapanır"
        kuralı kodda uygulanmıyor.
      */
      service_fee: Math.round(service * 100),
      stock_buffer: Math.round(buffer),
      publish_directly: publishDirectly,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("code", code)
    .select("code");

  if (error) redirect("/tedarikci?error=save-failed");
  /* RLS elerse ya da kod eşleşmezse hata değil 0 satır döner; doğrulanmazsa
     kullanıcı kaydedilmeyen ayarı kaydedilmiş sanır. */
  if (!saved?.length) redirect("/tedarikci?error=save-failed");

  revalidatePath("/tedarikci");
  redirect("/tedarikci?ok=saved");
}

/**
 * Aktarım imlecini sıfırlar.
 *
 * Aktarım yarıda kaldığında ya da baştan çalıştırmak
 * gerektiğinde kullanılır.
 */
export async function resetCursor(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!["owner", "admin"].includes(membership.role)) {
    redirect("/tedarikci?error=forbidden");
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) redirect("/tedarikci?error=missing-code");

  const { error } = await supabase
    .from("arc_suppliers")
    .update({ sync_cursor: 0, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id)
    .eq("code", code);

  if (error) redirect("/tedarikci?error=save-failed");

  revalidatePath("/tedarikci");
  redirect("/tedarikci?ok=reset");
}
