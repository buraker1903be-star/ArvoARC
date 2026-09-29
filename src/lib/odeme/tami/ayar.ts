import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/payment-credentials";
import { TAMI_UCLARI, type TamiUclari } from "./istek";
import type { TamiJwk, TamiKimligi } from "./imza";

/*
  MAĞAZANIN TAMİ YAPILANDIRMASI. lib/paytr/config.ts'in karşılığı.

  Anahtarlar kiracı başına ve şifreli (AES-256-GCM); çözülemeyen kayıt
  YAPILANDIRILMAMIŞ sayılıyor. Başka bir şifreleme anahtarıyla yazılmış
  bir kaydı "hazır" saymak, ödeme oturumunu açılmayacağı kesin bir
  istekle denemek demekti.

  Beş değerin HEPSİ gerekli: eksik yapılandırma "hazır" görünüp istek
  anında patlarsa, müşteri bütün formu doldurduktan sonra duvara
  çarpar — vitrinin kart seçeneğini gizleyebilmesinin sebebi bu.
*/

export interface TamiAyari {
  kimlik: TamiKimligi;
  jwk: TamiJwk;
  testModu: boolean;
  uclar: TamiUclari;
}

type Satir = {
  tami_enabled: boolean | null;
  tami_test_mode: boolean | null;
  tami_merchant_number: string | null;
  tami_terminal_number: string | null;
  tami_secret_key_enc: string | null;
  tami_jwk_kid: string | null;
  tami_jwk_k_enc: string | null;
};

export const TAMI_ALANLARI =
  "tami_enabled,tami_test_mode,tami_merchant_number,tami_terminal_number,tami_secret_key_enc,tami_jwk_kid,tami_jwk_k_enc";

/** Satırdan yapılandırma; eksikse ya da sır çözülemiyorsa null. */
export function tamiAyariCoz(satir: Satir | null | undefined): TamiAyari | null {
  if (!satir?.tami_enabled) return null;
  const { tami_merchant_number: merchant, tami_terminal_number: terminal, tami_jwk_kid: kid } = satir;
  if (!merchant || !terminal || !kid || !satir.tami_secret_key_enc || !satir.tami_jwk_k_enc) return null;

  let secretKey: string;
  let k: string;
  try {
    secretKey = decryptSecret(satir.tami_secret_key_enc);
    k = decryptSecret(satir.tami_jwk_k_enc);
  } catch {
    /* Başka bir şifreleme anahtarıyla yazılmış kayıt: yapılandırılmamış sayılıyor. */
    console.error("[tami] anahtarlar çözülemedi");
    return null;
  }

  const testModu = satir.tami_test_mode !== false;
  return {
    kimlik: { merchantNumber: merchant, terminalNumber: terminal, secretKey },
    jwk: { kid, k },
    testModu,
    uclar: testModu ? TAMI_UCLARI.test : TAMI_UCLARI.canli,
  };
}

export async function tamiAyari(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<TamiAyari | null> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select(TAMI_ALANLARI)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    /* Hata yutulmuyor: "yapılandırılmamış" ile "okunamadı" farklı şeyler. */
    console.error("[tami] ayarlar okunamadı", error.message);
    return null;
  }
  return tamiAyariCoz(data as unknown as Satir | null);
}
