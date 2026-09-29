import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { konakSadelestir, vitrinDefteri } from "@/lib/magaza-adresi";

/**
 * Vitrin isteğinin hangi mağazadan geldiğini bulur.
 *
 * Her vitrinin alan adı arc_store_settings'te kayıtlı: doğrulanmış özel alan
 * adı, platform alt alan adı ya da storefront_url. Origin başlığındaki konağı
 * bunlarla eşleştiriyoruz; böylece hem işlem doğru mağazaya yazılıyor hem CORS
 * yalnızca gerçekten kayıtlı vitrinlere açılıyor.
 *
 * Eskiden her uç kendi ALLOWED_ORIGINS listesini tutuyordu ve hepsi
 * arvoculture'a sabitliydi. Tek yerde toplandı: yeni mağaza eklemek için kod
 * değiştirmek gerekmiyor, mağaza ayarlarına alan adını yazmak yeterli.
 */

export const FALLBACK_ORIGIN = process.env.STOREFRONT_URL ?? "https://arvoculture.com";

/* Eşleştirme kuralı lib/magaza-adresi.ts'te: panelin "adresin bu"
   dediği yerle buranın kabul ettiği yer aynı olmak zorunda. */
export const normalizeHost = konakSadelestir;

export function storefrontCorsHeaders(origin: string | null, allow: boolean) {
  return {
    "Access-Control-Allow-Origin": allow && origin ? origin : FALLBACK_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/*
  Mağaza alan adları kısa süreli önbellekte. Her istekte veritabanına gitseydik
  bu sorgu hız sınırlayıcıdan ÖNCE çalışır ve sınırlayıcının koruduğu yüzeyi
  delerdi. Alan adı nadiren değişir; bir dakikalık gecikme yeni mağazanın ilk
  isteğini geciktirir, o kadar.
*/
let storeCache: { at: number; defter: Map<string, string> } | null = null;
const CACHE_MS = 60_000;

async function storeDirectory(supabase: SupabaseClient) {
  if (storeCache && Date.now() - storeCache.at < CACHE_MS) return storeCache.defter;
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select("organization_id, custom_domain, domain_verified_at, platform_subdomain, storefront_url");
  if (error || !data) return storeCache?.defter ?? new Map<string, string>();
  const defter = vitrinDefteri(data);
  storeCache = { at: Date.now(), defter };
  return defter;
}

export async function resolveStore(supabase: SupabaseClient, origin: string | null) {
  if (!origin) return null;
  return (await storeDirectory(supabase)).get(normalizeHost(origin)) ?? null;
}
