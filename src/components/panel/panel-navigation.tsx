"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { homeItem, isActive, navSections, type NavItem } from "./nav-config";

/*
  Etkin menü öğesi artık adresten bulunuyor. Öncesinde her sayfa
  kendi `active` anahtarını Shell'e veriyordu; yeni bir sayfa
  eklenince unutulan anahtar menüyü yanlış öğede bırakıyordu.
*/
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link prefetch={false} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} title={item.label}>
      <i><Icon name={item.icon} size={17} /></i>
      <span>{item.label}</span>
    </Link>
  );
}

export function PanelNavigation() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="panel-nav" aria-label="Ana menü">
      <NavLink item={homeItem} pathname={pathname} />
      {navSections.map((section) => (
        <div className="panel-nav-section" key={section.title}>
          <p className="panel-nav-title">{section.title}</p>
          {section.items.map((item) => <NavLink item={item} pathname={pathname} key={item.href} />)}
        </div>
      ))}
    </nav>
  );
}
