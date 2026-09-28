"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { requireTenant } from "@/lib/tenant";
import { backUrl } from "@/lib/back-url";
import { hataMetni } from "./mesajlar";

/**
 * Stok hareketi. Listedeki satır içi "+ Giriş / − Çıkış" (varyant
 * kimliğiyle) ve detaylı form (SKU ile) aynı işlemi kullanır.
 *
 * Öncesinde form yalnızca listenin ilk 100 varyantını açılır
 * listede sunuyordu: kalan varyantların stoğu panelden
 * değiştirilemiyordu.
 */
export async function adjustInventory(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  /*
    SONUÇ ÇEREZE, adres satırına değil.

    Eskiden redirect(backUrl(..., {error})) kullanılıyordu ve sonuç
    ?error= / ?updated= olarak adrese yazılıyordu — ama sayfa çerezi
    okuyan PanelBildirimi'ni çiziyor. Yani stok girişi de çıkışı da,
    başarı da hata da EKRANDA HİÇ GÖRÜNMÜYORDU: kullanıcı adedin
    değişip değişmediğini listeyi gözleyerek anlamak zorundaydı,
    başarısız bir hareket ise sessizce kayboluyordu.

    backUrl duruyor ama yalnızca GİDİLECEK YOLU doğrulamak için;
    "back" dışarıdan geldiği için başka bir bölüme ya da dış adrese
    yönlendirmesi engelleniyor.
  */
  const back = (sonuc: { hata?: string; basari?: string }) =>
    bildirimliDonus(backUrl(formData.get("back"), "/stok", {}), sonuc);
  if (!["owner", "admin", "manager"].includes(membership.role)) return await back({ hata: hataMetni("forbidden") });

  const direction = String(formData.get("direction") ?? "in");
  const amount = Number(formData.get("quantity") ?? 0);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const variantInput = String(formData.get("variant_id") ?? "");
  const skuInput = String(formData.get("sku") ?? "").trim().toUpperCase();

  if ((!variantInput && !skuInput) || !Number.isInteger(amount) || amount <= 0 || !["in", "out", "adjustment"].includes(direction)) {
    return await back({ hata: hataMetni("invalid-movement") });
  }

  /* Varyant bu mağazaya ait olmalı; SKU ile gelen istek kimliğe çevrilir. */
  const lookup = supabase.from("arc_product_variants").select("id,sku").eq("organization_id", organization.id);
  const { data: variant } = await (variantInput ? lookup.eq("id", variantInput) : lookup.eq("sku", skuInput)).maybeSingle();
  if (!variant) return await back({ hata: hataMetni("variant-not-found") });

  const quantity = direction === "out" ? -amount : amount;
  const { error } = await supabase.rpc("arc_adjust_inventory", {
    p_variant_id: variant.id,
    p_quantity: quantity,
    p_kind: direction,
    p_reference_type: "manual",
    p_reference_id: null,
    p_note: note || null,
  });

  /* Veritabanı mesajı kullanıcıya gösterilmiyor: teknik metin
     ("violates check constraint …") kimseye yol göstermiyor. */
  if (error) {
    console.error("[stok] hareket yazılamadı", variant.sku, error.message);
    return await back({ hata: hataMetni("save-failed") });
  }
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath("/stok");
  return await back({ basari: `${variant.sku}: ${quantity > 0 ? "+" : ""}${quantity} adet işlendi.` });
}
