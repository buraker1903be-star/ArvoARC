import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/app/auth/actions";
import { requireTenant } from "@/lib/tenant";
import { ActivityDrawer } from "@/components/panel/activity-drawer";
import { Icon } from "@/components/panel/icons";
import { MobileNav } from "@/components/panel/mobile-nav";
import { NavProgress } from "@/components/panel/nav-progress";
import { PanelBreadcrumb } from "@/components/panel/panel-breadcrumb";
import { PanelNavigation } from "@/components/panel/panel-navigation";
import { SidebarToggle } from "@/components/panel/sidebar-toggle";
import { SkipLink } from "@/components/panel/skip-link";
import { ThemeToggle } from "@/components/panel/theme-toggle";
import { TopbarSearch } from "@/components/panel/topbar-search";
import { Suspense } from "react";
import { activityUnread } from "./activity-actions";
import "./panel.css";
import "./dashboard.css";
import "./activity.css";

/*
  Panel kabuğu artık ortak yerleşim.

  Öncesinde her sayfa kendi <Shell> bileşenini çiziyordu: sayfa
  değişince menü ve üst çubuk da yeniden çiziliyor, yükleme ekranı
  tüm pencereyi (menü dahil) kaplıyordu. Yerleşimde durunca menü
  yerinde kalır, yalnızca içerik alanı yenilenir — ArvoOS'teki gibi.

  requireTenant React cache() ile sarılı: yerleşim ve sayfa aynı
  istekte çağırdığında veritabanına bir kez gidilir.
*/

const roleNames: Record<string, string> = {
  owner: "Mağaza Sahibi",
  admin: "Yönetici",
  manager: "Mağaza Yöneticisi",
  member: "Ekip Üyesi",
};

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR") || "A";
}

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ organization, membership }, cookieStore, unread] = await Promise.all([requireTenant(), cookies(), activityUnread()]);
  const navCollapsed = cookieStore.get("arc_nav")?.value === "collapsed";
  const initials = initialsOf(organization.name);
  const roleName = roleNames[membership.role] ?? "Ekip Üyesi";
  const plan = String(organization.plan_code ?? "").toLocaleUpperCase("tr-TR");

  return (
    <div className={navCollapsed ? "panel-root is-nav-collapsed" : "panel-root"}>
      <SkipLink />
      <NavProgress />

      <aside id="panel-sidebar" className="panel-sidebar">
        <Link prefetch={false} className="panel-brand" href="/" aria-label="ARVO ARC — Genel Bakış">
          <i>A</i>
          <span><b>ARVO ARC</b><small>ADAPTIVE RETAIL CORE</small></span>
        </Link>

        <div className="panel-org" title={organization.name}>
          <span>{initials}</span>
          <div><b>{organization.name}</b><small>{plan} · MAĞAZA</small></div>
        </div>

        <PanelNavigation />

        <div className="panel-sidebar-footer">
          <SidebarToggle initialCollapsed={navCollapsed} />
          <div className="panel-security">
            <i><Icon name="shield" size={14} /></i>
            <span><b>Güvenli oturum</b><small>ArvoOS altyapısı</small></span>
          </div>
          <form className="panel-logout" action={signOut}>
            <button type="submit" title="Çıkış yap"><Icon name="logout" size={16} /><span>Çıkış yap</span></button>
          </form>
        </div>
      </aside>

      <section className="panel-workspace">
        <header className="panel-topbar">
          <PanelBreadcrumb tenantName={organization.name} />
          <Suspense fallback={<div className="panel-search" aria-hidden="true" />}><TopbarSearch /></Suspense>
          <div className="panel-top-actions">
            <div className="panel-quick-actions" aria-label="Hızlı erişim">
              <a className="panel-quick-action" href="/magaza" target="_blank" rel="noreferrer">
                <span className="panel-quick-icon"><Icon name="external" size={14} /></span><b>Mağazayı görüntüle</b>
              </a>
              <Link prefetch={false} className="panel-quick-action" href="/urunler?yeni=1#yeni-urun">
                <span className="panel-quick-icon"><Icon name="plus" size={14} /></span><b>Yeni ürün</b>
              </Link>
            </div>
            <ActivityDrawer initialUnread={unread} />
            <ThemeToggle />
            <div className="panel-user">
              <span>{initials}</span>
              <p><b>{roleName}</b><small>{plan}</small></p>
            </div>
          </div>
        </header>
        {/* Ekran okuyucuların "ana içerik" bölgesi; tabIndex, bağlantı odağı buraya taşıyabilsin diye. */}
        <main id="icerik" className="panel-content" tabIndex={-1}>{children}</main>
      </section>

      <MobileNav tenantName={organization.name} tenantInitials={initials} roleName={roleName} />
    </div>
  );
}
