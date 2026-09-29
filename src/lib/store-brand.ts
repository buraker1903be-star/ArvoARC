import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { magazaAdresi } from "@/lib/magaza-adresi";
import { YEDEK_GONDEREN, YEDEK_YANIT, gonderenAdresi } from "@/lib/eposta-gonderen";

/**
 * Müşteriye giden e-postalarda kullanılan mağaza kimliği.
 *
 * Kimlik e-postaları (kayıt doğrulama, şifre sıfırlama) ArvoCulture'a gömülü
 * yazılmıştı: logo, konu başlığı, metin, altbilgideki unvan ve adres. İkinci
 * mağaza açıldığında onun müşterisi "ArvoCulture hesabınızı doğrulayın"
 * e-postası alırdı — mağazayı başkasına sattığınızda kabul edilemez.
 *
 * Artık hepsi mağazanın kendi kaydından geliyor.
 *
 * YEDEKLER DE ArvoCulture'DI. Adı olmayan mağaza "ArvoCulture" diye
 * imzalıyor, adresi olmayan mağazanın e-postasındaki bağlantı o markanın
 * sitesine gidiyordu. Ad artık kurumun kendi adına, adres kiracının
 * çözülmüş vitrin adresine düşüyor; adres hiç yoksa null ve bağlantı
 * yazılmıyor — yanlış mağazaya göndermektense hiç göndermemek yeğdir.
 *
 * GÖNDEREN ADRESİ ayrı bir iş: bir alan adından e-posta atabilmek için
 * o alan adının Resend'de doğrulanmış olması gerekiyor, yani yeni mağaza
 * kendi adresini ancak DNS doğrulamasından sonra kullanabilir. O yüzden
 * adres platformun doğrulanmış adresine düşüyor (lib/eposta-gonderen.ts)
 * ama GÖRÜNEN AD mağazanın kendi adı oluyor: müşterinin okuduğu isim
 * artık komşunun markası değil.
 */

export interface StoreBrand {
  name: string;
  logoUrl: string | null;
  /** Mağazanın açık adresi; çözülemezse null (bkz. lib/magaza-adresi.ts). */
  siteUrl: string | null;
  legalName: string | null;
  legalAddress: string | null;
  /** Gönderen adresi: "Mağaza <adres@alanadi.com>". */
  from: string;
  replyTo: string | null;
}

type Kurum = { name: string | null; legal_name: string | null; legal_address: string | null; legal_city: string | null };

type Row = {
  store_name: string | null;
  storefront_url: string | null;
  custom_domain: string | null;
  domain_verified_at: string | null;
  platform_subdomain: string | null;
  logo_path: string | null;
  email_from: string | null;
  email_reply_to: string | null;
  organizations?: Kurum | Kurum[] | null;
};

export async function getStoreBrand(
  supabase: SupabaseClient,
  organizationId: string,
  /* İsteğin geldiği kök; vitrin uçlarında müşterinin bulunduğu adres. */
  istekKoku?: string | null,
): Promise<StoreBrand> {
  const { data, error } = await supabase
    .from("arc_store_settings")
    .select(
      "store_name, storefront_url, custom_domain, domain_verified_at, platform_subdomain, logo_path, email_from, email_reply_to, organizations(name, legal_name, legal_address, legal_city)",
    )
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
  const name = data?.store_name?.trim() || organization?.name?.trim() || "Mağaza";
  const siteUrl = (istekKoku?.trim() || (data ? magazaAdresi(data) : null))?.replace(/\/$/, "") ?? null;

  const logoUrl = data?.logo_path
    ? supabase.storage.from("organization-assets").getPublicUrl(data.logo_path).data.publicUrl
    : null;

  const adres = [organization?.legal_address, organization?.legal_city].filter(Boolean).join(", ") || null;

  /*
    Gönderen adresi mağaza ayarında. Boşsa platformun doğrulanmış adresine
    düşüyor ama görünen ad mağazanın kendi adı: alan adı doğrulaması
    (DNS işi) tamamlanana kadar teknik olarak başka adresten gönderemeyiz,
    müşterinin okuduğu ismin yanlış olması ise gereksizdi.
  */
  return {
    name,
    logoUrl,
    siteUrl,
    legalName: organization?.legal_name ?? null,
    legalAddress: adres,
    from: data?.email_from?.trim() || gonderenAdresi(name, YEDEK_GONDEREN),
    replyTo: data?.email_reply_to?.trim() || YEDEK_YANIT,
  };
}
