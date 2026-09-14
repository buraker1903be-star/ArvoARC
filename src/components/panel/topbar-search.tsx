"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/*
  Genel arama. Sipariş, ürün, müşteri ve koleksiyon tek kutudan
  aranır; sonuçlar /ara sayfasında. ⌘K / Ctrl+K veya "/" kutuyu
  odaklar ("/" yalnızca başka bir alana yazılmıyorken).

  Düz bir GET formu: JavaScript yüklenmeden de çalışır.
*/
export function TopbarSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname === "/ara" ? searchParams.get("q") ?? "" : "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable));
      const shortcut = (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing);
      if (!shortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form action="/ara" className="panel-search" role="search">
      <Icon name="search" size={16} />
      <input ref={inputRef} key={current} name="q" defaultValue={current} placeholder="Sipariş, ürün, müşteri ara" aria-label="Panelde ara" autoComplete="off" maxLength={80} />
      <kbd aria-hidden="true">⌘K</kbd>
    </form>
  );
}
