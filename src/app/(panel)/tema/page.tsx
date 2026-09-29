import type { Metadata } from "next";
import { Icon } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import { PanelBildirimi } from "@/components/panel/bildirim";
import { requireTenant } from "@/lib/tenant";
import { ThemeEditor, type Theme } from "./theme-editor";
import { temaVarsayilanlari } from "@/lib/tema-varsayilanlari";
import { magazaAdresi } from "@/lib/magaza-adresi";
import "./theme.css";
import { yetkiYok } from "@/lib/yetki-metni";

export const metadata: Metadata = { title: "Mağaza Tasarımı" };

/*
  YERLEŞİM VARSAYILANLARI — markadan bağımsız olanlar.

  Bu blok eskiden ArvoCulture'ın METİNLERİNİ de taşıyordu: o markanın
  adı, sloganları, koleksiyon bağlantıları, renkleri ve kupon kodu
  (ARVO10). Yeni bir salon Mağaza Tasarımı'nı açtığında onları
  görüyor, "Taslağı kaydet"e bastığında da kendi temasına yazıyordu.

  Metin, bağlantı ve renkler kiracıdan türeyen bir modüle taşındı
  (lib/tema-varsayilanlari.ts). Burada yalnızca hangi bölümün açık
  olduğu, sırası ve tipografi/kart biçimi gibi marka taşımayan
  seçimler kaldı.

  Yapılandırılmış bir mağaza etkilenmiyor: aşağıdaki yayılımda kendi
  config'i en üste biniyor ve kaydedilen config bütün metin
  anahtarlarını taşıyor (tema/actions.ts).
*/
const defaults: Theme = {
  /* show_campaign varsayılanı modülde (kapalı): yeni mağazanın
     kampanyası yok, boş bir kampanya şeridi gürültü olurdu. */
  show_manifest: true, show_worlds: true, show_featured: true, show_values: true,
  order_manifest: 20, order_worlds: 30, order_featured: 40, order_campaign: 50, order_values: 60,
  show_vendor: true, show_badges: true, show_quick_add: true, products_per_row: 4,
  typography: "editorial", hero_style: "editorial-orbs", header_layout: "centered", sticky_header: true, show_search: true, show_account: true,
  product_card_style: "editorial", product_image_ratio: "portrait",
  ...temaVarsayilanlari({ magazaAdi: "Mağaza" }),
};



const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const when = (value?: string | null) => (value ? dateFormat.format(new Date(value)) : null);

export default async function Page() {
  const { supabase, organization, membership } = await requireTenant();
  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    supabase.from("arc_store_themes").select("mode,config,version,updated_at,published_at").eq("organization_id", organization.id),
    supabase.from("arc_store_settings").select("storefront_url,custom_domain,domain_verified_at,platform_subdomain,store_name,primary_color,accent_color").eq("organization_id", organization.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const draft = rows?.find((row) => row.mode === "draft");
  const live = rows?.find((row) => row.mode === "published");
  const canEdit = ["owner", "admin", "manager"].includes(membership.role);
  /* Renk mağaza ayarından, yoksa kurumun markasından, o da yoksa nötr. */
  const varsayilan = temaVarsayilanlari({
    magazaAdi: settings?.store_name || organization.name,
    anaRenk: settings?.primary_color,
    vurguRenk: settings?.accent_color,
  }) as Partial<Theme>;
  const config: Theme = { ...defaults, ...varsayilan, ...((draft?.config ?? {}) as Theme) };
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

      {/* Sonuç ÇEREZDEN geliyor; adres satırındaki ?error= artık
          okunmuyor: dışarıdan gönderilen bağlantı uydurma mesaj
          gösterebiliyordu (lib/panel-bildirim.ts). */}
      <PanelBildirimi />

      <div className="theme-status">
        <span><Icon name="clock" size={14} />Taslak <b>{when(draft?.updated_at) ?? "henüz kaydedilmedi"}</b></span>
        <span><Icon name="external" size={14} />Yayında <b>{live ? `Sürüm ${live.version} · ${when(live.published_at) ?? "—"}` : "henüz yayınlanmadı"}</b></span>
        {draft ? (
          <span data-tone={unpublished ? "warn" : "ok"}>{unpublished ? "Yayınlanmamış değişiklikler var" : "Mağaza taslakla aynı"}</span>
        ) : null}
      </div>

      {canEdit ? (
        <ThemeEditor key={draft?.updated_at ?? "yeni"} initial={config} store={magazaAdresi(settings)} />
      ) : (
        <Notice tone="info" title="Yalnızca görüntüleme">{yetkiYok("tema düzenleme")}</Notice>
      )}
    </>
  );
}
