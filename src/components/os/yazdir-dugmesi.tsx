"use client";

/* Kaynak: ArvoOS/app/panel/finance/raporlar/print-report-button.tsx (17.10.2026). */
export function YazdirDugmesi() {
  return (
    <button type="button" className="panel-secondary rpt-print-button" onClick={() => window.print()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 9V3.5h10V9" />
        <rect x="3" y="9" width="18" height="8" rx="2.5" />
        <path d="M7 14h10v6.5H7Z" />
      </svg>
      Yazdır / PDF olarak kaydet
    </button>
  );
}
