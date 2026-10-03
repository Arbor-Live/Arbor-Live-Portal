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
import { collectPaymentRows } from "./paymentProof";

const REQUEST_STATUSES = [
  "submitted",
  "action_required",
  "pending_client",
  "converted",
  "declined",
] as const;
type RequestStatus = (typeof REQUEST_STATUSES)[number];


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
  const rows = await collectPaymentRows(ctx, Date.now());
  const totalUsd = rows
    .filter((row) => row.queue !== "payment_received")
    .reduce((sum, row) => sum + row.totalUsd, 0);
  return { totalUsd, truncated: false };
}

export const getBookingFunnel = query({
  args: analyticsRangeArgs,
  returns: v.object({
    submitted: v.number(),
    actionRequired: v.number(),
    pendingClient: v.number(),
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
    /** Days from request to the event date: how far ahead clients book. */
    bookingLeadDays: v.object({
      sampleSize: v.number(),
      medianDays: v.union(v.number(), v.null()),
      under30Share: v.union(v.number(), v.null()),
    }),
    byCategory: v.array(
      v.object({
        key: v.string(),
        total: v.number(),
        converted: v.number(),
        declined: v.number(),
        conversionRate: v.union(v.number(), v.null()),
      }),
    ),
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
    // Legacy rows may still say in_review until the migration finishes.
    const legacyInRange = await ctx.db
      .query("eventRequests")
      .withIndex("by_status_and_submittedAt", (q) =>
        q.eq("status", "in_review").gte("submittedAt", args.startMs).lte("submittedAt", args.endMs),
      )
      .take(REQUEST_SCAN_LIMIT);

    const byStatus: Record<RequestStatus, Doc<"eventRequests">[]> = {
      submitted: scans[0]!.rows,
      action_required: [...scans[1]!.rows, ...legacyInRange],
      pending_client: scans[2]!.rows,
      converted: scans[3]!.rows,
      declined: scans[4]!.rows,
    };

    const submitted = byStatus.submitted.length;
    const actionRequired = byStatus.action_required.length;
    const pendingClient = byStatus.pending_client.length;
    const converted = byStatus.converted.length;
    const declined = byStatus.declined.length;
    const total = submitted + actionRequired + pendingClient + converted + declined;
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
    for (const row of [
      ...byStatus.action_required,
      ...byStatus.pending_client,
      ...byStatus.converted,
      ...byStatus.declined,
    ]) {
      if (!row.reviewedAt) continue;
      toReview.push(msToDays(row.reviewedAt - row.submittedAt));
    }

    const allRows = Object.values(byStatus).flat();
    const leadDays = allRows
      .filter((row) => row.eventStartAtMs != null && row.eventStartAtMs >= row.submittedAt)
      .map((row) => msToDays(row.eventStartAtMs! - row.submittedAt));
    const categories = new Map<string, { total: number; converted: number; declined: number }>();
    for (const [status, rows] of Object.entries(byStatus) as Array<[RequestStatus, Doc<"eventRequests">[]]>) {
      for (const row of rows) {
        const key = row.eventCategory?.trim() || "Other";
        const bucket = categories.get(key) ?? { total: 0, converted: 0, declined: 0 };
        bucket.total += 1;
        if (status === "converted") bucket.converted += 1;
        if (status === "declined") bucket.declined += 1;
        categories.set(key, bucket);
      }
    }

    return {
      submitted,
      actionRequired,
      pendingClient,
      converted,
      declined,
      total,
      conversionRate,
      bookingLeadDays: {
        sampleSize: leadDays.length,
        medianDays: median(leadDays),
        under30Share:
          leadDays.length > 0 ? leadDays.filter((days) => days < 30).length / leadDays.length : null,
      },
      byCategory: [...categories.entries()]
        .map(([key, bucket]) => ({
          key,
          ...bucket,
          conversionRate:
            bucket.converted + bucket.declined > 0
              ? bucket.converted / (bucket.converted + bucket.declined)
              : null,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
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
      truncated: scans.some((scan) => scan.truncated) || legacyInRange.length >= REQUEST_SCAN_LIMIT,
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
