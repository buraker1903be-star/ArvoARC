import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/payment-credentials";
import { GARANTI_UCLARI, type GarantiUclari } from "./istek";
import type { GarantiKimligi, GarantiSurum } from "./imza";

/*
  MAĞAZANIN GARANTİ YAPILANDIRMASI. lib/odeme/tami/ayar.ts'in karşılığı.

  Anahtarlar kiracı başına ve şifreli; çözülemeyen kayıt
  YAPILANDIRILMAMIŞ sayılıyor. Başka bir şifreleme anahtarıyla yazılmış
  bir kaydı "hazır" saymak, açılmayacağı kesin bir ödeme oturumunu
  denemek demekti.

  "Hazır" olmak için GEREKENLERİN HEPSİ aranıyor: eksik yapılandırma
  "hazır" görünüp istek anında patlarsa, müşteri bütün formu
  doldurduktan sonra duvara çarpar — vitrinin kart seçeneğini
  gizleyebilmesinin sebebi bu.

  İADE ŞİFRESİ GEREKLİ DEĞİL. Tahsilat PROVAUT ile yapılıyor; PROVRFN
  yalnızca iptal/iade için. Zorunlu tutmak, iadeyi henüz tanımlamamış
  bir mağazanın kartla ödemesini hiç açmamak olurdu.
*/

export interface GarantiAyari {
  kimlik: GarantiKimligi;
  guvenlikDuzeyi: string;
  yariGuvenliKabul: boolean;
  testModu: boolean;
  uclar: GarantiUclari;
}

type Satir = {
  garanti_enabled: boolean | null;
  garanti_test_mode: boolean | null;
  garanti_isyeri_no: string | null;
  garanti_terminal_no: string | null;
  garanti_provizyon_sifresi_enc: string | null;
  garanti_iade_sifresi_enc: string | null;
  garanti_magaza_anahtari_enc: string | null;
  garanti_api_surumu: string | null;
  garanti_guvenlik_duzeyi: string | null;
  garanti_yari_guvenli_kabul: boolean | null;
};

export const GARANTI_ALANLARI =
  "garanti_enabled,garanti_test_mode,garanti_isyeri_no,garanti_terminal_no,garanti_provizyon_sifresi_enc,garanti_iade_sifresi_enc,garanti_magaza_anahtari_enc,garanti_api_surumu,garanti_guvenlik_duzeyi,garanti_yari_guvenli_kabul";

export function garantiAyariCoz(satir: Satir | null | undefined): GarantiAyari | null {
  if (!satir?.garanti_enabled) return null;
  const isyeri = satir.garanti_isyeri_no;
  const terminal = satir.garanti_terminal_no;
  if (!isyeri || !terminal || !satir.garanti_provizyon_sifresi_enc || !satir.garanti_magaza_anahtari_enc) return null;

  let provizyonSifresi: string;
  let magazaAnahtari: string;
  let iadeSifresi: string | null = null;
  try {
    provizyonSifresi = decryptSecret(satir.garanti_provizyon_sifresi_enc);
    magazaAnahtari = decryptSecret(satir.garanti_magaza_anahtari_enc);
    if (satir.garanti_iade_sifresi_enc) iadeSifresi = decryptSecret(satir.garanti_iade_sifresi_enc);
  } catch {
    /* Başka bir şifreleme anahtarıyla yazılmış kayıt. */
    console.error("[garanti] anahtarlar çözülemedi");
    return null;
  }

  const testModu = satir.garanti_test_mode !== false;
  return {
    kimlik: {
      isyeriNo: isyeri,
      terminalNo: terminal,
      provizyonSifresi,
      iadeSifresi,
      magazaAnahtari,
      /* Bilinmeyen değer v512'ye düşüyor: bankanın yeni hesaplarda
         verdiği sürüm bu ve kısıt zaten iki değerden birini tutuyor. */
      surum: (satir.garanti_api_surumu === "v0.01" ? "v0.01" : "v512") as GarantiSurum,
    },
    guvenlikDuzeyi: satir.garanti_guvenlik_duzeyi || "3D_PAY_HOSTING",
    yariGuvenliKabul: satir.garanti_yari_guvenli_kabul === true,
    testModu,
    uclar: testModu ? GARANTI_UCLARI.test : GARANTI_UCLARI.canli,
  };
}

export async function garantiAyari(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<GarantiAyari | null> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select(GARANTI_ALANLARI)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    /* Hata yutulmuyor: "yapılandırılmamış" ile "okunamadı" farklı şeyler. */
    console.error("[garanti] ayarlar okunamadı", error.message);
    return null;
  }
  return garantiAyariCoz(data as unknown as Satir | null);
}
