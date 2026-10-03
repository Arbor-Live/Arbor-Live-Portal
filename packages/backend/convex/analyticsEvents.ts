import {
  addPacificCalendarDays,
  pacificDateKey,
  pacificEndOfDayMs,
  pacificStartOfDayMs,
} from "@arbor/format";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  analyticsRangeArgs,
  assertValidRange,
  computeShiftStats,
  loadEventsFromNow,
  loadEventsInRange,
  requireAnalyticsAccess,
  SHIFTS_PER_EVENT_LIMIT,
} from "./lib/analyticsQuery";
import { loadBackupUserIds } from "./lib/crewBackups";
import { isCrewedEventType } from "./lib/crewTeams";
import {
  EVENT_PIPELINE_STATUSES,
  normalizeEventStatus,
  type EventPipelineStatus,
} from "./lib/eventStatus";
import { createInvoiceLoader, loadEventBooking, roundUsd } from "./lib/analyticsBookings";
import { listAdditionalInvoiceIds } from "./lib/eventInvoiceLinks";
import { arborEarnedRevenueUsd, invoicePassThroughUsd } from "./lib/invoiceProfit";

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

const horizonSliceValidator = v.object({
  eventCount: v.number(),
  byStatus: v.array(countBucketValidator),
  byEventType: v.array(countBucketValidator),
  bookedRevenueUsd: v.number(),
  bookedEventCount: v.number(),
  upcomingArtistPayoutsUsd: v.number(),
  missingInvoiceCount: v.number(),
  unconfirmedCrewedCount: v.number(),
  missingLeadCount: v.number(),
  missingScheduleCount: v.number(),
});

type HorizonSlice = {
  eventCount: number;
  byStatus: Array<{ key: string; count: number }>;
  byEventType: Array<{ key: string; count: number }>;
  bookedRevenueUsd: number;
  bookedEventCount: number;
  upcomingArtistPayoutsUsd: number;
  missingInvoiceCount: number;
  unconfirmedCrewedCount: number;
  missingLeadCount: number;
  missingScheduleCount: number;
};

type EventEnrichment = {
  event: Doc<"events">;
  status: EventPipelineStatus;
  eventType: string;
  isBookedRevenue: boolean;
  bookedUsd: number;
  artistPayoutsUsd: number;
  missingInvoice: boolean;
  unconfirmedCrewed: boolean;
  missingLead: boolean;
  missingSchedule: boolean;
};

function expectsScheduleBlocks(eventType: string | undefined): boolean {
  return eventType !== "Services Only";
}

/** Inclusive Pacific calendar horizon ending at end-of-day `days` days from today (1 = today only). */
function pacificHorizonEndMs(nowMs: number, days: number): number {
  const [year, month, day] = pacificDateKey(nowMs).split("-").map(Number);
  const startToday = pacificStartOfDayMs(year!, month!, day!);
  const lastDayStart = addPacificCalendarDays(startToday, Math.max(days, 1) - 1);
  const [ly, lm, ld] = pacificDateKey(lastDayStart).split("-").map(Number);
  return pacificEndOfDayMs(ly!, lm!, ld!);
}

function emptyStatusCounts(): Map<EventPipelineStatus, number> {
  return new Map(EVENT_PIPELINE_STATUSES.map((status) => [status, 0]));
}

function toSortedTypeBuckets(map: Map<string, number>) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildSlice(rows: EventEnrichment[]): HorizonSlice {
  const byStatus = emptyStatusCounts();
  const byEventType = new Map<string, number>();
  let bookedRevenueUsd = 0;
  let bookedEventCount = 0;
  let upcomingArtistPayoutsUsd = 0;
  let missingInvoiceCount = 0;
  let unconfirmedCrewedCount = 0;
  let missingLeadCount = 0;
  let missingScheduleCount = 0;

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    byEventType.set(row.eventType, (byEventType.get(row.eventType) ?? 0) + 1);
    if (row.isBookedRevenue) {
      bookedRevenueUsd += row.bookedUsd;
      bookedEventCount += 1;
    }
    upcomingArtistPayoutsUsd += row.artistPayoutsUsd;
    if (row.missingInvoice) missingInvoiceCount += 1;
    if (row.unconfirmedCrewed) unconfirmedCrewedCount += 1;
    if (row.missingLead) missingLeadCount += 1;
    if (row.missingSchedule) missingScheduleCount += 1;
  }

  return {
    eventCount: rows.length,
    byStatus: EVENT_PIPELINE_STATUSES.map((status) => ({
      key: status,
      count: byStatus.get(status) ?? 0,
    })),
    byEventType: toSortedTypeBuckets(byEventType),
    bookedRevenueUsd: roundUsd(bookedRevenueUsd),
    bookedEventCount,
    upcomingArtistPayoutsUsd,
    missingInvoiceCount,
    unconfirmedCrewedCount,
    missingLeadCount,
    missingScheduleCount,
  };
}

