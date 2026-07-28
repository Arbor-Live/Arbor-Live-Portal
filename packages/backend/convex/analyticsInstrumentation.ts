import { bookingDeclineReasonLabel } from "@arbor/format";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { EVENT_PIPELINE_STATUSES, normalizeEventStatus } from "./lib/eventStatus";
import {
  analyticsRangeArgs,
  assertValidRange,
  INVOICE_SCAN_LIMIT,
  loadEventsInRange,
  REQUEST_SCAN_LIMIT,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import { average, median, msToDays } from "./lib/analyticsTime";

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

const dwellStageValidator = v.object({
  stage: v.string(),
  sampleSize: v.number(),
  avgDays: v.union(v.number(), v.null()),
  medianDays: v.union(v.number(), v.null()),
});

async function loadDeclinedRequestsInRange(
  ctx: Parameters<typeof requireAnalyticsAccess>[0],
  startMs: number,
  endMs: number,
) {
  const rows = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) =>
      q.eq("status", "declined").gte("submittedAt", startMs).lte("submittedAt", endMs),
    )
    .take(REQUEST_SCAN_LIMIT);
  return { rows, truncated: rows.length >= REQUEST_SCAN_LIMIT };
}

export const getDeclineReasonBreakdown = query({
  args: analyticsRangeArgs,
  returns: v.object({
    byReason: v.array(countBucketValidator),
    totalDeclined: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { rows, truncated } = await loadDeclinedRequestsInRange(ctx, args.startMs, args.endMs);
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = bookingDeclineReasonLabel(row.declineReasonCode ?? "unknown");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return {
      byReason: [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      totalDeclined: rows.length,
      truncated,
    };
  },
});

export const getEventPipelineDwell = query({
  args: analyticsRangeArgs,
  returns: v.object({
    stages: v.array(dwellStageValidator),
    eventsWithTransitions: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated: eventsTruncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const activeEvents = events.filter((event) => normalizeEventStatus(event.status) !== "cancelled");

    const dwellByStage = new Map<string, number[]>();
    for (const stage of EVENT_PIPELINE_STATUSES) {
      dwellByStage.set(stage, []);
    }

    let eventsWithTransitions = 0;
    for (const event of activeEvents) {
      const transitions = (
        await ctx.db
          .query("statusTransitions")
          .withIndex("by_entityType_and_entityId", (q) =>
            q.eq("entityType", "event").eq("entityId", event._id),
          )
          .take(50)
      ).sort((a, b) => a.at - b.at);
      if (transitions.length === 0) continue;
      eventsWithTransitions += 1;

      let enteredAt = event.createdAt;
      let currentStatus = normalizeEventStatus(transitions[0]?.fromStatus ?? event.status);
      for (const row of transitions) {
        const fromStatus = normalizeEventStatus(row.fromStatus ?? currentStatus);
        if (EVENT_PIPELINE_STATUSES.includes(fromStatus as (typeof EVENT_PIPELINE_STATUSES)[number])) {
          dwellByStage.get(fromStatus)?.push(msToDays(row.at - enteredAt));
        }
        currentStatus = normalizeEventStatus(row.toStatus);
        enteredAt = row.at;
      }
    }

    const stages = EVENT_PIPELINE_STATUSES.map((stage) => {
      const samples = dwellByStage.get(stage) ?? [];
      return {
        stage,
        sampleSize: samples.length,
        avgDays: average(samples),
        medianDays: median(samples),
      };
    });

    return {
      stages,
      eventsWithTransitions,
      truncated: eventsTruncated,
    };
  },
});

export const getQuoteEngagement = query({
  args: analyticsRangeArgs,
  returns: v.object({
    quotesOnPortal: v.number(),
    quotesOpened: v.number(),
    openRate: v.union(v.number(), v.null()),
    totalOpens: v.number(),
    avgOpensPerQuote: v.union(v.number(), v.null()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const rows = await ctx.db
      .query("invoices")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", args.startMs).lte("createdAt", args.endMs))
      .take(INVOICE_SCAN_LIMIT);

    let quotesOnPortal = 0;
    let quotesOpened = 0;
    let totalOpens = 0;
    for (const invoice of rows) {
      if (invoice.status === "void" || !invoice.clientReviewReadyAt) continue;
      quotesOnPortal += 1;
      const opens = invoice.publicQuoteOpenCount ?? 0;
      totalOpens += opens;
      if (opens > 0) quotesOpened += 1;
    }

    return {
      quotesOnPortal,
      quotesOpened,
      openRate: quotesOnPortal > 0 ? quotesOpened / quotesOnPortal : null,
      totalOpens,
      avgOpensPerQuote: quotesOnPortal > 0 ? totalOpens / quotesOnPortal : null,
      truncated: rows.length >= INVOICE_SCAN_LIMIT,
    };
  },
});

export const getDeliveryQuality = query({
  args: analyticsRangeArgs,
  returns: v.object({
    eventsWithExpected: v.number(),
    eventsWithActual: v.number(),
    eventsWithBoth: v.number(),
    avgVariance: v.union(v.number(), v.null()),
    medianVariance: v.union(v.number(), v.null()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const active = events.filter((event) => normalizeEventStatus(event.status) !== "cancelled");

    let eventsWithExpected = 0;
    let eventsWithActual = 0;
    let eventsWithBoth = 0;
    const variances: number[] = [];

    for (const event of active) {
      if (event.expectedTurnout != null && event.expectedTurnout > 0) {
        eventsWithExpected += 1;
      }
      if (event.actualTurnout != null && event.actualTurnout >= 0) {
        eventsWithActual += 1;
      }
      if (
        event.expectedTurnout != null &&
        event.expectedTurnout > 0 &&
        event.actualTurnout != null
      ) {
        eventsWithBoth += 1;
        variances.push(event.actualTurnout - event.expectedTurnout);
      }
    }

    return {
      eventsWithExpected,
      eventsWithActual,
      eventsWithBoth,
      avgVariance: average(variances),
      medianVariance: median(variances),
      truncated,
    };
  },
});
