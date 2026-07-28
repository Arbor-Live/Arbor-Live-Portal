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
  computeShiftStats,
  loadEventsFromNow,
  requireAnalyticsAccess,
  SHIFTS_PER_EVENT_LIMIT,
} from "./lib/analyticsQuery";
import { isCrewedEventType } from "./lib/crewTeams";
import {
  EVENT_PIPELINE_STATUSES,
  normalizeEventStatus,
  type EventPipelineStatus,
} from "./lib/eventStatus";

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

const horizonSliceValidator = v.object({
  eventCount: v.number(),
  byStatus: v.array(countBucketValidator),
  byEventType: v.array(countBucketValidator),
  bookedRevenueUsd: v.number(),
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
  missingInvoice: boolean;
  unconfirmedCrewed: boolean;
  missingLead: boolean;
  missingSchedule: boolean;
};

function expectsScheduleBlocks(eventType: string | undefined): boolean {
  return eventType !== "Services Only";
}

function isBookedInvoice(invoice: Doc<"invoices"> | null): boolean {
  if (!invoice || invoice.status === "void") return false;
  return (
    invoice.status === "finalized" && (invoice.clientApprovalStatus ?? "pending") === "approved"
  );
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
  let missingInvoiceCount = 0;
  let unconfirmedCrewedCount = 0;
  let missingLeadCount = 0;
  let missingScheduleCount = 0;

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    byEventType.set(row.eventType, (byEventType.get(row.eventType) ?? 0) + 1);
    if (row.isBookedRevenue) bookedRevenueUsd += row.bookedUsd;
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
    bookedRevenueUsd,
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
        const stats = computeShiftStats(shifts);
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

      let isBookedRevenue = false;
      let bookedUsd = 0;
      const missingInvoice = !event.invoiceId;
      if (event.invoiceId) {
        const invoice = await ctx.db.get(event.invoiceId);
        if (isBookedInvoice(invoice)) {
          isBookedRevenue = true;
          bookedUsd = invoice!.totalUsd;
        }
      }

      enriched.push({
        event,
        status,
        eventType,
        isBookedRevenue,
        bookedUsd,
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
