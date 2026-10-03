import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  analyticsRangeArgs,
  assertValidRange,
  loadEventsInRange,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import {
  createInvoiceLoader,
  eventCostUsd,
  eventNetProfitUsd,
  loadEventBooking,
  roundUsd,
} from "./lib/analyticsBookings";
import { normalizeEventStatus } from "./lib/eventStatus";

const SEGMENT_LIMIT = 8;
const LOWEST_MARGIN_LIMIT = 6;

const segmentValidator = v.object({
  key: v.string(),
  events: v.number(),
  revenueUsd: v.number(),
  profitUsd: v.number(),
  marginRate: v.union(v.number(), v.null()),
});

type Segment = { key: string; events: number; revenueUsd: number; profitUsd: number };

function addToSegment(map: Map<string, Segment>, key: string, revenueUsd: number, profitUsd: number) {
  const segment = map.get(key) ?? { key, events: 0, revenueUsd: 0, profitUsd: 0 };
  segment.events += 1;
  segment.revenueUsd += revenueUsd;
  segment.profitUsd += profitUsd;
  map.set(key, segment);
}

function marginRate(revenueUsd: number, profitUsd: number) {
  return revenueUsd > 0 ? profitUsd / revenueUsd : null;
}

function topSegments(map: Map<string, Segment>) {
  return [...map.values()]
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, SEGMENT_LIMIT)
    .map((segment) => ({
      key: segment.key,
      events: segment.events,
      revenueUsd: roundUsd(segment.revenueUsd),
      profitUsd: roundUsd(segment.profitUsd),
      marginRate: marginRate(segment.revenueUsd, segment.profitUsd),
    }));
}

/**
 * Margin on events starting in range: each event's share of its booked
 * invoices (net of artist and external-rental pass-through) minus its costs.
 * Crew cost is the scheduled-shift estimate on the event, so labor margin is
 * a planning number, not payroll.
 */
export const getProfitability = query({
  args: analyticsRangeArgs,
  returns: v.object({
    bookedEvents: v.number(),
    earnedRevenueUsd: v.number(),
    costUsd: v.number(),
    netProfitUsd: v.number(),
    marginRate: v.union(v.number(), v.null()),
    crewBilledUsd: v.number(),
    crewCostUsd: v.number(),
    crewMarginRate: v.union(v.number(), v.null()),
    unbookedEvents: v.number(),
    unbookedCostUsd: v.number(),
    byEventType: v.array(segmentValidator),
    byVenue: v.array(segmentValidator),
    lowestMargin: v.array(
      v.object({
        eventId: v.id("events"),
        title: v.string(),
        startAt: v.number(),
        eventType: v.optional(v.string()),
        revenueUsd: v.number(),
        profitUsd: v.number(),
        marginRate: v.union(v.number(), v.null()),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const loadInvoice = createInvoiceLoader(ctx);
    const byEventType = new Map<string, Segment>();
    const byVenue = new Map<string, Segment>();
    const perEvent: Array<{
      eventId: (typeof events)[number]["_id"];
      title: string;
      startAt: number;
      eventType?: string;
      revenueUsd: number;
      profitUsd: number;
    }> = [];

    let earnedRevenueUsd = 0;
    let costUsd = 0;
    let crewBilledUsd = 0;
    let crewCostUsd = 0;
    let unbookedEvents = 0;
    let unbookedCostUsd = 0;

    for (const event of events) {
      if (normalizeEventStatus(event.status) === "cancelled") continue;
      const booking = await loadEventBooking(ctx, loadInvoice, event);
      if (!booking.booked) {
        const costs = eventCostUsd(event);
        if (costs > 0) {
          unbookedEvents += 1;
          unbookedCostUsd += costs;
        }
        continue;
      }
      const profit = eventNetProfitUsd(event, booking);
      earnedRevenueUsd += booking.earnedRevenueUsd;
      costUsd += profit.costUsd;
      crewBilledUsd += booking.crewBilledUsd;
      crewCostUsd += event.crewCostUsd ?? 0;
      addToSegment(
        byEventType,
        event.eventType?.trim() || "Unknown",
        booking.earnedRevenueUsd,
        profit.netProfitUsd,
      );
      addToSegment(
        byVenue,
        event.venueName?.trim() || "No venue",
        booking.earnedRevenueUsd,
        profit.netProfitUsd,
      );
      perEvent.push({
        eventId: event._id,
        title: event.title,
        startAt: event.startAt,
        eventType: event.eventType,
        revenueUsd: booking.earnedRevenueUsd,
        profitUsd: profit.netProfitUsd,
      });
    }

    const netProfitUsd = earnedRevenueUsd - costUsd;
    const lowestMargin = perEvent
      .filter((row) => row.revenueUsd > 0)
      .sort((a, b) => a.profitUsd / a.revenueUsd - b.profitUsd / b.revenueUsd)
      .slice(0, LOWEST_MARGIN_LIMIT)
      .map((row) => ({
        ...row,
        revenueUsd: roundUsd(row.revenueUsd),
        profitUsd: roundUsd(row.profitUsd),
        marginRate: marginRate(row.revenueUsd, row.profitUsd),
      }));

    return {
      bookedEvents: perEvent.length,
      earnedRevenueUsd: roundUsd(earnedRevenueUsd),
      costUsd: roundUsd(costUsd),
      netProfitUsd: roundUsd(netProfitUsd),
      marginRate: marginRate(earnedRevenueUsd, netProfitUsd),
      crewBilledUsd: roundUsd(crewBilledUsd),
      crewCostUsd: roundUsd(crewCostUsd),
      crewMarginRate: marginRate(crewBilledUsd, crewBilledUsd - crewCostUsd),
      unbookedEvents,
      unbookedCostUsd: roundUsd(unbookedCostUsd),
      byEventType: topSegments(byEventType),
      byVenue: topSegments(byVenue),
      lowestMargin,
      truncated,
    };
  },
});
