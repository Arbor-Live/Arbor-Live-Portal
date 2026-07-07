import { pacificDateKey, pacificStartOfDayMs, payPeriodStatus, recentPayPeriods } from "@arbor/format";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserId, requireAuth } from "./lib/auth";
import { computeUserDayHours } from "./lib/stanfordHours";

const timecardEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  actualHours: v.number(),
  inputHours: v.number(),
});

const timecardDayValue = v.object({
  dateMs: v.number(),
  events: v.array(timecardEventValue),
  totalActual: v.number(),
  totalInput: v.number(),
});

const timecardPeriodValue = v.object({
  startMs: v.number(),
  endMs: v.number(),
  dueMs: v.number(),
  label: v.string(),
  status: v.union(v.literal("open"), v.literal("due"), v.literal("past_due")),
  daysWorked: v.number(),
  days: v.array(timecardDayValue),
});

export const getMyTimecards = query({
  args: {
    now: v.number(),
  },
  returns: v.array(timecardPeriodValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const periods = recentPayPeriods(args.now, 3);

    const eventOtPremium = new Map<Id<"events">, boolean>();
    const results = [];

    for (const period of periods) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_userId_and_startsAt", (q) =>
          q
            .eq("userId", userId)
            .gte("startsAt", period.startMs)
            .lte("startsAt", period.endMs),
        )
        .take(500);

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

      const days = [];
      for (const [dayKey, eventMap] of dayEventShifts.entries()) {
        const [year, month, day] = dayKey.split("-").map(Number);
        const dateMs = pacificStartOfDayMs(year, month, day);
        const events = [];
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
          totalActual: Math.round(totalActual * 100) / 100,
          totalInput: Math.round(totalInput * 100) / 100,
        });
      }

      results.push({
        startMs: period.startMs,
        endMs: period.endMs,
        dueMs: period.dueMs,
        label: period.label,
        status: payPeriodStatus(period, args.now),
        daysWorked: dayEventShifts.size,
        days: days.sort((a, b) => a.dateMs - b.dateMs),
      });
    }

    return results;
  },
});
