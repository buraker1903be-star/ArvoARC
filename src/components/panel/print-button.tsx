"use client";

import { Icon } from "./icons";

/* Yazdırma: panel çerçevesi ve işlem formları print CSS'te gizlenir. */
/* simge: menü öğesinde kapalı — öteki öğelerde simge yok, yalnızca biri simgeli olunca hizası bozuluyordu. */
export function PrintButton({ label = "Yazdır", className = "ac-btn", simge = true }: { label?: string; className?: string; simge?: boolean }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {simge ? <Icon name="printer" size={16} /> : null}
      {label}
    </button>
  );
}
