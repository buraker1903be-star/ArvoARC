import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/payment-credentials";

/**
 * PayTR yapılandırması. MERCHANT_KEY ve MERCHANT_SALT gizlidir ve
 * hiçbir koşulda istemciye gönderilmez; bu yüzden NEXT_PUBLIC_
 * öneki kullanılmaz ve bu modül server-only işaretlidir.
 *
 * Anahtarlar mağaza başınadır: her mağaza kendi PayTR hesabının
 * bilgilerini panelden girer, şifreli olarak arc_store_settings'te
 * saklanır. Ortam değişkenleri yalnızca geçiş dönemi içindir —
 * aşağıdaki "eski mağaza" kuralına bakın.
 */
function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Ortam değişkeni eksik: ${name}`);
  }
  return value;
}

export interface PaytrStoreConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  /** "1" = test modu. */
  testMode: string;
  storeUrl: string;
}

/**
 * Ortam değişkenlerindeki anahtarlar. Bunlar ArvoCulture'ın kendi PayTR
 * hesabına ait; ARC'ın değil. Yeni mağazalar bunları KULLANMAZ, yoksa
 * tahsilatları ArvoCulture'ın hesabına düşer.
 */
function legacyConfig(storeUrl: string): PaytrStoreConfig {
  return {
    merchantId: required("PAYTR_MERCHANT_ID"),
    merchantKey: required("PAYTR_MERCHANT_KEY"),
    merchantSalt: required("PAYTR_MERCHANT_SALT"),
    testMode: process.env.PAYTR_TEST_MODE === "0" ? "0" : "1",
    storeUrl,
  };
}

export class PaytrNotConfiguredError extends Error {
  constructor(organizationId: string) {
    super(`Mağazanın PayTR bilgileri girilmemiş (organization_id: ${organizationId})`);
    this.name = "PaytrNotConfiguredError";
  }
}

type SettingsRow = {
  paytr_merchant_id: string | null;
  paytr_merchant_key_enc: string | null;
  paytr_merchant_salt_enc: string | null;
  paytr_test_mode: boolean | null;
  storefront_url: string | null;
  organizations?: { slug: string | null } | { slug: string | null }[] | null;
};

const slugOf = (row: SettingsRow) =>
  (Array.isArray(row.organizations) ? row.organizations[0]?.slug : row.organizations?.slug) ?? null;

/**
 * Mağazanın PayTR bilgilerini getirir.
 *
 * Kendi anahtarını girmiş mağaza kendi hesabını kullanır. Girmemişse
 * yalnızca PAYTR_LEGACY_ORGANIZATION_SLUG ile işaretlenen tek mağaza
 * ortam değişkenlerine düşebilir; diğerleri hata alır. Böylece anahtarını
 * girmemiş yeni bir mağaza sessizce başkasının hesabına tahsilat yapmaz.
 */
export async function storePaytrConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PaytrStoreConfig> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select(
      "paytr_merchant_id, paytr_merchant_key_enc, paytr_merchant_salt_enc, paytr_test_mode, storefront_url, organizations(slug)",
    )
    .eq("organization_id", organizationId)
    .maybeSingle<SettingsRow>();
  if (error) throw error;

  const storeUrl = (data?.storefront_url ?? process.env.STOREFRONT_URL ?? "https://arvoculture.com").replace(/\/$/, "");

  if (data?.paytr_merchant_id && data.paytr_merchant_key_enc && data.paytr_merchant_salt_enc) {
    return {
      merchantId: data.paytr_merchant_id,
      merchantKey: decryptSecret(data.paytr_merchant_key_enc),
      merchantSalt: decryptSecret(data.paytr_merchant_salt_enc),
      testMode: data.paytr_test_mode === false ? "0" : "1",
      storeUrl,
    };
  }

  const legacySlug = process.env.PAYTR_LEGACY_ORGANIZATION_SLUG;
  if (legacySlug && data && slugOf(data) === legacySlug) {
    return legacyConfig(storeUrl);
  }

  throw new PaytrNotConfiguredError(organizationId);
}
