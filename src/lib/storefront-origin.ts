import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** "www." öneki yok sayılır: aynı mağazanın iki adresi. */
export function normalizeHost(value: string) {
  const withScheme = value.includes("://") ? value : `https://${value}`;
  try {
    return new URL(withScheme).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "");
  }
}

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
let storeCache: { at: number; rows: { organizationId: string; hosts: string[] }[] } | null = null;
const CACHE_MS = 60_000;

async function storeDirectory(supabase: SupabaseClient) {
  if (storeCache && Date.now() - storeCache.at < CACHE_MS) return storeCache.rows;
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select("organization_id, custom_domain, platform_subdomain, storefront_url");
  if (error || !data) return storeCache?.rows ?? [];
  const rows = data.map((store) => ({
    organizationId: store.organization_id as string,
    hosts: [store.custom_domain, store.platform_subdomain, store.storefront_url]
      .filter(Boolean)
      .map((value) => normalizeHost(String(value))),
  }));
  storeCache = { at: Date.now(), rows };
  return rows;
}

export async function resolveStore(supabase: SupabaseClient, origin: string | null) {
  if (!origin) return null;
  const host = normalizeHost(origin);
  const rows = await storeDirectory(supabase);
  return rows.find((store) => store.hosts.includes(host))?.organizationId ?? null;
}
