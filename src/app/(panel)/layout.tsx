import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { requireTenant } from "@/lib/tenant";
import { ActivityDrawer } from "@/components/panel/activity-drawer";
import { NavProgress } from "@/components/panel/nav-progress";
import { SkipLink } from "@/components/panel/skip-link";
import { ThemeToggle } from "@/components/panel/theme-toggle";
import { arcUygulamalari } from "@/components/os/os-apps";
import { OsDock } from "@/components/os/os-dock";
import { OsGeri } from "@/components/os/os-geri";
import { OsBolumSeridi } from "@/components/os/os-bolum-seridi";
import { OsSaat, OsUygulamaAdi } from "@/components/os/os-status";
import { OsAramaDugmesi, OsKomutPaleti } from "@/components/os/os-command-palette";
import { OsKullaniciMenusu } from "@/components/os/os-user-menu";
import { OsMenuKapat } from "@/components/os/os-menu-kapat";
import { GlobalActionFeedback } from "@/components/os/global-action-feedback";
import { FlashToast } from "@/components/os/flash-toast";
import { activityUnread } from "./activity-actions";
import "./panel-tokens.css";
import "@/components/os/os-tokens.css";
import "./design.css";
import "./panel.css";
// ArvoOS'un sayfa ilkelleri (düğme, kart, rozet, tablo, iskelet): yeni sayfalar bunlarla yazılıyor.
import "@/components/os/panel-page-system.css";
import "@/components/os/panel-ui.css";
import "@/components/os/panel-tables.css";
import "./activity.css";
import "@/components/os/os-motion.css";
import "@/components/os/os-shell.css";
// Telefonda uygulama gibi: yalnızca ≤760px kuralları (masaüstüne dokunmaz).
import "@/components/os/mobil-uygulama.css";

/*
  ŞİRKET İŞLETİM SİSTEMİ KABUĞU (16.10.2026, kurum sahibinin isteği:
  "ArvoARC panelini ArvoOS kalitesinde ve aynı özelliklerle yeniden
  yaratalım; dock ve pencere sistemi de gelsin").

  Eskiden: koyu sol kenar menüsü + breadcrumb'lı üst çubuk, telefonda
  ayrı bir alt sekme çubuğu ve ayrı bir çekmece menü — üç ayrı gezinme
  listesi. Şimdi ArvoOS'un kabuğu: üstte durum çubuğu (mağaza, açık
  uygulama, Ctrl+K araması, saat, bildirimler, tema, hesap), altta
  uygulama dock'u; fareyle bir uygulamanın üstüne gelince bölümleri
  ikinci dock olarak açılır. Telefonda dock alt sekme çubuğu, bölümler
  üstte şerit. Hepsi tek listeden: components/os/os-apps.ts.

  Bileşenler ArvoOS/app/panel/os/*'ın kopyası (her dosyada kaynak yazılı).

  requireTenant React cache() ile sarılı: yerleşim ve sayfa aynı
  istekte çağırdığında veritabanına bir kez gidilir.
*/

const roleNames: Record<string, string> = {
  owner: "Mağaza Sahibi",
  admin: "Yönetici",
  manager: "Mağaza Yöneticisi",
  member: "Ekip Üyesi",
};

function basHarf(ad: string) {
  return (ad.trim()[0] ?? "A").toLocaleUpperCase("tr-TR");
}

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ supabase, organization, membership }, unread] = await Promise.all([requireTenant(), activityUnread()]);
  /* Ad JWT'den (yerel çözümleme, ağ turu yok): kim olarak oturum açıldığı
     eskiden hiçbir yerde yazmıyordu. */
  const [{ data: kimlik }, { data: magaza, error: magazaHatasi }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("arc_store_settings").select("store_name").eq("organization_id", organization.id).maybeSingle(),
  ]);
  // hata-tamam: yalnızca çubuktaki ad; okunamazsa kurum adına düşer, sayfa açılmaya devam eder.
  if (magazaHatasi) console.error("[kabuk] mağaza adı okunamadı:", magazaHatasi.message);
  const iddia = (kimlik?.claims ?? {}) as { email?: string; user_metadata?: { full_name?: string; name?: string } };
  const roleName = roleNames[membership.role] ?? "Ekip Üyesi";
  const ad = iddia.user_metadata?.full_name || iddia.user_metadata?.name || iddia.email?.split("@")[0] || roleName;
  /* Çubukta vitrin adı (ArvoCulture), yasal unvan değil: ArvoOS'ta da
     tabela adı yazıyor; "ARVOCULTURE GROUP … LTD.ŞTİ." çubuğa sığmıyordu. */
  const magazaAdi = String(magaza?.store_name || organization.name || "Mağaza").trim();
  const plan = String(organization.plan_code ?? "").toLocaleUpperCase("tr-TR");
  const uygulamalar = arcUygulamalari();

  return (
    <div className="panel-root os-root">
      <main className="panel-frame os-frame">
        <SkipLink />
        <NavProgress />
        <GlobalActionFeedback />
        <FlashToast />
        <header className="os-bar">
          {/* Telefonda alt sayfalarda geri (ana ekrana eklenen uygulamada tarayıcının geri tuşu yok). */}
          <OsGeri uygulamalar={uygulamalar} />
          <Link prefetch={false} className="os-brand" href="/" aria-label={`${magazaAdi} ana ekran`}>
            <i aria-hidden="true">{basHarf(magazaAdi)}</i>
            <span><b>{magazaAdi}</b><OsUygulamaAdi uygulamalar={uygulamalar} /></span>
          </Link>
          <OsAramaDugmesi />
          <div className="os-bar-right">
            <OsSaat />
            <div className="os-bar-actions">
              <ActivityDrawer initialUnread={unread} />
              <ThemeToggle />
            </div>
            <OsMenuKapat />
            <OsKullaniciMenusu ad={ad} rol={roleName} kurum={magazaAdi} paket={plan} cikis={signOut} />
          </div>
        </header>
        {/* Telefonda açık uygulamanın bölümleri (masaüstünde gizli; orada dock'un ikinci katı). */}
        <OsBolumSeridi uygulamalar={uygulamalar} />
        <section className="os-workspace">
          {/* Ekran okuyucuların "ana içerik" bölgesi; tabIndex, bağlantı odağı buraya taşıyabilsin diye. */}
          <div id="icerik" className="panel-content" tabIndex={-1}>{children}</div>
        </section>
        <OsDock
          uygulamalar={uygulamalar}
          digerUygulamalar={[{ kod: "arvoos", ad: "ArvoOS", href: "https://app.arvo-os.com/panel", ayniSekme: false }]}
        />
        <OsKomutPaleti
          uygulamalar={uygulamalar}
          cikis={signOut}
          kayitAramasi={{ etiket: "için sipariş, ürün ve müşteri ara", ipucu: "Arama", adresOneki: "/ara?q=" }}
        />
      </main>
    </div>
  );
}
