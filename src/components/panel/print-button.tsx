"use client";

import { Icon } from "./icons";

/* Yazdırma: panel çerçevesi ve işlem formları print CSS'te gizlenir. */
export function PrintButton({ label = "Yazdır" }: { label?: string }) {
  return (
    <button type="button" className="ac-btn" onClick={() => window.print()}>
      <Icon name="printer" size={15} />
      {label}
    </button>
  );
}
