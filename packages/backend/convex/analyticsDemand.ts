import { pacificDateKey, pacificEndOfDayMs, pacificStartOfDayMs, addPacificCalendarDays } from "@arbor/format";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
  INVOICE_SCAN_LIMIT,
  loadEventsInRange,
  REQUEST_SCAN_LIMIT,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import { dayLoadLevel, toPacificDateKey } from "./lib/bookingDayLoad";
import { normalizeEventStatus } from "./lib/eventStatus";
import { classifyPaymentQueue } from "./lib/invoicePaymentStatus";
import { getActivePaymentProofSubmission } from "./lib/paymentProof";

const REQUEST_STATUSES = ["submitted", "in_review", "converted", "declined"] as const;
type RequestStatus = (typeof REQUEST_STATUSES)[number];

const AR_EVENT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const AR_EVENT_SCAN_LIMIT = 500;

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

async function loadRequestsByStatusInRange(
  ctx: Parameters<typeof requireAnalyticsAccess>[0],
  status: RequestStatus,
  startMs: number,
  endMs: number,
) {
  const rows = await ctx.db
    .query("eventRequests")
    .withIndex("by_status_and_submittedAt", (q) =>
      q.eq("status", status).gte("submittedAt", startMs).lte("submittedAt", endMs),
    )
    .take(REQUEST_SCAN_LIMIT);
  return { rows, truncated: rows.length >= REQUEST_SCAN_LIMIT };
}

function pacificMonthBounds(nowMs: number = Date.now()) {
  const [year, month] = pacificDateKey(nowMs).split("-").map(Number);
  const startMs = pacificStartOfDayMs(year!, month!, 1);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const endMs = pacificEndOfDayMs(year!, month!, lastDay);
  return { startMs, endMs, monthKey: `${year}-${String(month).padStart(2, "0")}` };
}

async function openArTotalUsd(ctx: Parameters<typeof requireAnalyticsAccess>[0]) {
  const now = Date.now();
  const windowStart = now - AR_EVENT_LOOKBACK_MS;
  const candidates = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
    .take(AR_EVENT_SCAN_LIMIT);

  let totalUsd = 0;
  for (const event of candidates) {
    if (!event.invoiceId) continue;
    const invoice = await ctx.db.get(event.invoiceId);
    if (!invoice) continue;
    const activeSubmission = await getActivePaymentProofSubmission(ctx, event._id);
    const queue = classifyPaymentQueue({
      invoice,
      event,
      activeSubmission,
      nowMs: now,
    });
    if (queue === "payment_pending" || queue === "proof_no_receipt" || queue === "overdue") {
      totalUsd += invoice.totalUsd;
    }
  }
  return { totalUsd, truncated: candidates.length >= AR_EVENT_SCAN_LIMIT };
}

