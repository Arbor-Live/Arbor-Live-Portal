import { pacificDateKey } from "@arbor/format";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const DAY_MS = 24 * 3_600_000;

function getIsoWeekKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

type ShiftWindow = { startsAt: number; endsAt: number };
type ShiftHours = { startsAt: number; hours: number };

/**
 * Overtime this event's shifts would land in for one person: their saved
 * shifts on other events plus `eventShifts` (this event's draft), checked only
 * on the days and workweeks those shifts fall on. A long day elsewhere in the
 * pay period doesn't make a normal-rate day here overtime.
 */
export async function getUserOtForecast(
  ctx: QueryCtx,
  userId: string,
  eventId: Id<"events">,
  eventShifts: ShiftWindow[],
) {
  const starts = eventShifts.map((shift) => shift.startsAt);
  if (starts.length === 0) return forecastOt([], []);
  // Anything in the same ISO week starts within 7 days of one of these shifts.
  const others = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q
        .eq("userId", userId)
        .gte("startsAt", Math.min(...starts) - 7 * DAY_MS)
        .lte("startsAt", Math.max(...starts) + 7 * DAY_MS),
    )
    .take(500);
  return forecastOt(
    others.filter((shift) => shift.eventId !== eventId),
    eventShifts,
  );
}

export function forecastOt(otherShifts: ShiftHours[], eventShifts: ShiftWindow[]) {
  const proposed = eventShifts
    .filter((shift) => shift.endsAt > shift.startsAt)
    .map((shift) => ({
      startsAt: shift.startsAt,
      hours: (shift.endsAt - shift.startsAt) / 3_600_000,
    }));
  const dayKeys = new Set(proposed.map((shift) => pacificDateKey(shift.startsAt)));
  const weekKeys = new Set([...dayKeys].map(getIsoWeekKey));

  const hoursByDay = new Map<string, number>();
  const hoursByWeek = new Map<string, number>();
  for (const shift of [...otherShifts, ...proposed]) {
    const dayKey = pacificDateKey(shift.startsAt);
    const weekKey = getIsoWeekKey(dayKey);
    if (dayKeys.has(dayKey)) {
      hoursByDay.set(dayKey, roundHours((hoursByDay.get(dayKey) ?? 0) + shift.hours));
    }
    if (weekKeys.has(weekKey)) {
      hoursByWeek.set(weekKey, roundHours((hoursByWeek.get(weekKey) ?? 0) + shift.hours));
    }
  }

  const otDays: Array<{ dayKey: string; hours: number }> = [];
  const dtDays: Array<{ dayKey: string; hours: number }> = [];
  for (const [dayKey, hours] of hoursByDay.entries()) {
    if (hours > 12) dtDays.push({ dayKey, hours });
    else if (hours > 8) otDays.push({ dayKey, hours });
  }

  const otWeeks: Array<{ weekKey: string; hours: number }> = [];
  for (const [weekKey, hours] of hoursByWeek.entries()) {
    if (hours > 40) otWeeks.push({ weekKey, hours });
  }

  return {
    hasOt: otDays.length > 0 || otWeeks.length > 0,
    hasDt: dtDays.length > 0,
    otDays,
    dtDays,
    otWeeks,
  };
}
