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
export type IslemSonucu = { hata?: string; basari?: string; yeniStok?: number };

/*
  STOK HAREKETİ — çekirdek. İki yolu var, mantık burada:

    adjustInventory     form gönderimi (JavaScript kapalıyken de
                        çalışan yol). Sonucu çereze yazıp yönlendiriyor.
    stokHareketiSonuc   listeden, istemciden. Sonucu DÖNDÜRÜYOR.

  Ayrım neden gerekli: satır içi "+ Giriş / − Çıkış" her tıklamada tam
  bir gezinme başlatıyordu. Stok düzeltmesi seri yapılan bir iş —
  sayımdan sonra on varyantı tek tek girmek on kez başa dönmek demekti.

  YENİ STOK DÖNÜYOR: istemci iyimser olarak eski ± miktar gösteriyor
  ama son söz veritabanında (kısıt, eşzamanlı hareket). Gerçek değer
  geri gelince satır ona oturuyor.
*/
async function stokHareketi(
  varyantId: string,
  sku: string,
  yon: string,
  miktar: number,
  not: string,
): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();
  if (!["owner", "admin", "manager"].includes(membership.role)) return { hata: hataMetni("forbidden") };

  const amount = Number(miktar);
  if ((!varyantId && !sku) || !Number.isInteger(amount) || amount <= 0 || !["in", "out", "adjustment"].includes(yon)) {
    return { hata: hataMetni("invalid-movement") };
  }

  /* Varyant bu mağazaya ait olmalı; SKU ile gelen istek kimliğe çevrilir. */
  const lookup = supabase.from("arc_product_variants").select("id,sku").eq("organization_id", organization.id);
  const { data: variant } = await (varyantId ? lookup.eq("id", varyantId) : lookup.eq("sku", sku.trim().toUpperCase())).maybeSingle();
  if (!variant) return { hata: hataMetni("variant-not-found") };

  const quantity = yon === "out" ? -amount : amount;
  const { error } = await supabase.rpc("arc_adjust_inventory", {
    p_variant_id: variant.id,
    p_quantity: quantity,
    p_kind: yon,
    p_reference_type: "manual",
    p_reference_id: null,
    p_note: not || null,
  });

  /* Veritabanı mesajı kullanıcıya gösterilmiyor: teknik metin
     ("violates check constraint …") kimseye yol göstermiyor. */
  if (error) {
    console.error("[stok] hareket yazılamadı", variant.sku, error.message);
    return { hata: hataMetni("save-failed") };
  }

  /*
    GERÇEK stok geri okunuyor. İstemcinin iyimser hesabı (eski ± miktar)
    eşzamanlı bir hareketle ya da veritabanı kuralıyla ayrışabilir;
    yanlış bir adedi ekranda bırakmak, stok ekranında en pahalı hata.
  */
  const { data: guncel } = await supabase
    .from("arc_product_variants")
    .select("stock")
    .eq("organization_id", organization.id)
    .eq("id", variant.id)
    .maybeSingle();

  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath("/stok");
  return {
    basari: `${variant.sku}: ${quantity > 0 ? "+" : ""}${quantity} adet işlendi.`,
    yeniStok: typeof guncel?.stock === "number" ? guncel.stock : undefined,
  };
}

/** Liste: sonucu döndürür, yönlendirmez. */
export async function stokHareketiSonuc(
  varyantId: string,
  yon: string,
  miktar: number,
): Promise<IslemSonucu> {
  return await stokHareketi(String(varyantId ?? ""), "", String(yon ?? ""), Number(miktar), "");
}

/*
  Form gönderimi: JavaScript kapalıyken de çalışan yol ve detaylı form
  (SKU ile). Sonuç ÇEREZE yazılıyor, adres satırına değil — eskiden
  ?error= / ?updated= yazılıyordu ama sayfa çerezi okuyan
  PanelBildirimi'ni çiziyor, yani hiçbir mesaj görünmüyordu.

  backUrl duruyor ama yalnızca GİDİLECEK YOLU doğrulamak için; "back"
  dışarıdan geliyor.
*/
export async function adjustInventory(formData: FormData) {
  const sonuc = await stokHareketi(
    String(formData.get("variant_id") ?? ""),
    String(formData.get("sku") ?? ""),
    String(formData.get("direction") ?? "in"),
    Number(formData.get("quantity") ?? 0),
    String(formData.get("note") ?? "").trim().slice(0, 300),
  );
  return await bildirimliDonus(backUrl(formData.get("back"), "/stok", {}), sonuc);
}
