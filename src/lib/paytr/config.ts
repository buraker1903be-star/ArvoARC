import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/payment-credentials";
import { magazaAdresi } from "@/lib/magaza-adresi";

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
  /*
    Mağaza panelden "PayTR ile ödeme"yi kapattı mı. Yapılandırmanın kendisi
    yine döner: iade ve gelen bildirimin imza doğrulaması, mağaza kartla
    ödemeyi kapatsa da çalışmak zorunda. Yalnızca YENİ ödeme başlatan yol
    bu bayrağa bakar.
  */
  enabled: boolean;
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  /** "1" = test modu. */
  testMode: string;
  /*
    Ödeme sonrası müşterinin döneceği yer. Adresi çözülemeyen mağaza
    için NULL: yedek adres ArvoCulture'dı ve kendi PayTR hesabıyla
    tahsilat yapan BAŞKA bir mağazanın müşterisi, ödedikten sonra o
    markanın sitesine düşüyordu. Yalnızca ödeme başlatan yol bu alanı
    kullanıyor; iade ve bildirim doğrulaması kullanmıyor.
  */
  storeUrl: string | null;
}

/**
 * Ortam değişkenlerindeki anahtarlar. Bunlar ArvoCulture'ın kendi PayTR
 * hesabına ait; ArvoARC'ın değil. Yeni mağazalar bunları KULLANMAZ, yoksa
 * tahsilatları ArvoCulture'ın hesabına düşer.
 */
function legacyConfig(storeUrl: string | null): PaytrStoreConfig {
  return {
    enabled: true,
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
  paytr_enabled: boolean | null;
  paytr_merchant_id: string | null;
  paytr_merchant_key_enc: string | null;
  paytr_merchant_salt_enc: string | null;
  paytr_test_mode: boolean | null;
  storefront_url: string | null;
  custom_domain: string | null;
  domain_verified_at: string | null;
  platform_subdomain: string | null;
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
  /*
    İsteğin geldiği kök (https://konak). resolveStore bunu zaten
    mağazanın kayıtlı adresleriyle eşleştirdiği için güvenilir ve
    en doğrusu: müşteri ödemeden sonra BULUNDUĞU vitrine dönüyor.
  */
  istekKoku?: string | null,
): Promise<PaytrStoreConfig> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select(
      "paytr_enabled, paytr_merchant_id, paytr_merchant_key_enc, paytr_merchant_salt_enc, paytr_test_mode, storefront_url, custom_domain, domain_verified_at, platform_subdomain, organizations(slug)",
    )
    .eq("organization_id", organizationId)
    .maybeSingle<SettingsRow>();
  if (error) throw error;

  const storeUrl = (istekKoku?.trim() || (data ? magazaAdresi(data) : null))?.replace(/\/$/, "") ?? null;

  if (data?.paytr_merchant_id && data.paytr_merchant_key_enc && data.paytr_merchant_salt_enc) {
    return {
      enabled: data.paytr_enabled !== false,
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
