"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { backUrl } from "@/lib/back-url";
/* Eskiden bu dosyanın kendi slugify'ı vardı ve NOKTASIZ ı'yı düşürüyordu:
   "Kırmızı Elbise" burada "k-rm-z-elbise", düzenleyicide
   "kirmizi-elbise" oluyordu (bkz. lib/slug.ts). */
import { slugla } from "@/lib/slug";

const MANAGERS = ["owner", "admin", "manager"];
const STATUSES = ["active", "draft", "archived"];

export async function createProduct(formData: FormData) {
  const { supabase, user, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return await bildirimliDonus("/urunler",{hata:hataMetni("forbidden")});

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const priceInput = Number(formData.get("price") ?? 0);
  const compareAtPriceInput = Number(formData.get("compare_at_price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";

  if (!name || !sku || !Number.isFinite(priceInput) || priceInput < 0 || !Number.isFinite(compareAtPriceInput) || compareAtPriceInput < 0 || !Number.isInteger(stock)) return await bildirimliDonus("/urunler?yeni=1#yeni-urun",{hata:hataMetni("invalid-product")});

  const slug = `${slugla(name, 140)}-${Date.now().toString(36)}`;
  const price = Math.round(priceInput * 100);
  const compareAtPrice = compareAtPriceInput > priceInput ? Math.round(compareAtPriceInput * 100) : null;
  const { data: product, error: productError } = await supabase.from("arc_products").insert({ organization_id: organization.id, name, slug, description, status: status === "active" ? "active" : "draft", source: "native", created_by: user.id }).select("id").single();
  if (productError) return await bildirimliDonus("/urunler?yeni=1#yeni-urun",{hata:hataMetni(productError.code ?? "product-create")});

  const { error: variantError } = await supabase.from("arc_product_variants").insert({ organization_id: organization.id, product_id: product.id, sku, price, compare_at_price: compareAtPrice, currency: "TRY", stock, allow_backorder: allowBackorder, attributes: {} });
  if (variantError) {
    await supabase.from("arc_products").delete().eq("id", product.id).eq("organization_id", organization.id);
    return await bildirimliDonus("/urunler?yeni=1#yeni-urun",{hata:hataMetni(variantError.code ?? "variant-create")});
  }

  revalidatePath("/");
  revalidatePath("/urunler");
  /* Yeni ürün doğrudan düzenleyicide açılır: görsel, açıklama ve
     SEO bir sonraki adım. */
  return await bildirimliDonus(`/urunler/${product.id}`,{basari:basariMetni("created")});
}

/**
 * Seçilen ürünlerin durumu (listede işaretlenenler).
 *
 * Yalnızca durumu farklı olanlar güncellenir; aynı durumdakiler
 * atlanır ve sayısı bildirilir.
 */
export type IslemSonucu = { hata?: string; basari?: string };

/*
  SEÇİLENLERİN DURUMU — çekirdek. İki yerden çağrılıyor:

    bulkSetStatus     form gönderimi (JavaScript kapalıyken de çalışan
                      yol). Sonucu çereze yazıp geri yönlendiriyor.
    topluDurumSonuc   listeden, istemciden. Sonucu DÖNDÜRÜYOR.

  Ayrım neden: toplu işlem tam bir gezinme başlatıyordu, yani kaydırma
  yeri ve seçim gidiyor, liste baştan çiziliyordu. Yönlendirme kalkınca
  revalidatePath veriyi yine yeniliyor ama kullanıcı yerinde kalıyor.

  Yetki, durum listesi ve kurum kısıtı çekirdekte; istemciye
  güvenilmiyor, yalnızca sonucun nereye gideceği değişiyor.
*/
async function topluDurum(rawIds: string[], status: string): Promise<IslemSonucu> {
  const { supabase, organization, membership } = await requireTenant();
  if (!MANAGERS.includes(membership.role)) return { hata: hataMetni("forbidden") };

  const ids = [...new Set(rawIds.map(String).filter(Boolean))].slice(0, 100);
  if (!STATUSES.includes(status)) return { hata: hataMetni("invalid-status") };
  if (!ids.length) return { hata: hataMetni("bulk-empty") };

  const { data, error } = await supabase
    .from("arc_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id)
    .in("id", ids)
    .neq("status", status)
    .select("id");
  if (error) return { hata: hataMetni("bulk-failed") };

  const updated = data?.length ?? 0;
  const skipped = ids.length - updated;
  revalidatePath("/");
  revalidatePath("/urunler");
  /* Atlananlar SÖYLENİYOR: aynı durumdaki ürünler güncellenmiyor ve
     "5 seçtim, 2 değişti" farkı açıklanmazsa eksik işlem sanılıyor. */
  return {
    basari:
      `${updated.toLocaleString("tr-TR")} ürünün durumu güncellendi.` +
      (skipped > 0 ? ` ${skipped.toLocaleString("tr-TR")} ürün zaten bu durumdaydı, atlandı.` : ""),
  };
}

/** Liste: sonucu döndürür, yönlendirmez. */
export async function topluDurumSonuc(ids: string[], status: string): Promise<IslemSonucu> {
  return await topluDurum(Array.isArray(ids) ? ids : [], String(status ?? ""));
}

export async function bulkSetStatus(formData: FormData) {
  /*
    JavaScript KAPALIYKEN çalışan yol. Mantık çekirdekte; burada
    yalnızca sonucun nereye gideceği belirleniyor.

    Sonuç ÇEREZE yazılıyor, adres satırına değil: bu eylem
    redirect(backUrl(…,{error})) kullanıyordu ve sayfa çerezi okuyan
    PanelBildirimi'ni çiziyor, yani hiçbir mesaj görünmüyordu —
    başarısızlıkta bile. Karşıtlığı aynı dosyada duruyordu
    (bulkUpdateStatus konuşuyor, bu susuyordu).

    backUrl duruyor ama yalnızca GİDİLECEK YOLU doğrulamak için;
    "back" dışarıdan geliyor.
  */
  const sonuc = await topluDurum(
    formData.getAll("product_id").map(String),
    String(formData.get("status") ?? ""),
  );
  return await bildirimliDonus(backUrl(formData.get("back"), "/urunler", {}), sonuc);
}

/**
 * Toplu durum değişikliği (filtreye uyan tüm ürünler).
 *
 * 3.264 tedarikçi ürününü tek tek yayınlamak makul değil.
 * Bu eylem bir filtreye uyan tüm ürünlerin durumunu değiştirir.
 *
 * Filtre zorunlu: filtresiz çalıştırmak tüm katalogu tek
 * hamlede değiştirir ve geri alması zordur.
 */
export async function bulkUpdateStatus(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();

  if (!MANAGERS.includes(membership.role)) {
    return await bildirimliDonus("/urunler",{hata:hataMetni("forbidden")});
  }

  const status = String(formData.get("status") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const collectionSlug = String(formData.get("collection") ?? "").trim();
  const currentStatus = String(formData.get("current_status") ?? "").trim();

  if (!STATUSES.includes(status)) {
    return await bildirimliDonus("/urunler",{hata:hataMetni("invalid-status")});
  }

  // En az bir daraltıcı koşul olmalı.
  if (!supplier && !collectionSlug) {
    return await bildirimliDonus("/urunler",{hata:hataMetni("bulk-needs-filter")});
  }

  let query = supabase
    .from("arc_products")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id);

  if (supplier) query = query.eq("supplier", supplier);
  if (currentStatus) query = query.eq("status", currentStatus);

  if (collectionSlug) {
    const { data: collection } = await supabase
      .from("arc_collections")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("slug", collectionSlug)
      .maybeSingle();

    if (!collection) return await bildirimliDonus("/urunler",{hata:hataMetni("collection-not-found")});

    const { data: members } = await supabase
      .from("arc_collection_products")
      .select("product_id")
      .eq("collection_id", collection.id);

    const ids = (members ?? []).map((row) => row.product_id);
    if (ids.length === 0) return await bildirimliDonus("/urunler",{hata:hataMetni("empty-collection")});

    query = query.in("id", ids);
  }

  const { data, error } = await query.select("id");
  if (error) return await bildirimliDonus("/urunler",{hata:hataMetni("bulk-failed")});

  revalidatePath("/");
  revalidatePath("/urunler");
  /* Güncellenen sayısı artık ADRESTE değil MESAJDA: sayı adres satırında
     taşınınca dışarıdan uydurulabiliyordu. */
  return await bildirimliDonus("/urunler",{basari:`Toplu durum değişikliği uygulandı · ${data?.length ?? 0} ürün.`});
}
