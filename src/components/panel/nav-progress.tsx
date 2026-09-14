"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* Sayfa geçişlerinde ekranın üstünde ince altın ilerleme çizgisi. */
function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const isFirstRun = useRef(true);

  useEffect(() => {
    function start() {
      if (activeRef.current) return;
      activeRef.current = true;
      setVisible(true);
      setWidth(16);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        setWidth((current) => (current < 86 ? current + (86 - current) * 0.12 : current));
      }, 160);
    }
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!activeRef.current) return;
    activeRef.current = false;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    const done = window.setTimeout(() => setWidth(100), 0);
    const hide = window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 260);
    return () => {
      window.clearTimeout(done);
      window.clearTimeout(hide);
    };
  }, [pathname, searchParams]);

  return (
    <div className={visible ? "nav-progress visible" : "nav-progress"} style={{ width: `${width}%` }} aria-hidden="true">
      <span className="nav-progress-glow" />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
