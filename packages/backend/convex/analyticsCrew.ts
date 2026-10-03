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
  loadEventsInRange,
  requireAnalyticsAccess,
  SHIFTS_PER_EVENT_LIMIT,
} from "./lib/analyticsQuery";
import { findAuthUsersByIds } from "./lib/auth";
import { loadBackupUserIds } from "./lib/crewBackups";
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

const TOP_CREW_LIMIT = 8;

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadCrewedEventsInRange(
  ctx: Parameters<typeof requireAnalyticsAccess>[0],
  startMs: number,
  endMs: number,
) {
  // Filter before capping: a cap on all events would cut a long range off at
  // its oldest months once rentals and services-only events fill the scan.
  const { events: rows, truncated: scanTruncated } = await loadEventsInRange(ctx, startMs, endMs);
  const crewed = rows.filter(
    (event) =>
      normalizeEventStatus(event.status) !== "cancelled" && isCrewedEventType(event.eventType),
  );
  return {
    events: crewed.slice(0, CREWED_EVENT_SCAN_LIMIT),
    truncated: scanTruncated || crewed.length > CREWED_EVENT_SCAN_LIMIT,
  };
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
      const stats = computeShiftStats(shifts, await loadBackupUserIds(ctx, event._id));
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
    /** Share of all hours worked by the five busiest crew: bench depth. */
    topFiveShare: v.union(v.number(), v.null()),
    topCrew: v.array(
      v.object({
        userId: v.string(),
        name: v.string(),
        hours: v.number(),
        shifts: v.number(),
        events: v.number(),
      }),
    ),
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
    const perUser = new Map<string, { hours: number; shifts: number; events: Set<string> }>();

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
        const totals = perUser.get(userId) ?? { hours: 0, shifts: 0, events: new Set<string>() };
        totals.hours += shift.hours;
        totals.shifts += 1;
        totals.events.add(event._id);
        perUser.set(userId, totals);

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

    const totalHours = roundHours([...hoursByWeek.values()].reduce((sum, h) => sum + h, 0));
    const ranked = [...perUser.entries()].sort((a, b) => b[1].hours - a[1].hours);
    const topIds = ranked.slice(0, TOP_CREW_LIMIT).map(([userId]) => userId);
    const userByKey = await findAuthUsersByIds(ctx, topIds);
    const topFiveHours = ranked.slice(0, 5).reduce((sum, [, totals]) => sum + totals.hours, 0);

    return {
      totalHours,
      byWeek,
      otRiskUsers,
      dtRiskUsers,
      usersWithHours: users.size,
      topFiveShare: totalHours > 0 ? topFiveHours / totalHours : null,
      topCrew: ranked.slice(0, TOP_CREW_LIMIT).map(([userId, totals]) => {
        const user = userByKey.get(userId);
        return {
          userId,
          name: user?.name || user?.email || "Unknown crew",
          hours: roundHours(totals.hours),
          shifts: totals.shifts,
          events: totals.events.size,
        };
      }),
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
      const stats = computeShiftStats(shifts, await loadBackupUserIds(ctx, event._id));
      if (stats.isCrewConfirmed) continue;
      unconfirmedEvents += 1;
      // Lead time only means something for events still ahead.
      if (event.startAt < now) overdueUnconfirmed += 1;
      else daysUntilStart.push(msToDays(event.startAt - now));
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
    /** Filled slots held by a backup ("only if necessary"). */
    backupShifts: v.number(),
    unconfirmedEvents: v.number(),
    noSlotEvents: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadCrewedEventsInRange(ctx, args.startMs, args.endMs);
    let totalShifts = 0;
    let filledShifts = 0;
    let backupShifts = 0;
    let unconfirmedEvents = 0;
    let noSlotEvents = 0;
    let fillRateShifts = 0;
    let fillRateFilledShifts = 0;

    for (const event of events) {
      const shifts = await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(SHIFTS_PER_EVENT_LIMIT);
      const stats = computeShiftStats(shifts, await loadBackupUserIds(ctx, event._id));
      totalShifts += stats.totalShifts;
      filledShifts += stats.filledShifts;
      backupShifts += stats.backupShifts;
      if (!stats.isCrewConfirmed) unconfirmedEvents += 1;
      // An event with no staffing slots is not "100% filled" — it has nothing
      // scheduled yet, so count it as needing crew and keep it out of the rate.
      if (stats.totalShifts === 0) {
        noSlotEvents += 1;
      } else {
        fillRateShifts += stats.totalShifts;
        fillRateFilledShifts += stats.filledShifts;
      }
    }

    return {
      fillRate: fillRateShifts > 0 ? fillRateFilledShifts / fillRateShifts : null,
      unfilledShifts: totalShifts - filledShifts,
      backupShifts,
      unconfirmedEvents,
      noSlotEvents,
      truncated,
    };
  },
});
