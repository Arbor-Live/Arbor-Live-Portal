import { pacificDateKey, pacificStartOfDayMs, payPeriodStatus, recentPayPeriods } from "@arbor/format";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { computeUserDayHours } from "./stanfordHours";

export const timecardEventShape = {
  eventId: "" as Id<"events">,
  title: "",
  actualHours: 0,
  inputHours: 0,
};

export type TimecardEvent = {
  eventId: Id<"events">;
  title: string;
  actualHours: number;
  inputHours: number;
};

export type TimecardDay = {
  dateMs: number;
  events: TimecardEvent[];
  totalActual: number;
  totalInput: number;
};

export type TimecardPeriod = {
  startMs: number;
  endMs: number;
  dueMs: number;
  label: string;
  status: "open" | "due" | "past_due";
  daysWorked: number;
  days: TimecardDay[];
};

export type TimecardPeriodSummary = {
  startMs: number;
  endMs: number;
  dueMs: number;
  label: string;
  status: "open" | "due" | "past_due";
  daysWorked: number;
  totalActualHours: number;
  totalInputHours: number;
};

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadShiftsForUserInRange(
  ctx: QueryCtx,
  userId: string,
  rangeStart: number,
  rangeEnd: number,
) {
  return await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_userId_and_startsAt", (q) =>
      q.eq("userId", userId).gte("startsAt", rangeStart).lte("startsAt", rangeEnd),
    )
    .take(500);
}

export async function buildTimecardPeriodForUser(
  ctx: QueryCtx,
  userId: string,
  period: { startMs: number; endMs: number; dueMs: number; label: string },
  now: number,
): Promise<TimecardPeriod> {
  const shifts = await loadShiftsForUserInRange(ctx, userId, period.startMs, period.endMs);
  const eventOtPremium = new Map<Id<"events">, boolean>();
  const dayEventShifts = new Map<string, Map<Id<"events">, Array<{ hours: number }>>>();

  for (const shift of shifts) {
    const dayKey = pacificDateKey(shift.startsAt);
    if (!dayEventShifts.has(dayKey)) dayEventShifts.set(dayKey, new Map());
    const eventMap = dayEventShifts.get(dayKey)!;
    if (!eventMap.has(shift.eventId)) eventMap.set(shift.eventId, []);
    eventMap.get(shift.eventId)!.push({ hours: shift.hours });

    if (!eventOtPremium.has(shift.eventId)) {
      const event = await ctx.db.get(shift.eventId);
      eventOtPremium.set(shift.eventId, event?.otPremium === true);
    }
  }

  const days: TimecardDay[] = [];
  for (const [dayKey, eventMap] of dayEventShifts.entries()) {
    const [year, month, day] = dayKey.split("-").map(Number);
    const dateMs = pacificStartOfDayMs(year, month, day);
    const events: TimecardEvent[] = [];
    let totalActual = 0;
    let totalInput = 0;

    for (const [eventId, eventShifts] of eventMap.entries()) {
      const event = await ctx.db.get(eventId);
      const hours = computeUserDayHours(eventShifts, {
        otPremium: eventOtPremium.get(eventId),
      });
      events.push({
        eventId,
        title: event?.title ?? "Event",
        actualHours: hours.actualHours,
        inputHours: hours.inputHours,
      });
      totalActual += hours.actualHours;
      totalInput += hours.inputHours;
    }

    days.push({
      dateMs,
      events: events.sort((a, b) => a.title.localeCompare(b.title)),
      totalActual: roundHours(totalActual),
      totalInput: roundHours(totalInput),
    });
  }

  return {
    startMs: period.startMs,
    endMs: period.endMs,
    dueMs: period.dueMs,
    label: period.label,
    status: payPeriodStatus(period, now),
    daysWorked: dayEventShifts.size,
    days: days.sort((a, b) => a.dateMs - b.dateMs),
  };
}

export async function buildTimecardPeriodSummaryForUser(
  ctx: QueryCtx,
  userId: string,
  period: { startMs: number; endMs: number; dueMs: number; label: string },
  now: number,
): Promise<TimecardPeriodSummary> {
  const full = await buildTimecardPeriodForUser(ctx, userId, period, now);
  const totalActualHours = roundHours(full.days.reduce((sum, day) => sum + day.totalActual, 0));
  const totalInputHours = roundHours(full.days.reduce((sum, day) => sum + day.totalInput, 0));
  return {
    startMs: full.startMs,
    endMs: full.endMs,
    dueMs: full.dueMs,
    label: full.label,
    status: full.status,
    daysWorked: full.daysWorked,
    totalActualHours,
    totalInputHours,
  };
}

export async function buildUserTimecards(
  ctx: QueryCtx,
  userId: string,
  now: number,
  periodCount = 3,
): Promise<TimecardPeriod[]> {
  const periods = recentPayPeriods(now, periodCount);
  const results: TimecardPeriod[] = [];
  for (const period of periods) {
    results.push(await buildTimecardPeriodForUser(ctx, userId, period, now));
  }
  return results;
}
