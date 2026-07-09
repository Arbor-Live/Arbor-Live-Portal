import { normalizeEventStatus } from "./eventStatus";

const PUBLIC_EVENT_STATUSES = new Set(["logistics", "scheduling", "ready", "active", "completed"]);

export function isPublicListableEventStatus(status: string | undefined): boolean {
  const normalized = normalizeEventStatus(status);
  if (normalized === "cancelled" || normalized === "tentative") return false;
  return PUBLIC_EVENT_STATUSES.has(normalized);
}

export function isUpcomingEvent(startAt: number, now: number): boolean {
  return startAt >= now;
}

export function isWithinDays(startAt: number, now: number, days: number): boolean {
  const windowEnd = now + days * 24 * 60 * 60 * 1000;
  return startAt >= now && startAt <= windowEnd;
}

export function buildPublicEventUrl(eventId: string, siteBaseUrl: string): string {
  const base = siteBaseUrl.replace(/\/$/, "");
  return `${base}/events/${eventId}`;
}

export function formatLinksForCaption(
  publicEventUrl: string,
  additionalLinks: Array<{ label: string; url: string }> = [],
): string {
  const lines = [`More info: ${publicEventUrl}`];
  for (const link of additionalLinks) {
    const label = link.label.trim();
    const url = link.url.trim();
    if (!label || !url) continue;
    lines.push(`${label}: ${url}`);
  }
  return lines.join("\n");
}
