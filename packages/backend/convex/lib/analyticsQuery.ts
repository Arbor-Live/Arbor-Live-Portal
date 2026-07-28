import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireAdmin, requireArborInternalContext } from "./auth";

export const EVENT_SCAN_LIMIT = 1000;
export const INVOICE_SCAN_LIMIT = 2000;
export const REQUEST_SCAN_LIMIT = 500;
export const CREWED_EVENT_SCAN_LIMIT = 150;
export const SHIFTS_PER_EVENT_LIMIT = 200;

export const analyticsRangeArgs = {
  startMs: v.number(),
  endMs: v.number(),
};

export async function requireAnalyticsAccess(ctx: QueryCtx) {
  await requireAdmin(ctx);
  await requireArborInternalContext(ctx);
}

export function assertValidRange(startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error("Invalid analytics date range.");
  }
}

export async function loadEventsInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", startMs).lte("startAt", endMs))
    .take(EVENT_SCAN_LIMIT);
  return { events: rows, truncated: rows.length >= EVENT_SCAN_LIMIT };
}

export function isShiftFilled(shift: Doc<"eventCrewShifts">) {
  return Boolean(shift.userId?.trim());
}

export function computeShiftStats(shifts: Doc<"eventCrewShifts">[]) {
  const totalShifts = shifts.length;
  const filledShifts = shifts.filter(isShiftFilled).length;
  const isCrewConfirmed = totalShifts > 0 && filledShifts === totalShifts;
  return {
    totalShifts,
    filledShifts,
    unfilledShifts: totalShifts - filledShifts,
    isCrewConfirmed,
  };
}
