/*
  Eski etiket tonları (lib/commerce-labels: good/warn/bad/muted/info) →
  ArvoOS rozetinin tonları (status-pill data-tone: success/warning/
  danger/neutral/info). Sayfalar yeni kalıba geçerken etiketlerin
  kuralı değişmesin, yalnızca görünümü değişsin diye çeviri tek yerde
  (16.10.2026).
*/
const CEVIRI: Record<string, string> = { good: "success", warn: "warning", bad: "danger", muted: "neutral", info: "info", gold: "gold" };

export function rozetTonu(eski: string | null | undefined): string {
  return (eski && CEVIRI[eski]) || "neutral";
}
