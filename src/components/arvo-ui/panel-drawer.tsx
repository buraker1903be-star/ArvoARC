"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOdakTuzagi } from "./odak-tuzagi";
import "./panel-drawer.css";

type PanelDrawerProps = {
  triggerLabel: string;
  title: string;
  description?: string;
  /** Başlığın üstündeki küçük etiket. Varsayılan "YENİ KAYIT" idi ve
   *  "Düzenle" gibi pencerelerde yanlış görünüyordu; artık isteğe bağlı. */
  kicker?: string;
  /** Tetikleyici butonun stili (panel-primary / panel-secondary) */
  triggerClassName?: string;
  /** Geniş pencere (960 px): içinde liste ya da tablo olan formlar için (ör. prim ödemesinin iş listesi). */
  genis?: boolean;
  children: ReactNode;
};

const subscribeNothing = () => () => undefined;

// Pencere, düğmenin bulunduğu yerde değil panelin kökünde (.panel-root;
// tema değişkenleri orada) çizilir. Düğmenin üst öğelerinden biri transform,
// filter ya da backdrop-filter taşıyınca position:fixed o öğeye hapsoluyor
// ve pencere görünmez oluyordu ("+ Yeni talep" açılmıyordu).
export function PanelDrawer({ triggerLabel, title, description, kicker, triggerClassName = "panel-primary", genis = false, children }: PanelDrawerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pencereRef = useRef<HTMLElement>(null);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;

  // İşlem başarıyla bitince (FlashToast "arvo:action-success" yayar) pencere kapanır
  useEffect(() => {
    if (!open) return;
    const onSuccess = () => setOpen(false);
    window.addEventListener("arvo:action-success", onSuccess);
    return () => window.removeEventListener("arvo:action-success", onSuccess);
  }, [open]);

  /* Klavye penceredeyken dışarı kaçmasın (components/odak-tuzagi). */
  useOdakTuzagi(open, pencereRef, "panel-drawer-root");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <div className={open ? "panel-drawer-root open" : "panel-drawer-root"} aria-hidden={!open}>
      <button className="panel-drawer-backdrop" type="button" aria-label="Pencereyi kapat" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      {/* tabIndex -1: açılışta odak buraya alınır, ilk Tab pencerenin
          kendi ilk alanına geçer. */}
      <aside ref={pencereRef} tabIndex={-1} className={genis ? "panel-drawer is-genis" : "panel-drawer"} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={!open}>
        <header className="panel-drawer-header">
          <div>{kicker ? <small className="panel-kicker">{kicker}</small> : null}<h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button className="panel-drawer-close" type="button" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="panel-drawer-body">{children}</div>
      </aside>
    </div>
  );

  return <>
    <button className={triggerClassName} type="button" onClick={() => setOpen(true)}>{triggerLabel}</button>
    {portalTarget ? createPortal(drawer, portalTarget) : null}
  </>;
}