export const getBookingFunnel = query({
  args: analyticsRangeArgs,
  returns: v.object({
    submitted: v.number(),
    inReview: v.number(),
    converted: v.number(),
    declined: v.number(),
    total: v.number(),
    conversionRate: v.union(v.number(), v.null()),
    timeToConvertedDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    timeToDeclinedDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    timeToReviewDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const scans = await Promise.all(
      REQUEST_STATUSES.map((status) =>
        loadRequestsByStatusInRange(ctx, status, args.startMs, args.endMs),
      ),
    );

    const byStatus: Record<RequestStatus, Doc<"eventRequests">[]> = {
      submitted: scans[0]!.rows,
      in_review: scans[1]!.rows,
      converted: scans[2]!.rows,
      declined: scans[3]!.rows,
    };

    const submitted = byStatus.submitted.length;
    const inReview = byStatus.in_review.length;
    const converted = byStatus.converted.length;
    const declined = byStatus.declined.length;
    const total = submitted + inReview + converted + declined;
    const decided = converted + declined;
    const conversionRate = decided > 0 ? converted / decided : null;

    const toConverted: number[] = [];
    for (const row of byStatus.converted) {
      const milestoneAt = row.convertedAt ?? row.updatedAt;
      toConverted.push(msToDays(milestoneAt - row.submittedAt));
    }
    const toDeclined: number[] = [];
    for (const row of byStatus.declined) {
      const milestoneAt = row.declinedAt ?? row.updatedAt;
      toDeclined.push(msToDays(milestoneAt - row.submittedAt));
    }
    const toReview: number[] = [];
    for (const row of [...byStatus.in_review, ...byStatus.converted, ...byStatus.declined]) {
      if (!row.reviewedAt) continue;
      toReview.push(msToDays(row.reviewedAt - row.submittedAt));
    }

    return {
      submitted,
      inReview,
      converted,
      declined,
      total,
      conversionRate,
      timeToConvertedDays: {
        sampleSize: toConverted.length,
        avgDays: average(toConverted),
        medianDays: median(toConverted),
      },
      timeToDeclinedDays: {
        sampleSize: toDeclined.length,
        avgDays: average(toDeclined),
        medianDays: median(toDeclined),
      },
      timeToReviewDays: {
        sampleSize: toReview.length,
        avgDays: average(toReview),
        medianDays: median(toReview),
      },
      truncated: scans.some((scan) => scan.truncated),
    };
  },
});

export const getEventsVolume = query({
  args: analyticsRangeArgs,
  returns: v.object({
    byMonth: v.array(countBucketValidator),
    byEventType: v.array(countBucketValidator),
    byVenue: v.array(countBucketValidator),
    byHostType: v.array(countBucketValidator),
    total: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const active = events.filter((event) => normalizeEventStatus(event.status) !== "cancelled");

    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const byMonthMap = new Map<string, number>();
    for (const key of monthKeys) byMonthMap.set(key, 0);

    const byEventType = new Map<string, number>();
    const byVenue = new Map<string, number>();
    const byHostType = new Map<string, number>();
    const groupTypeCache = new Map<string, string>();

    for (const event of active) {
      const monthKey = pacificMonthKey(event.startAt);
      if (byMonthMap.has(monthKey)) {
        byMonthMap.set(monthKey, (byMonthMap.get(monthKey) ?? 0) + 1);
      }

      const eventType = event.eventType?.trim() || "Unknown";
      byEventType.set(eventType, (byEventType.get(eventType) ?? 0) + 1);

      const venue = event.venueName?.trim() || "Unknown venue";
      byVenue.set(venue, (byVenue.get(venue) ?? 0) + 1);

      let hostType = "unknown";
      if (event.hostGroupId) {
        const cached = groupTypeCache.get(event.hostGroupId);
        if (cached) {
          hostType = cached;
        } else {
          const group = await ctx.db.get(event.hostGroupId);
          hostType = group?.type ?? "unknown";
          groupTypeCache.set(event.hostGroupId, hostType);
        }
      }
      byHostType.set(hostType, (byHostType.get(hostType) ?? 0) + 1);
    }

    const toSortedBuckets = (map: Map<string, number>, limit?: number) => {
      const rows = [...map.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
      return limit ? rows.slice(0, limit) : rows;
    };

    return {
      byMonth: monthKeys.map((key) => ({ key, count: byMonthMap.get(key) ?? 0 })),
      byEventType: toSortedBuckets(byEventType),
      byVenue: toSortedBuckets(byVenue, 12),
      byHostType: toSortedBuckets(byHostType),
      total: active.length,
      truncated,
    };
  },
});

export const getCalendarLoad = query({
  args: analyticsRangeArgs,
  returns: v.object({
    freeDays: v.number(),
    busyDays: v.number(),
    unavailableDays: v.number(),
    totalDays: v.number(),
    daysWithEvents: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated } = await loadEventsInRange(ctx, args.startMs, args.endMs);
    const countsByDay = new Map<string, number>();

    for (const event of events) {
      if (normalizeEventStatus(event.status) === "cancelled") continue;
      const dayKey = toPacificDateKey(event.startAt);
      countsByDay.set(dayKey, (countsByDay.get(dayKey) ?? 0) + 1);
    }

    const startKey = pacificDateKey(args.startMs);
    const endKey = pacificDateKey(args.endMs);
    const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
    let cursorMs = pacificStartOfDayMs(startYear!, startMonth!, startDay!);
    let freeDays = 0;
    let busyDays = 0;
    let unavailableDays = 0;
    let totalDays = 0;

    for (let i = 0; i < 1100; i += 1) {
      const dayKey = pacificDateKey(cursorMs);
      if (dayKey > endKey) break;
      totalDays += 1;
      const count = countsByDay.get(dayKey) ?? 0;
      const level = dayLoadLevel(count);
      if (level === "free") freeDays += 1;
      else if (level === "busy") busyDays += 1;
      else unavailableDays += 1;
      cursorMs = addPacificCalendarDays(cursorMs, 1);
    }

    return {
      freeDays,
      busyDays,
      unavailableDays,
      totalDays,
      daysWithEvents: [...countsByDay.values()].filter((c) => c > 0).length,
      truncated,
    };
  },
});

export const getQuoteApprovalRates = query({
  args: analyticsRangeArgs,
  returns: v.object({
    pending: v.number(),
    approved: v.number(),
    changesRequested: v.number(),
    totalFinalized: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const rows = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) =>
        q.eq("status", "finalized").gte("createdAt", args.startMs).lte("createdAt", args.endMs),
      )
      .take(INVOICE_SCAN_LIMIT);

    let pending = 0;
    let approved = 0;
    let changesRequested = 0;

    for (const invoice of rows) {
      const status = invoice.clientApprovalStatus ?? "pending";
      if (status === "approved") approved += 1;
      else if (status === "changes_requested") changesRequested += 1;
      else pending += 1;
    }

    return {
      pending,
      approved,
      changesRequested,
      totalFinalized: rows.length,
      truncated: rows.length >= INVOICE_SCAN_LIMIT,
    };
  },
});

export const getThisMonthStrip = query({
  args: {},
  returns: v.object({
    monthKey: v.string(),
    eventsCount: v.number(),
    conversionRate: v.union(v.number(), v.null()),
    openArUsd: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAnalyticsAccess(ctx);
    const { startMs, endMs, monthKey } = pacificMonthBounds();

    const [eventsScan, convertedScan, declinedScan, ar] = await Promise.all([
      loadEventsInRange(ctx, startMs, endMs),
      loadRequestsByStatusInRange(ctx, "converted", startMs, endMs),
      loadRequestsByStatusInRange(ctx, "declined", startMs, endMs),
      openArTotalUsd(ctx),
    ]);

    const eventsCount = eventsScan.events.filter(
      (event) => normalizeEventStatus(event.status) !== "cancelled",
    ).length;
    const decided = convertedScan.rows.length + declinedScan.rows.length;
    const conversionRate = decided > 0 ? convertedScan.rows.length / decided : null;

    return {
      monthKey,
      eventsCount,
      conversionRate,
      openArUsd: ar.totalUsd,
      truncated:
        eventsScan.truncated ||
        convertedScan.truncated ||
        declinedScan.truncated ||
        ar.truncated,
    };
  },
});
