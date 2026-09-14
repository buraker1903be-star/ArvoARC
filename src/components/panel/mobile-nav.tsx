"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { Icon, type IconName } from "./icons";
import { homeItem, isActive, navSections } from "./nav-config";

/*
  Telefonda (≤900px) kenar çubuğu yerine iOS sekme çubuğu ve sağdan
  açılan menü. Öncesinde kenar çubuğu sayfanın üstüne iki sütunlu
  bir ızgara olarak diziliyor, içerik ancak bir ekran kaydırınca
  başlıyordu.
*/
const tabs: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Özet", icon: "home" },
  { href: "/siparisler", label: "Siparişler", icon: "box" },
  { href: "/urunler", label: "Ürünler", icon: "tag" },
  { href: "/stok", label: "Stok", icon: "archive" },
];

export function MobileNav({ tenantName, tenantInitials, roleName }: { tenantName: string; tenantInitials: string; roleName: string }) {
  const pathname = usePathname() ?? "/";
  // Menü açıldığı sayfaya bağlı: başka sayfaya geçince kendiliğinden kapanır.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-drawer-open", open);
    if (open) window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => document.documentElement.classList.remove("mobile-drawer-open");
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () => setOpenPath(null);
  const drawerItems = [homeItem, ...navSections.flatMap((section) => section.items)];

  return (
    <>
      <button className="mobile-drawer-backdrop" type="button" aria-label="Menüyü kapat" onClick={close} tabIndex={open ? 0 : -1} />

      <aside id="mobile-drawer" className="mobile-drawer" aria-hidden={!open} aria-label="Mobil menü">
        <header className="mobile-drawer-header">
          <div className="mobile-drawer-brand">
            <i>A</i>
            <span><b>ARVO ARC</b><small>ADAPTIVE RETAIL CORE</small></span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={close} aria-label="Menüyü kapat" tabIndex={open ? 0 : -1}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <section className="mobile-drawer-workspace">
          <span>{tenantInitials}</span>
          <div><b>{tenantName}</b><small>{roleName}</small></div>
        </section>

        <form action="/ara" className="mobile-drawer-search" role="search" onSubmit={close}>
          <Icon name="search" size={16} />
          <input name="q" placeholder="Sipariş, ürün, müşteri ara" aria-label="Panelde ara" autoComplete="off" maxLength={80} tabIndex={open ? 0 : -1} />
        </form>

        <nav className="mobile-drawer-nav" aria-label="Mobil ana menü">
          {drawerItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link prefetch={false} key={item.href} href={item.href} onClick={close} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} tabIndex={open ? 0 : -1}>
                <i><Icon name={item.icon} size={18} /></i>
                <span>{item.label}</span>
                <b><Icon name="chevron" size={16} /></b>
              </Link>
            );
          })}
        </nav>

        <footer className="mobile-drawer-footer">
          <a href="/magaza" target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
            <Icon name="external" size={16} /><span>Mağaza</span>
          </a>
          <form action={signOut}>
            <button type="submit" tabIndex={open ? 0 : -1}><Icon name="logout" size={16} /><span>Çıkış yap</span></button>
          </form>
        </footer>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Mobil hızlı erişim">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link prefetch={false} key={tab.href} href={tab.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              <i><Icon name={tab.icon} size={22} /></i><span>{tab.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpenPath(open ? null : pathname)} className={open ? "active" : undefined} aria-expanded={open} aria-controls="mobile-drawer">
          <i><Icon name="menu" size={22} /></i><span>Menü</span>
        </button>
      </nav>
    </>
  );
}
