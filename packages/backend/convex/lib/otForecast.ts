import { pacificDateKey } from "@arbor/format";
import { crewCountableHours, overlappingCrewShiftIds } from "@arbor/invoice-document/crew-hours";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeEventStatus } from "./eventStatus";

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
/** A saved shift on another event. */
type ShiftHours = {
  id?: string;
  startsAt: number;
  /** Without an end the shift runs `hours` from its start. */
  endsAt?: number;
  hours: number;
  createdAt?: number;
  /** On a cancelled event: never covers this event's time. */
  cancelled?: boolean;
};

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
  const otherShifts = others.filter((shift) => shift.eventId !== eventId);
  // Only shifts that overlap another need their event's status (cancelled never covers time).
  const overlapping = overlappingCrewShiftIds([
    ...otherShifts.map((shift) => ({ id: shift._id, userId, startsAt: shift.startsAt, endsAt: shift.endsAt, hours: shift.hours })),
    ...eventShifts.map((shift, index) => ({ id: `proposed-${index}`, userId, ...shift, hours: 0 })),
  ]);
  const eventIds = [...new Set(otherShifts.filter((shift) => overlapping.has(shift._id)).map((shift) => shift.eventId))];
  const events = await Promise.all(eventIds.map((id) => ctx.db.get(id)));
  const cancelled = new Set(
    eventIds.filter((_, index) => {
      const event = events[index];
      return !event || normalizeEventStatus(event.status) === "cancelled";
    }),
  );
  return forecastOt(
    otherShifts.map((shift) => ({
      id: shift._id,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      hours: shift.hours,
      createdAt: shift._creationTime,
      cancelled: cancelled.has(shift.eventId),
    })),
    eventShifts,
  );
}

export function forecastOt(otherShifts: ShiftHours[], eventShifts: ShiftWindow[]) {
  const proposed = eventShifts
    .filter((shift) => shift.endsAt > shift.startsAt)
    .map((shift, index) => ({
      id: `proposed-${index}`,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      hours: (shift.endsAt - shift.startsAt) / 3_600_000,
    }));
  // Time on two shifts at once counts once, on the shift that starts first.
  // This event's draft shifts aren't saved yet, so they lose a tie on start.
  const saved = otherShifts.map((shift, index) => ({
    ...shift,
    id: shift.id ?? `other-${index}`,
    endsAt: shift.endsAt ?? shift.startsAt + shift.hours * 3_600_000,
  }));
  const countable = crewCountableHours(
    [...saved, ...proposed].map((shift) => ({ ...shift, userId: "person" })),
  );
  const dayKeys = new Set(proposed.map((shift) => pacificDateKey(shift.startsAt)));
  const weekKeys = new Set([...dayKeys].map(getIsoWeekKey));

  const hoursByDay = new Map<string, number>();
  const hoursByWeek = new Map<string, number>();
  for (const shift of [...saved, ...proposed]) {
    const dayKey = pacificDateKey(shift.startsAt);
    const weekKey = getIsoWeekKey(dayKey);
    const hours = countable.get(shift.id) ?? shift.hours;
    if (dayKeys.has(dayKey)) {
      hoursByDay.set(dayKey, roundHours((hoursByDay.get(dayKey) ?? 0) + hours));
    }
    if (weekKeys.has(weekKey)) {
      hoursByWeek.set(weekKey, roundHours((hoursByWeek.get(weekKey) ?? 0) + hours));
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