export const getUpcomingEventsInsights = query({
  args: {},
  returns: v.object({
    asOfMs: v.number(),
    horizons: v.object({
      d7: horizonSliceValidator,
      d30: horizonSliceValidator,
      d90: horizonSliceValidator,
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAnalyticsAccess(ctx);

    const asOfMs = Date.now();
    const end7 = pacificHorizonEndMs(asOfMs, 7);
    const end30 = pacificHorizonEndMs(asOfMs, 30);
    const end90 = pacificHorizonEndMs(asOfMs, 90);

    const { events, truncated } = await loadEventsFromNow(ctx, asOfMs, end90);
    const active = events.filter((event) => normalizeEventStatus(event.status) !== "cancelled");

    const enriched: EventEnrichment[] = [];
    const loadInvoice = createInvoiceLoader(ctx);

    for (const event of active) {
      const normalized = normalizeEventStatus(event.status);
      if (
        normalized !== "tentative" &&
        normalized !== "logistics" &&
        normalized !== "scheduling" &&
        normalized !== "ready"
      ) {
        continue;
      }
      const status: EventPipelineStatus = normalized;

      const eventType = event.eventType?.trim() || "Unknown";
      const crewed = isCrewedEventType(event.eventType);

      let unconfirmedCrewed = false;
      if (crewed) {
        const shifts = await ctx.db
          .query("eventCrewShifts")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(SHIFTS_PER_EVENT_LIMIT);
        const stats = computeShiftStats(shifts, await loadBackupUserIds(ctx, event._id));
        unconfirmedCrewed = !stats.isCrewConfirmed;
      }

      let missingSchedule = false;
      if (expectsScheduleBlocks(event.eventType)) {
        const block = await ctx.db
          .query("eventScheduleBlocks")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(1);
        missingSchedule = block.length === 0;
      }

      const missingLead = !event.dayOfLeadUserId || !event.eventManagerUserId;

      const booking = await loadEventBooking(ctx, loadInvoice, event);
      const missingInvoice = booking.invoiceIds.length === 0;
      const isBookedRevenue = booking.booked;
      const bookedUsd = roundUsd(booking.earnedRevenueUsd);

      enriched.push({
        event,
        status,
        eventType,
        isBookedRevenue,
        bookedUsd,
        artistPayoutsUsd: Math.max(0, event.bandsCostUsd ?? 0),
        missingInvoice,
        unconfirmedCrewed,
        missingLead,
        missingSchedule,
      });
    }

    const inHorizon = (endMs: number) =>
      enriched.filter((row) => row.event.startAt >= asOfMs && row.event.startAt <= endMs);

    return {
      asOfMs,
      horizons: {
        d7: buildSlice(inHorizon(end7)),
        d30: buildSlice(inHorizon(end30)),
        d90: buildSlice(inHorizon(end90)),
      },
      truncated,
    };
  },
});

const CANCELLATION_LIST_LIMIT = 8;

const cancelReasonValidator = v.union(
  v.literal("client_cancelled"),
  v.literal("weather"),
  v.literal("venue"),
  v.literal("staffing"),
  v.literal("duplicate"),
  v.literal("other"),
  v.literal("unspecified"),
);

/**
 * Events starting in range that were cancelled: how many, why, and the
 * approved quote value that went with them (each event's share of any linked
 * invoice the client had approved).
 */
export const getCancellations = query({
  args: analyticsRangeArgs,
  returns: v.object({
    totalEvents: v.number(),
    cancelledEvents: v.number(),
    cancellationRate: v.union(v.number(), v.null()),
    approvedValueLostUsd: v.number(),
    byReason: v.array(v.object({ reason: cancelReasonValidator, count: v.number() })),
    recent: v.array(
      v.object({
        eventId: v.id("events"),
        title: v.string(),
        startAt: v.number(),
        reason: cancelReasonValidator,
        note: v.optional(v.string()),
        approvedValueUsd: v.number(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const cancelled = events.filter((event) => normalizeEventStatus(event.status) === "cancelled");
    const loadInvoice = createInvoiceLoader(ctx);
    const reasonCounts = new Map<string, number>();
    const rows = [];
    let approvedValueLostUsd = 0;

    for (const event of cancelled) {
      const reason = event.cancelReasonCode ?? "unspecified";
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      const additional = await listAdditionalInvoiceIds(ctx, event._id);
      const invoiceIds = [...new Set([...(event.invoiceId ? [event.invoiceId] : []), ...additional])];
      let approvedValueUsd = 0;
      for (const invoiceId of invoiceIds) {
        const loaded = await loadInvoice(invoiceId);
        if (!loaded || loaded.invoice.approvedAt == null) continue;
        const { invoice, eventCount } = loaded;
        approvedValueUsd +=
          arborEarnedRevenueUsd(
            invoice.approvedTotalUsd ?? invoice.totalUsd,
            invoicePassThroughUsd(invoice.artistsSubtotalUsd, invoice.externalRentalsSubtotalUsd),
          ) / eventCount;
      }
      approvedValueLostUsd += approvedValueUsd;
      rows.push({
        eventId: event._id,
        title: event.title,
        startAt: event.startAt,
        reason: reason as (typeof cancelReasonValidator)["type"],
        note: event.cancelReasonNote?.trim() || undefined,
        approvedValueUsd: roundUsd(approvedValueUsd),
      });
    }

    return {
      totalEvents: events.length,
      cancelledEvents: cancelled.length,
      cancellationRate: events.length > 0 ? cancelled.length / events.length : null,
      approvedValueLostUsd: roundUsd(approvedValueLostUsd),
      byReason: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason: reason as (typeof cancelReasonValidator)["type"], count }))
        .sort((a, b) => b.count - a.count),
      recent: rows.sort((a, b) => b.startAt - a.startAt).slice(0, CANCELLATION_LIST_LIMIT),
      truncated,
    };
  },
});
