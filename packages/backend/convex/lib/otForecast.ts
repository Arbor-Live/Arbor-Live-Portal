import { pacificDateKey } from "@arbor/format";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type ShiftRow = Pick<Doc<"eventCrewShifts">, "startsAt" | "endsAt" | "hours">;

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

export async function getUserOtForecast(
  ctx: QueryCtx,
  userId: string,
  rangeStart: number,
  rangeEnd: number,
) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", rangeStart).lte("startsAt", rangeEnd),
    )
    .take(500);

  const hoursByDay = new Map<string, number>();
  const hoursByWeek = new Map<string, number>();

  for (const shift of shifts) {
    const dayKey = pacificDateKey(shift.startsAt);
    hoursByDay.set(dayKey, roundHours((hoursByDay.get(dayKey) ?? 0) + shift.hours));
    const weekKey = getIsoWeekKey(dayKey);
    hoursByWeek.set(weekKey, roundHours((hoursByWeek.get(weekKey) ?? 0) + shift.hours));
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

export function forecastWithProposedShift(
  existingShifts: ShiftRow[],
  proposedShift: { startsAt: number; endsAt: number; hours: number },
) {
  const combined = [...existingShifts, proposedShift];
  const hoursByDay = new Map<string, number>();
  const hoursByWeek = new Map<string, number>();

  for (const shift of combined) {
    const dayKey = pacificDateKey(shift.startsAt);
    hoursByDay.set(dayKey, roundHours((hoursByDay.get(dayKey) ?? 0) + shift.hours));
    const weekKey = getIsoWeekKey(dayKey);
    hoursByWeek.set(weekKey, roundHours((hoursByWeek.get(weekKey) ?? 0) + shift.hours));
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
