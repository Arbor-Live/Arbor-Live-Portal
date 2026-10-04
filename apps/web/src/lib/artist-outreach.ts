/**
 * Outreach for an open position (`eventArtistOutreach`): the acts staff asked
 * to play and what each said. Shared by the Open Positions board and the
 * position panel on the Lineup.
 */

export type OutreachStatus = "asked" | "available" | "unavailable";

export type OutreachCounts = Record<OutreachStatus, number>;

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  asked: "Waiting",
  available: "Available",
  unavailable: "Can't",
};

/** Rail colour per status: emerald can play, rose can't, amber still waiting. */
export const OUTREACH_RAIL: Record<OutreachStatus, string> = {
  asked: "bg-status-amber-500",
  available: "bg-status-emerald-500",
  unavailable: "bg-status-rose-500",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reply is overdue once we've waited this long; the row says so in amber. */
export const OUTREACH_STALE_DAYS = 3;

export function daysSince(ms: number, now: number) {
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

/** "Asked today", "Replied yesterday", "Asked 5 days ago". */
export function daysAgo(verb: "Asked" | "Replied", ms: number, now: number) {
  const days = daysSince(ms, now);
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  return `${verb} ${days} days ago`;
}

/** Still waiting after `OUTREACH_STALE_DAYS`: time to chase. */
export function isStale(row: { status: OutreachStatus; askedAt: number }, now: number) {
  return row.status === "asked" && daysSince(row.askedAt, now) >= OUTREACH_STALE_DAYS;
}

export function emptyOutreachCounts(): OutreachCounts {
  return { asked: 0, available: 0, unavailable: 0 };
}

export function countOutreach(rows: ReadonlyArray<{ status: OutreachStatus }>): OutreachCounts {
  const counts = emptyOutreachCounts();
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function totalOutreach(counts: OutreachCounts) {
  return counts.asked + counts.available + counts.unavailable;
}

/**
 * Where a position's outreach stands, for filters and the board chip: nobody
 * asked yet, someone can play, or we're waiting on replies (or everyone said no).
 */
export type OutreachStage = "none" | "available" | "waiting" | "declined";

export function outreachStage(counts: OutreachCounts): OutreachStage {
  if (totalOutreach(counts) === 0) return "none";
  if (counts.available > 0) return "available";
  if (counts.asked > 0) return "waiting";
  return "declined";
}

/** "Asked 4 · 1 available · 2 can't · 1 waiting", or "Nobody asked yet". */
export function outreachSummary(counts: OutreachCounts) {
  const total = totalOutreach(counts);
  if (total === 0) return "Nobody asked yet";
  const parts = [`Asked ${total}`];
  if (counts.available) parts.push(`${counts.available} available`);
  if (counts.unavailable) parts.push(`${counts.unavailable} can't`);
  if (counts.asked) parts.push(`${counts.asked} waiting`);
  return parts.join(" · ");
}
