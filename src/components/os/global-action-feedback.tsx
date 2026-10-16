"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ActionFeedbackInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const activeRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const isFirstRun = useRef(true);
  const mainRef = useRef<HTMLElement | null>(null);

  // Bu üç yardımcı useCallback ile sabit kimlikli: aşağıdaki efektler
  // bunları bağımlılık olarak sayabilsin ve yine yalnızca bir kez
  // abone olsun diye. Hiçbiri değişen state'e kapanmaz (yalnızca ref'ler
  // ve setVisible), davranış eskisiyle aynıdır.
  const clearTimers = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (observerRef.current) observerRef.current.disconnect();
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setVisible(false);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    setVisible(true);

    // Sayfa değişmeyen işlemler (revalidatePath ile aynı sayfada kalan
    // form gönderimleri) için: ana içerik alanında bir DOM değişikliği
    // görürsek işlemin bittiğini varsayıp kapatıyoruz. Hiçbir sinyal
    // gelmezse en fazla 6 saniye sonra güvenlik amaçlı otomatik kapanır.
    if (!mainRef.current) mainRef.current = document.querySelector(".panel-content");
    if (mainRef.current) {
      observerRef.current = new MutationObserver(() => {
        window.setTimeout(finish, 120);
      });
      observerRef.current.observe(mainRef.current, { childList: true, subtree: true });
    }
    timeoutRef.current = window.setTimeout(finish, 6000);
  }, [finish]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
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
    function handleSubmit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement;
      if (form.dataset.noFeedback === "true") return;
      start();
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
    };
  }, [start]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) return null;

  return (
    <div className="panel-action-feedback" role="status" aria-live="polite">
      <div className="panel-action-feedback-card">
        <span className="panel-action-feedback-ring" aria-hidden="true" />
        <span>Yükleniyor…</span>
      </div>
    </div>
  );
}

export function GlobalActionFeedback() {
  return (
    <Suspense fallback={null}>
      <ActionFeedbackInner />
    </Suspense>
  );
}
