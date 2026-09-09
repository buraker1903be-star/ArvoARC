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

  const { error } = await supabase
    .from("arc_suppliers")
    .update({
      margin_percent: Math.round(margin),
      // Kargo payı ve yuvarlama kuruş cinsinden saklanıyor.
      shipping_markup: Math.round(shipping * 100),
      round_to_kurus: Math.round(round),
      publish_directly: publishDirectly,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .eq("code", code);

  if (error) redirect("/tedarikci?error=save-failed");

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
