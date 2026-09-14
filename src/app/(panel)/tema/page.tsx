import type { Metadata } from "next";
import { Icon } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import { requireTenant } from "@/lib/tenant";
import { ThemeEditor, type Theme } from "./theme-editor";
import "./theme.css";

export const metadata: Metadata = { title: "Mağaza Tasarımı" };

const defaults: Theme = {
  announcement: "2.000 TL üzeri ücretsiz kargo • İlk alışverişe ARVO10",
  hero_eyebrow: "ARVOCULTURE · APPAREL & BEAUTY", hero_title: "Seçtiğin şey,", hero_emphasis: "senin hikâyen.",
  hero_description: "Tarzını, bakımını ve gündelik ritüellerini tek bir kültürde buluşturan özgün seçkiler.",
  primary_cta_label: "Giyimi keşfet", primary_cta_href: "/koleksiyon/giyim", secondary_cta_label: "Bakımı keşfet", secondary_cta_href: "/koleksiyon/bakim",
  featured_eyebrow: "ÖNE ÇIKANLAR", featured_title: "Şimdi keşfet.",
  campaign_title: "İlk seçimine özel.", campaign_description: "İlk siparişinde ARVO10 koduyla %10 indirim.",
  manifest_title: "İki dünya. Tek yaşam kültürü.", manifest_description: "Giydiğin parçadan günlük bakım ritüeline kadar her seçim, kendini anlatma biçimindir.",
  apparel_title: "Kendini giy.", apparel_description: "Zamansız parçalar. Özgün duruşlar.",
  beauty_title: "Kendine iyi bak.", beauty_description: "Günlük ritüelin için seçilmiş bakım.",
  trust_one: "Seçilmiş ürünler", trust_two: "Güvenli ödeme", trust_three: "Özenli paketleme", trust_four: "Kolay iade",
  footer_tagline: "Giyim, bakım ve gündelik ritüeller için seçilmiş bir yaşam kültürü.",
  show_manifest: true, show_worlds: true, show_featured: true, show_campaign: true, show_values: true,
  order_manifest: 20, order_worlds: 30, order_featured: 40, order_campaign: 50, order_values: 60,
  show_vendor: true, show_badges: true, show_quick_add: true, products_per_row: 4,
  primary_color: "#111210", accent_color: "#D9FF43", background_color: "#F5F2EC",
  typography: "editorial", hero_style: "editorial-orbs", header_layout: "centered", sticky_header: true, show_search: true, show_account: true,
  product_card_style: "editorial", product_image_ratio: "portrait",
};

const SAVED: Record<string, string> = {
  draft: "Taslak kaydedildi. Mağazada görünmesi için yayınlayın.",
  hero_image: "Hero görseli yüklendi, taslak kaydedildi.",
  campaign_image: "Kampanya görseli yüklendi, taslak kaydedildi.",
};

const ERRORS: Record<string, string> = {
  forbidden: "Temayı değiştirmek için yönetici yetkisi gerekir.",
  "required-fields": "Hero ana başlığı ve açıklaması boş bırakılamaz.",
  "invalid-theme-image": "Bir görsel seçin. PNG, JPG, WebP veya AVIF olmalı ve 4 MB’ı geçmemeli.",
  "draft-not-found": "Kayıtlı taslak bulunamadı. Önce taslağı kaydedin.",
};

const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const when = (value?: string | null) => (value ? dateFormat.format(new Date(value)) : null);

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string; published?: string; error?: string }> }) {
  const query = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    supabase.from("arc_store_themes").select("mode,config,version,updated_at,published_at").eq("organization_id", organization.id),
    supabase.from("arc_store_settings").select("storefront_url").eq("organization_id", organization.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const draft = rows?.find((row) => row.mode === "draft");
  const live = rows?.find((row) => row.mode === "published");
  const canEdit = ["owner", "admin", "manager"].includes(membership.role);
  const config: Theme = { ...defaults, ...((draft?.config ?? {}) as Theme) };
  /* Taslak, son yayından sonra değiştiyse mağaza hâlâ eski hâli gösteriyor. */
  const unpublished = Boolean(draft) && (!live?.published_at || new Date(draft?.updated_at ?? 0) > new Date(live.published_at));

  return (
    <>
      <section className="ac-bar">
        <div>
          <h1>Mağaza Tasarımı</h1>
          <p>Ana sayfa bölümlerini ve tema ayarlarını canlı önizleme üzerinde düzenleyin.</p>
        </div>
      </section>

      {query.published ? <Notice title="Tema yayına alındı">Değişiklikler artık mağazada görünüyor.</Notice> : null}
      {query.saved ? <Notice title={SAVED[query.saved] ?? "Kaydedildi."} /> : null}
      {query.error ? <Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[query.error] ?? query.error}</Notice> : null}

      <div className="theme-status">
        <span><Icon name="clock" size={14} />Taslak <b>{when(draft?.updated_at) ?? "henüz kaydedilmedi"}</b></span>
        <span><Icon name="external" size={14} />Yayında <b>{live ? `Sürüm ${live.version} · ${when(live.published_at) ?? "—"}` : "henüz yayınlanmadı"}</b></span>
        {draft ? (
          <span data-tone={unpublished ? "warn" : "ok"}>{unpublished ? "Yayınlanmamış değişiklikler var" : "Mağaza taslakla aynı"}</span>
        ) : null}
      </div>

      {canEdit ? (
        <ThemeEditor key={draft?.updated_at ?? "yeni"} initial={config} store={previewUrl(settings?.storefront_url)} />
      ) : (
        <Notice tone="info" title="Yalnızca görüntüleme">Temayı değiştirmek için yönetici yetkisi gerekir.</Notice>
      )}
    </>
  );
}

/**
 * Önizleme adresi.
 *
 * `storefront_url` ayarında eski bir Vercel dağıtımı kalabiliyor;
 * o dağıtım silindiğinde önizleme 404 veriyor ve editör tamamen
 * kullanılamaz hâle geliyordu.
 *
 * Geçersiz ya da eski `.vercel.app` adresleri yerine alan adı
 * kullanılıyor.
 */
function previewUrl(value: string | null | undefined) {
  const fallback = "https://arvoculture.com";
  if (!value) return fallback;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return fallback;
    // Dağıtım adresleri kalıcı değil; alan adı tercih edilir.
    if (url.hostname.endsWith(".vercel.app")) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}
