import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Müşteriye giden e-postalarda kullanılan mağaza kimliği.
 *
 * Kimlik e-postaları (kayıt doğrulama, şifre sıfırlama) ArvoCulture'a gömülü
 * yazılmıştı: logo, konu başlığı, metin, altbilgideki unvan ve adres. İkinci
 * mağaza açıldığında onun müşterisi "ArvoCulture hesabınızı doğrulayın"
 * e-postası alırdı — mağazayı başkasına sattığınızda kabul edilemez.
 *
 * Artık hepsi mağazanın kendi kaydından geliyor. Eksik alanlar bugünkü
 * ArvoCulture değerlerine düşüyor, yani mevcut davranış değişmiyor.
 */

export interface StoreBrand {
  name: string;
  logoUrl: string | null;
  siteUrl: string;
  legalName: string | null;
  legalAddress: string | null;
  /** Gönderen adresi: "Mağaza <adres@alanadi.com>". */
  from: string;
  replyTo: string | null;
}

const FALLBACK_NAME = "ArvoCulture";
const FALLBACK_SITE = (process.env.STOREFRONT_URL ?? "https://arvoculture.com").replace(/\/$/, "");
const FALLBACK_FROM = "ArvoCulture <siparis@arvoculture.com>";
const FALLBACK_REPLY_TO = "info@arvoculture.com";

type Row = {
  store_name: string | null;
  storefront_url: string | null;
  logo_path: string | null;
  email_from: string | null;
  email_reply_to: string | null;
  organizations?: { legal_name: string | null; legal_address: string | null; legal_city: string | null }
    | { legal_name: string | null; legal_address: string | null; legal_city: string | null }[]
    | null;
};

export async function getStoreBrand(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<StoreBrand> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select("store_name, storefront_url, logo_path, email_from, email_reply_to, organizations(legal_name, legal_address, legal_city)")
    .eq("organization_id", organizationId)
    .maybeSingle<Row>();

  /*
    Hata yutulmuyor: sütunlar eksikse (migration uygulanmamışsa) ya da izin
    yoksa sessizce varsayılan markaya düşerdik ve müşteriye yanlış mağaza
    kimliğiyle e-posta giderdi. Yine varsayılana düşüyoruz — e-posta hiç
    gitmemesindense gitsin — ama artık log'da görünüyor.
  */
  if (error) console.error("[marka] mağaza kimliği okunamadı", organizationId, error.message);

  const organization = Array.isArray(data?.organizations) ? data?.organizations[0] : data?.organizations;
  const name = data?.store_name?.trim() || FALLBACK_NAME;
  const siteUrl = (data?.storefront_url ?? FALLBACK_SITE).replace(/\/$/, "");

  const logoUrl = data?.logo_path
    ? supabase.storage.from("organization-assets").getPublicUrl(data.logo_path).data.publicUrl
    : null;

  const adres = [organization?.legal_address, organization?.legal_city].filter(Boolean).join(", ") || null;

  /*
    Gönderen adresi mağaza ayarında. Boşsa bugünkü adrese düşüyor: bir alan
    adından e-posta gönderebilmek için o alan adının Resend'de doğrulanmış
    olması gerekiyor (DNS işi), yani yeni mağaza kendi adresini ancak
    doğrulamayı yaptıktan sonra yazabilir.
  */
  return {
    name,
    logoUrl,
    siteUrl,
    legalName: organization?.legal_name ?? null,
    legalAddress: adres,
    from: data?.email_from?.trim() || FALLBACK_FROM,
    replyTo: data?.email_reply_to?.trim() || FALLBACK_REPLY_TO,
  };
}
