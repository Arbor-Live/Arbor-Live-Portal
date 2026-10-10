import type { QueryCtx } from "../_generated/server";

/** Most shifts one person has in a window we'll read (a quarter is far below this). */
const SHIFT_READ_CAP = 1000;

export type HoursWindow = { startMs: number; endMs: number };

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Hours a person is on shifts that start inside each window (worked and still
 * scheduled alike), across every event. One indexed read covers all windows.
 */
export async function sumShiftHoursInWindows(
  ctx: QueryCtx,
  userId: string,
  windows: readonly HoursWindow[],
): Promise<number[]> {
  if (windows.length === 0) return [];
  const from = Math.min(...windows.map((window) => window.startMs));
  const to = Math.max(...windows.map((window) => window.endMs));
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", from).lte("startsAt", to),
    )
    .take(SHIFT_READ_CAP);
  return windows.map((window) =>
    roundHours(
      shifts
        .filter((shift) => shift.startsAt >= window.startMs && shift.startsAt <= window.endMs)
        .reduce((total, shift) => total + shift.hours, 0),
    ),
  );
}
