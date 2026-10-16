"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BILDIRIM_CEREZI } from "@/lib/panel-bildirim-cerez";

/*
  İŞLEM SONUCU BALONU. Kaynak: ArvoOS/app/panel/flash-toast.tsx
  (16.10.2026). Eskiden sonuç her sayfanın başında bir şerit olarak
  çiziliyordu (<PanelBildirimi>): sayfa aşağı kaydırılmışsa görünmüyor,
  yazıyı aşağı itiyordu ve her sayfaya ayrıca konması gerekiyordu —
  konmayan sayfada sonuç sessizce kayboluyordu. Artık kabukta tek yerde,
  sağ üstte kayan bir balon.

  Kaynak hâlâ aynı çerez (lib/panel-bildirim.ts: "tur:metin"); okunur
  okunmaz silinir, mesaj bir kez görünür. Başarıda "arvo:action-success"
  olayı yayılır: açık bir giriş penceresi kendiliğinden kapanabilsin.
*/
type Flash = { kind: "error" | "success" | "warn"; text: string; id: number };

function cereziAl(): Omit<Flash, "id"> | null {
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${BILDIRIM_CEREZI}=`));
  if (!entry) return null;
  document.cookie = `${BILDIRIM_CEREZI}=; Max-Age=0; path=/`;
  try {
    const ham = decodeURIComponent(entry.slice(BILDIRIM_CEREZI.length + 1));
    const ayrac = ham.indexOf(":");
    if (ayrac < 0) return null;
    const tur = ham.slice(0, ayrac);
    /* Metin sunucuda bir kez daha kodlanıyor; çerez katmanı kodlamadıysa
       ikinci çözme "%10 indirim" gibi bir metinde düşerdi — o zaman olduğu gibi. */
    const kodlu = ham.slice(ayrac + 1);
    let text = kodlu;
    try { text = decodeURIComponent(kodlu); } catch { /* zaten çözülmüş */ }
    text = text.trim();
    if (!text) return null;
    if (tur === "hata") return { kind: "error", text };
    if (tur === "uyari") return { kind: "warn", text };
    if (tur === "basari") return { kind: "success", text };
    return null;
  } catch {
    // Bozuk çerez: mesaj göstermemek, çöp göstermekten iyidir.
    return null;
  }
}

export function FlashToast() {
  const pathname = usePathname();
  const [flash, setFlash] = useState<Flash | null>(null);
  const hideTimer = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);

  const show = useCallback((next: Flash) => {
    setFlash(next);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setFlash(null), next.kind === "success" ? 3800 : 10000);
    if (next.kind === "success") window.dispatchEvent(new CustomEvent("arvo:action-success", { detail: next.text }));
  }, []);

  const check = useCallback(() => {
    const sonuc = cereziAl();
    if (sonuc) show({ ...sonuc, id: Date.now() });
    return Boolean(sonuc);
  }, [show]);

  // Sayfa açılışında ve her gezinmede (yönlendirmeyle biten işlemler).
  useEffect(() => {
    const timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, check]);

  // Form gönderiminden sonra işlem yanıtı gelene kadar kısa aralıklarla bak.
  useEffect(() => {
    function handleSubmit() {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      const startedAt = Date.now();
      pollTimer.current = window.setInterval(() => {
        if (check() || Date.now() - startedAt > 15000) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      }, 400);
    }
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("submit", handleSubmit);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [check]);

  if (!flash) return null;

  if (flash.kind === "success") {
    return (
      <div className="panel-toast is-success" role="status" aria-live="polite" key={flash.id}>
        <span className="panel-toast-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="panel-toast-body">
          <strong>{flash.text}</strong>
          <span>İşlem başarıyla tamamlandı.</span>
        </div>
        <button className="panel-toast-close" type="button" onClick={() => setFlash(null)} aria-label="Kapat">×</button>
      </div>
    );
  }
  return (
    <div className={flash.kind === "warn" ? "panel-toast is-warn" : "panel-toast"} role="alert" aria-live="assertive" key={flash.id}>
      <span className="panel-toast-icon" aria-hidden="true">!</span>
      <div className="panel-toast-body">
        {/* "Uyarı" hata değil, bekleme: DNS kaydının yayılması gibi (lib/panel-bildirim.ts). */}
        <strong>{flash.kind === "warn" ? "Bekleniyor" : "İşlem tamamlanamadı"}</strong>
        <span>{flash.text}</span>
      </div>
      <button className="panel-toast-close" type="button" onClick={() => setFlash(null)} aria-label="Kapat">×</button>
    </div>
  );
}
