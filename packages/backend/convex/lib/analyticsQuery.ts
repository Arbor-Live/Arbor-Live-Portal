import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { requireOperationsAccess } from "./auth";
import { isHashEvent } from "./hashEvent";

export const EVENT_SCAN_LIMIT = 1000;
export const INVOICE_SCAN_LIMIT = 2000;
export const REQUEST_SCAN_LIMIT = 500;
/** Crewed events per crew query, after filtering (each reads its shifts). */
export const CREWED_EVENT_SCAN_LIMIT = 400;
export const SHIFTS_PER_EVENT_LIMIT = 200;

export const analyticsRangeArgs = {
  startMs: v.number(),
  endMs: v.number(),
};

/** Insights: admins and the Operations team, in Arbor Live's context. */
export async function requireAnalyticsAccess(ctx: QueryCtx) {
  await requireOperationsAccess(ctx);
}

export function assertValidRange(startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error("Invalid analytics date range.");
  }
}

/** For money and crew time only: a hash pays real crew but isn't an event anyone booked. */
export async function loadEventsInRangeWithHashes(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", startMs).lte("startAt", endMs))
    .take(EVENT_SCAN_LIMIT);
  return { events: rows, truncated: rows.length >= EVENT_SCAN_LIMIT };
}

/** The events Insights counts. Hashes stay out, so they never inflate a total. */
export async function loadEventsInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const { events, truncated } = await loadEventsInRangeWithHashes(ctx, startMs, endMs);
  return { events: events.filter((event) => !isHashEvent(event)), truncated };
}

/** Events with `startAt` in `[startMs, endMs]` (inclusive), capped by `EVENT_SCAN_LIMIT`. */
export async function loadEventsFromNow(ctx: QueryCtx, startMs: number, endMs: number) {
  return loadEventsInRange(ctx, startMs, endMs);
}

export { computeShiftStats, isShiftFilled } from "./crewShiftKinds";
