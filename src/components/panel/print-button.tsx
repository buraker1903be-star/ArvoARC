"use client";

import { Icon } from "./icons";

/* Yazdırma: panel çerçevesi ve işlem formları print CSS'te gizlenir. */
export function PrintButton({ label = "Yazdır", className = "ac-btn" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      <Icon name="printer" size={16} />
      {label}
    </button>
  );
}
