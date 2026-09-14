"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const COOKIE = "arc_nav";

/*
  Kenar çubuğunu daraltma. Tercih çerezde; yerleşim çerezi okuyup
  .panel-root'a ilk çizimde doğru sınıfı veriyor, böylece sayfa
  açılırken menü genişleyip daralmıyor.
*/
export function SidebarToggle({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  useEffect(() => {
    document.querySelector(".panel-root")?.classList.toggle("is-nav-collapsed", collapsed);
  }, [collapsed]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const label = collapsed ? "Menüyü genişlet" : "Menüyü daralt";
  return (
    <button type="button" className="panel-sidebar-toggle" onClick={toggle} aria-pressed={collapsed} aria-label={label} title={label}>
      <i><Icon name={collapsed ? "expand" : "collapse"} size={16} /></i>
      <span>{label}</span>
    </button>
  );
}
