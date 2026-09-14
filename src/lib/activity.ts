import { DAY, trDayStart } from "./tr-time";

/*
  Bildirim çekmecesinin ortak tipleri ve zaman biçimleri. Sunucu
  işlemi (app/(panel)/activity-actions.ts) listeyi üretir, istemci
  bileşeni (components/panel/activity-drawer.tsx) gösterir.
*/

/** Son görülme zamanı (epoch ms); rozet bundan sonraki kayıtları sayar. */
export const SEEN_COOKIE = "arc_seen_at";

export type ActivityTone = "info" | "gold" | "success" | "warning" | "danger" | "muted";
export type ActivityKind = "order" | "return" | "status" | "shipping" | "stock";

export type ActivityItem = { id: string; kind: ActivityKind; tone: ActivityTone; title: string; detail: string; href: string; at: string };
export type ActivityAlert = { key: string; label: string; detail: string; count: number; href: string; tone: "warning" | "danger" };
export type ActivityFeed =
  | { ok: true; items: ActivityItem[]; alerts: ActivityAlert[]; loadedAt: number }
  | { ok: false; error: string };

const TZ = "Europe/Istanbul";
const clock = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: TZ });
const dayMonth = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: TZ });
const full = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const daysAgo = (at: number, now: number) => Math.round((trDayStart(now) - trDayStart(at)) / DAY);

export const fullTime = (value: string) => full.format(new Date(value));

/** Kısa zaman: "şimdi", "5 dk", "2 sa", "Dün 14:30", "Salı", "3 Eyl". */
export function relativeTime(value: string, now: number) {
  const at = Date.parse(value);
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return "şimdi";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk`;
  const ago = daysAgo(at, now);
  if (ago <= 0) return `${Math.floor(diff / 3_600_000)} sa`;
  if (ago === 1) return `Dün ${clock.format(new Date(at))}`;
  if (ago < 7) return weekday.format(new Date(at));
  return dayMonth.format(new Date(at));
}

const groupLabels = { today: "Bugün", yesterday: "Dün", week: "Bu hafta", older: "Daha eski" } as const;

/** Yeniden eskiye sıralı listeyi Türkiye saatine göre gün gruplarına ayırır. */
export function groupByDay(items: ActivityItem[], now: number) {
  const groups: { key: keyof typeof groupLabels; label: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const ago = daysAgo(Date.parse(item.at), now);
    const key = ago <= 0 ? "today" : ago === 1 ? "yesterday" : ago < 7 ? "week" : "older";
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: groupLabels[key], items: [item] });
  }
  return groups;
}
