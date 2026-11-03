import type { QueryCtx } from "../_generated/server";
import { countableShiftHours, loadUserShiftsWithLookback } from "./crewShiftOverlap";

export type HoursWindow = { startMs: number; endMs: number };

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Hours a person is on shifts that start inside each window (worked and still
 * scheduled alike), across every event. Overlapping shifts count their shared
 * time once (`crewCountableHours`). One indexed read covers all windows.
 */
export async function sumShiftHoursInWindows(
  ctx: QueryCtx,
  userId: string,
  windows: readonly HoursWindow[],
): Promise<number[]> {
  if (windows.length === 0) return [];
  const from = Math.min(...windows.map((window) => window.startMs));
  const to = Math.max(...windows.map((window) => window.endMs));
  const shifts = await loadUserShiftsWithLookback(ctx, userId, from, to);
  const countable = await countableShiftHours(ctx, shifts);
  return windows.map((window) =>
    roundHours(
      shifts
        .filter((shift) => shift.startsAt >= window.startMs && shift.startsAt <= window.endMs)
        .reduce((total, shift) => total + (countable.get(shift._id) ?? shift.hours), 0),
    ),
  );
}
