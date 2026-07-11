import { pacificDateKey, PORTAL_TIMEZONE } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";

export const EVENT_TIMEZONE = PORTAL_TIMEZONE;
export const MAX_BOOKING_DAY_LOAD_RANGE_DAYS = 93;

export type DayLoadLevel = "free" | "busy" | "unavailable";

const pacificShortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIMEZONE,
  month: "short",
  day: "numeric",
});

export function toPacificDateKey(ms: number): string {
  return pacificDateKey(ms, EVENT_TIMEZONE);
}

export function formatPacificShortDate(dateKey: string): string {
  const startMs = pacificDayStartMs(dateKey);
  if (startMs === null) return dateKey;
  return pacificShortDateFormatter.format(new Date(startMs + 12 * 60 * 60 * 1000));
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

export function isDateKeyInRange(dateKey: string, rangeStart: string, rangeEnd: string) {
  return dateKey >= rangeStart && dateKey <= rangeEnd;
}

export function dayLoadLevel(count: number): DayLoadLevel {
  if (count >= 3) return "unavailable";
  if (count >= 1) return "busy";
  return "free";
}

export function dayCountBetweenInclusive(rangeStart: string, rangeEnd: string): number {
  const start = parseDateKey(rangeStart);
  const end = parseDateKey(rangeEnd);
  if (!start || !end) return Number.POSITIVE_INFINITY;
  const startMs = pacificDayStartMs(rangeStart);
  const endMs = pacificDayStartMs(rangeEnd);
  if (startMs === null || endMs === null || endMs < startMs) return Number.POSITIVE_INFINITY;
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

export function pacificDayStartMs(dateKey: string): number | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const base = Date.UTC(parsed.year, parsed.month - 1, parsed.day - 1, 0, 0, 0);
  for (let offset = 0; offset < 48; offset += 1) {
    const candidate = base + offset * 60 * 60 * 1000;
    if (toPacificDateKey(candidate) !== dateKey) continue;
    const previous = candidate - 60 * 60 * 1000;
    if (toPacificDateKey(previous) !== dateKey) return candidate;
  }

  return Date.UTC(parsed.year, parsed.month - 1, parsed.day, 8, 0, 0);
}

export type ShowSlotLike = {
  date: string;
  startAtMs: number;
  endAtMs: number;
};

export type DayEventPlan = {
  date: string;
  startAt: number;
  endAt: number;
};

export function groupShowSlotsByDay(showSlots: ShowSlotLike[]): DayEventPlan[] {
  const byDate = new Map<string, { startAt: number; endAt: number }>();

  for (const slot of showSlots) {
    const date = slot.date.trim();
    if (!date) continue;
    const existing = byDate.get(date);
    if (!existing) {
      byDate.set(date, { startAt: slot.startAtMs, endAt: slot.endAtMs });
      continue;
    }
    byDate.set(date, {
      startAt: Math.min(existing.startAt, slot.startAtMs),
      endAt: Math.max(existing.endAt, slot.endAtMs),
    });
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, window]) => ({ date, ...window }));
}

export async function buildPublicBookingDayLoad(
  ctx: QueryCtx,
  rangeStart: string,
  rangeEnd: string,
): Promise<Record<string, { count: number; level: DayLoadLevel }>> {
  if (rangeEnd < rangeStart) {
    throw new Error("Date range end must be on or after the start.");
  }
  if (dayCountBetweenInclusive(rangeStart, rangeEnd) > MAX_BOOKING_DAY_LOAD_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_BOOKING_DAY_LOAD_RANGE_DAYS} days.`);
  }

  const rangeStartMs = pacificDayStartMs(rangeStart);
  if (rangeStartMs === null) {
    throw new Error("Invalid range start date.");
  }

  const counts = new Map<string, number>();
  const events = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", rangeStartMs))
    .take(500);

  for (const event of events) {
    if (normalizeEventStatus(event.status) === "cancelled") continue;
    const dayKey = toPacificDateKey(event.startAt);
    if (!isDateKeyInRange(dayKey, rangeStart, rangeEnd)) continue;
    counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
  }

  const result: Record<string, { count: number; level: DayLoadLevel }> = {};
  for (const [dayKey, count] of counts.entries()) {
    result[dayKey] = { count, level: dayLoadLevel(count) };
  }
  return result;
}

export async function listEventsLinkedToRequest(
  ctx: QueryCtx,
  request: Pick<Doc<"eventRequests">, "_id" | "convertedEventId" | "convertedEventIds">,
): Promise<Doc<"events">[]> {
  const linked = new Map<string, Doc<"events">>();

  for (const eventId of request.convertedEventIds ?? []) {
    const event = await ctx.db.get(eventId);
    if (event) linked.set(event._id, event);
  }

  if (request.convertedEventId) {
    const event = await ctx.db.get(request.convertedEventId);
    if (event) linked.set(event._id, event);
  }

  const bySource = await ctx.db
    .query("events")
    .withIndex("by_sourceEventRequestId", (q) => q.eq("sourceEventRequestId", request._id))
    .take(50);
  for (const event of bySource) {
    linked.set(event._id, event);
  }

  return [...linked.values()].sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);
}

export function primaryConvertedEventId(
  request: Pick<Doc<"eventRequests">, "convertedEventId" | "convertedEventIds">,
): Id<"events"> | undefined {
  return request.convertedEventIds?.[0] ?? request.convertedEventId;
}
