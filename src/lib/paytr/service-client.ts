import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_role anahtarıyla Supabase istemcisi. RLS'i atlar, bu
 * yüzden yalnızca sunucu tarafındaki ödeme servislerinde kullanılır.
 * Anahtar asla istemciye sızmamalıdır.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Ortam değişkeni eksik: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
