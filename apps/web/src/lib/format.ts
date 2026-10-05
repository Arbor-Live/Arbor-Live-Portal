import { formatDate } from "@arbor/format";

export * from "@arbor/format";

/** "Just now" / "5m ago" / "3h ago" / "4d ago", then the date. */
export function formatRelativeTime(ms: number | null | undefined) {
  if (ms == null) return "—";
  const delta = Date.now() - ms;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(ms);
}
