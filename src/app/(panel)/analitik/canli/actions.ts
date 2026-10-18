"use server";

import { canliVeriOku, type CanliVeri } from "./veri";

/**
 * Ekranın yenileme çağrısı.
 *
 * Ayrı bir API rotası yerine sunucu işlemi: yetki kontrolü
 * (requireTenant) ve mağaza kapsamı zaten orada, ikinci bir uçta
 * aynı kontrolleri tekrarlamak onların birinde unutulması
 * demekti.
 */
export async function canliYenile(): Promise<CanliVeri> {
  return await canliVeriOku();
}
