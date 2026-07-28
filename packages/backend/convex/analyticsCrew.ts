import { pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  average,
  listPacificMonthKeys,
  median,
  msToDays,
  pacificMonthKey,
} from "./lib/analyticsTime";
import {
  analyticsRangeArgs,
  assertValidRange,
  computeShiftStats,
  CREWED_EVENT_SCAN_LIMIT,
  isShiftFilled,
  requireAnalyticsAccess,
  SHIFTS_PER_EVENT_LIMIT,
} from "./lib/analyticsQuery";
import { isCrewedEventType } from "./lib/crewTeams";
import { normalizeEventStatus } from "./lib/eventStatus";

function getIsoWeekKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadCrewedEventsInRange(
  ctx: Parameters<typeof requireAnalyticsAccess>[0],
  startMs: number,
  endMs: number,
) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", startMs).lte("startAt", endMs))
    .take(CREWED_EVENT_SCAN_LIMIT);
  const events = rows.filter(
    (event) =>
      normalizeEventStatus(event.status) !== "cancelled" && isCrewedEventType(event.eventType),
  );
  return { events, truncated: rows.length >= CREWED_EVENT_SCAN_LIMIT };
}

export const getCrewFillRate = query({
  args: analyticsRangeArgs,
  returns: v.object({
    totalShifts: v.number(),
    filledShifts: v.number(),
    unfilledShifts: v.number(),
    fillRate: v.union(v.number(), v.null()),
    eventsCount: v.number(),
    unconfirmedEvents: v.number(),
    byMonth: v.array(
      v.object({
        monthKey: v.string(),
        totalShifts: v.number(),
        filledShifts: v.number(),
        fillRate: v.union(v.number(), v.null()),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const monthStats = new Map(
      monthKeys.map((monthKey) => [monthKey, { totalShifts: 0, filledShifts: 0 }]),
    );

    let totalShifts = 0;
    let filledShifts = 0;
    let unconfirmedEvents = 0;

    for (const event of events) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(SHIFTS_PER_EVENT_LIMIT);
      const stats = computeShiftStats(shifts);
      totalShifts += stats.totalShifts;
      filledShifts += stats.filledShifts;
      if (!stats.isCrewConfirmed) unconfirmedEvents += 1;

      const monthKey = pacificMonthKey(event.startAt);
      const bucket = monthStats.get(monthKey);
      if (bucket) {
        bucket.totalShifts += stats.totalShifts;
        bucket.filledShifts += stats.filledShifts;
      }
    }

    return {
      totalShifts,
      filledShifts,
      unfilledShifts: totalShifts - filledShifts,
      fillRate: totalShifts > 0 ? filledShifts / totalShifts : null,
      eventsCount: events.length,
      unconfirmedEvents,
      byMonth: monthKeys.map((monthKey) => {
        const bucket = monthStats.get(monthKey)!;
        return {
          monthKey,
          totalShifts: bucket.totalShifts,
          filledShifts: bucket.filledShifts,
          fillRate: bucket.totalShifts > 0 ? bucket.filledShifts / bucket.totalShifts : null,
        };
      }),
      truncated,
    };
  },
});

export const getCrewHoursAndOt = query({
  args: analyticsRangeArgs,
  returns: v.object({
    totalHours: v.number(),
    byWeek: v.array(
      v.object({
        weekKey: v.string(),
        hours: v.number(),
      }),
    ),
    otRiskUsers: v.number(),
    dtRiskUsers: v.number(),
    usersWithHours: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    const hoursByWeek = new Map<string, number>();
    const hoursByUserDay = new Map<string, Map<string, number>>();
    const hoursByUserWeek = new Map<string, Map<string, number>>();
    const users = new Set<string>();

    for (const event of events) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(SHIFTS_PER_EVENT_LIMIT);

      for (const shift of shifts) {
        if (!isShiftFilled(shift) || !shift.userId) continue;
        const userId = shift.userId.trim();
        users.add(userId);
        const dayKey = pacificDateKey(shift.startsAt);
        const weekKey = getIsoWeekKey(dayKey);

        hoursByWeek.set(weekKey, roundHours((hoursByWeek.get(weekKey) ?? 0) + shift.hours));

        const dayMap = hoursByUserDay.get(userId) ?? new Map<string, number>();
        dayMap.set(dayKey, roundHours((dayMap.get(dayKey) ?? 0) + shift.hours));
        hoursByUserDay.set(userId, dayMap);

        const weekMap = hoursByUserWeek.get(userId) ?? new Map<string, number>();
        weekMap.set(weekKey, roundHours((weekMap.get(weekKey) ?? 0) + shift.hours));
        hoursByUserWeek.set(userId, weekMap);
      }
    }

    let otRiskUsers = 0;
    let dtRiskUsers = 0;
    for (const userId of users) {
      const dayMap = hoursByUserDay.get(userId) ?? new Map();
      const weekMap = hoursByUserWeek.get(userId) ?? new Map();
      let hasOt = false;
      let hasDt = false;
      for (const hours of dayMap.values()) {
        if (hours > 12) hasDt = true;
        else if (hours > 8) hasOt = true;
      }
      for (const hours of weekMap.values()) {
        if (hours > 40) hasOt = true;
      }
      if (hasOt) otRiskUsers += 1;
      if (hasDt) dtRiskUsers += 1;
    }

    const byWeek = [...hoursByWeek.entries()]
      .map(([weekKey, hours]) => ({ weekKey, hours }))
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey));

    return {
      totalHours: roundHours([...hoursByWeek.values()].reduce((sum, h) => sum + h, 0)),
      byWeek,
      otRiskUsers,
      dtRiskUsers,
      usersWithHours: users.size,
      truncated,
    };
  },
});

export const getAvailabilityLatency = query({
  args: analyticsRangeArgs,
  returns: v.object({
    sampleSize: v.number(),
    avgDays: v.union(v.number(), v.null()),
    medianDays: v.union(v.number(), v.null()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    const latencies: number[] = [];

    for (const event of events) {
      const responses = await ctx.db
        .query("eventCrewAvailabilityResponses")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(200);
      for (const response of responses) {
        // Proxy: event createdAt ≈ when crew was asked (no dedicated request-sent timestamp).
        if (response.respondedAt < event.createdAt) continue;
        latencies.push(msToDays(response.respondedAt - event.createdAt));
      }
    }

    return {
      sampleSize: latencies.length,
      avgDays: average(latencies),
      medianDays: median(latencies),
      truncated,
    };
  },
});

export const getCrewAttentionAging = query({
  args: analyticsRangeArgs,
  returns: v.object({
    unconfirmedEvents: v.number(),
    avgDaysUntilStart: v.union(v.number(), v.null()),
    medianDaysUntilStart: v.union(v.number(), v.null()),
    overdueUnconfirmed: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const now = Date.now();
    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    const daysUntilStart: number[] = [];
    let unconfirmedEvents = 0;
    let overdueUnconfirmed = 0;

    for (const event of events) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(SHIFTS_PER_EVENT_LIMIT);
      const stats = computeShiftStats(shifts);
      if (stats.isCrewConfirmed) continue;
      unconfirmedEvents += 1;
      const days = msToDays(event.startAt - now);
      daysUntilStart.push(days);
      if (event.startAt < now) overdueUnconfirmed += 1;
    }

    return {
      unconfirmedEvents,
      avgDaysUntilStart: average(daysUntilStart),
      medianDaysUntilStart: median(daysUntilStart),
      overdueUnconfirmed,
      truncated,
    };
  },
});

/** Compact KPIs for the crew-scheduling dashboard header. */
export const getCrewSchedulingKpis = query({
  args: analyticsRangeArgs,
  returns: v.object({
    fillRate: v.union(v.number(), v.null()),
    unfilledShifts: v.number(),
    unconfirmedEvents: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    let totalShifts = 0;
    let filledShifts = 0;
    let unconfirmedEvents = 0;

    for (const event of events) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(SHIFTS_PER_EVENT_LIMIT);
      const stats = computeShiftStats(shifts);
      totalShifts += stats.totalShifts;
      filledShifts += stats.filledShifts;
      if (!stats.isCrewConfirmed) unconfirmedEvents += 1;
    }

    return {
      fillRate: totalShifts > 0 ? filledShifts / totalShifts : null,
      unfilledShifts: totalShifts - filledShifts,
      unconfirmedEvents,
      truncated,
    };
  },
});
