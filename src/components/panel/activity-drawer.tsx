"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { activityUnread, loadActivity } from "@/app/(panel)/activity-actions";
import { SEEN_COOKIE, fullTime, groupByDay, relativeTime, type ActivityFeed, type ActivityKind } from "@/lib/activity";
import { Icon, type IconName } from "./icons";

/*
  Üst çubuktaki zil ve sağdan açılan bildirim çekmecesi (ArvoOS
  bildirim merkezinin ARC karşılığı).

  - Liste her açılışta sunucu işlemiyle yüklenir; üzerine gelince
    önceden yüklenmeye başlar.
  - Rozet, çerezdeki son görülmeden sonra gelen sipariş ve iade
    taleplerini sayar. Açılınca sıfırlanır; sekme açıkken 90 saniyede
    bir yenilenir.
  - Pencere .panel-root'a portal ile taşınır: üst çubuğun
    backdrop-filter'ı position:fixed'i çubuğa hapsediyordu.
*/

type FeedState = { status: "idle" } | { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: Extract<ActivityFeed, { ok: true }> };

const icons: Record<ActivityKind, IconName> = { order: "box", return: "swap", status: "check", shipping: "truck", stock: "archive" };
const subscribeNothing = () => () => undefined;
const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

function readSeen() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SEEN_COOKIE}=(\\d+)`));
  return match ? Number(match[1]) : null;
}

function writeSeen(ms: number) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SEEN_COOKIE}=${ms}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function ActivityDrawer({ initialUnread }: { initialUnread: number }) {
  const pathname = usePathname();
  const titleId = useId();
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [lastInitial, setLastInitial] = useState(initialUnread);
  const [feed, setFeed] = useState<FeedState>({ status: "idle" });
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  const requestRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Sunucudan yeni sayı gelince (yeniden çizim) rozet ona uyar
  if (lastInitial !== initialUnread) {
    setLastInitial(initialUnread);
    setUnread(initialUnread);
  }
  // Sayfa değişince çekmece kapanır
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setFeed((current) => (current.status === "ready" ? current : { status: "loading" }));
    let result: ActivityFeed;
    try {
      result = await loadActivity();
    } catch {
      result = { ok: false, error: "Bağlantı kurulamadı. Lütfen tekrar deneyin." };
    }
    if (request !== requestRef.current) return; // daha yeni bir yükleme var
    setFeed(result.ok ? { status: "ready", data: result } : { status: "error", error: result.error });
  }, []);

  const show = () => {
    /* Safari tıklanan butona odak vermez; o durumda odak zile döner. */
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : triggerRef.current;
    setSeenBefore(readSeen());
    writeSeen(Date.now());
    setUnread(0);
    setOpen(true);
    void load();
  };
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const trigger = triggerRef.current;
    root.classList.add("activity-drawer-open");
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      root.classList.remove("activity-drawer-open");
      const back = returnFocusRef.current?.isConnected && returnFocusRef.current.offsetParent !== null ? returnFocusRef.current : trigger;
      back?.focus({ preventScroll: true });
    };
  }, [open]);

  /* Çekmece kapalıyken rozet arada bir tazelenir; gizli sekmede istek atılmaz. */
  useEffect(() => {
    if (open) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await activityUnread();
        if (!cancelled) setUnread(next);
      } catch {
        /* bağlantı yoksa rozet olduğu gibi kalır */
      }
    };
    const timer = window.setInterval(refresh, 90_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [open]);

  const label = unread ? `Bildirimler, ${unread} yeni` : "Bildirimler";
  const portalTarget = isClient ? document.querySelector(".panel-root") : null;

  let body;
  if (feed.status === "idle" || feed.status === "loading") {
    body = (
      <div className="act-skel" aria-busy="true" aria-label="Bildirimler yükleniyor">
        {[0, 1, 2, 3, 4].map((index) => <i key={index} />)}
      </div>
    );
  } else if (feed.status === "error") {
    body = (
      <div className="act-empty" role="alert">
        <span className="act-icon" data-tone="danger"><Icon name="alert" size={18} /></span>
        <h3>Bildirimler yüklenemedi</h3>
        <p>{feed.error}</p>
        <button type="button" className="ac-btn" onClick={() => void load()}>Tekrar dene</button>
      </div>
    );
  } else {
    const { items, alerts, loadedAt } = feed.data;
    const groups = groupByDay(items, loadedAt);
    body = (
      <>
        {alerts.length ? (
          <section className="act-alerts" aria-label="Dikkat gerektirenler">
            {alerts.map((alert) => (
              <Link prefetch={false} className="act-alert" data-tone={alert.tone} href={alert.href} key={alert.key} onClick={close}>
                <b>{alert.count.toLocaleString("tr-TR")}</b>
                <span><strong>{alert.label}</strong><small>{alert.detail}</small></span>
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </section>
        ) : null}
        {groups.length ? groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className="act-day">{group.label}</h3>
            <ul className="act-list">
              {group.items.map((item) => {
                const isNew = seenBefore !== null && Date.parse(item.at) > seenBefore;
                return (
                  <li key={item.id} className={isNew ? "act-item is-new" : "act-item"} data-tone={item.tone}>
                    <Link prefetch={false} className="act-main" href={item.href} onClick={close}>
                      <span className="act-icon"><Icon name={icons[item.kind]} size={17} /></span>
                      <span className="act-body">
                        <span className="act-top">
                          <b>{item.title}</b>
                          <time dateTime={item.at} title={fullTime(item.at)}>{relativeTime(item.at, loadedAt)}</time>
                        </span>
                        <small>{item.detail}</small>
                        {isNew ? <span className="act-sr">Yeni</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )) : (
          <div className="act-empty">
            <span className="act-icon" data-tone="muted"><Icon name="bell" size={18} /></span>
            <h3>Son 7 günde hareket yok</h3>
            <p>Yeni sipariş, iade talebi ya da stok hareketi olduğunda burada görünecek.</p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="panel-icon-button act-trigger"
        onPointerEnter={() => { if (feed.status === "idle") void load(); }}
        onClick={show}
        aria-label={label}
        title="Bildirimler"
        aria-expanded={open}
        aria-controls="activity-drawer"
      >
        <Icon name="bell" size={17} />
        {unread ? <span className="act-badge" key={unread}>{badgeText(unread)}</span> : null}
      </button>
      {portalTarget
        ? createPortal(
            <div className={open ? "act-root is-open" : "act-root"}>
              <button className="act-backdrop" type="button" aria-label="Bildirimleri kapat" tabIndex={open ? 0 : -1} onClick={close} />
              <div id="activity-drawer" className="act" role="dialog" aria-modal="true" aria-labelledby={titleId} inert={!open}>
                <header className="act-head">
                  <div>
                    <h2 id={titleId}>Bildirimler</h2>
                    <p>Son 7 gün · sipariş, iade ve stok hareketleri</p>
                  </div>
                  <button ref={closeRef} type="button" className="act-close" onClick={close} aria-label="Bildirimleri kapat" title="Kapat">
                    <Icon name="close" size={16} />
                  </button>
                </header>
                <div className="act-scroll">{body}</div>
                <footer className="act-foot">
                  <Link prefetch={false} href="/operasyon" onClick={close}>Operasyon merkezi <Icon name="chevron" size={15} /></Link>
                </footer>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}
