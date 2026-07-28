import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
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
  EVENT_SCAN_LIMIT,
  loadEventsInRange,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";

const BAND_PAYMENT_SCAN_LIMIT = 1000;
const DAMAGE_SCAN_LIMIT = 500;
const FULFILLMENT_PER_EVENT_LIMIT = 10;
const UNITS_PER_FULFILLMENT_LIMIT = 200;

const PENDING_BAND_STATUSES = [
  "pending_payee",
  "pending_email",
  "awaiting_confirmation",
  "confirmed",
] as const;

type PendingBandStatus = (typeof PENDING_BAND_STATUSES)[number];

const monthBucketValidator = v.object({
  monthKey: v.string(),
  amountUsd: v.number(),
});

const countBucketValidator = v.object({
  key: v.string(),
  count: v.number(),
});

async function loadPaidBandPaymentsInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_paidAt", (q) => q.gte("paidAt", startMs).lte("paidAt", endMs))
    .take(BAND_PAYMENT_SCAN_LIMIT);
  const payments = rows.filter((row) => row.status === "paid");
  return { payments, truncated: rows.length >= BAND_PAYMENT_SCAN_LIMIT };
}

function queueAgeAnchorMs(payment: Doc<"eventBandPayments">): number {
  if (payment.status === "confirmed") {
    return payment.confirmedAt ?? payment.confirmationEmailSentAt ?? payment.createdAt;
  }
  if (payment.status === "awaiting_confirmation") {
    return payment.confirmationEmailSentAt ?? payment.createdAt;
  }
  return payment.createdAt;
}

export const getBandPayoutSpend = query({
  args: analyticsRangeArgs,
  returns: v.object({
    totalUsd: v.number(),
    paymentCount: v.number(),
    byMonth: v.array(monthBucketValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { payments, truncated } = await loadPaidBandPaymentsInRange(
      ctx,
      args.startMs,
      args.endMs,
    );
    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const byMonth = new Map(monthKeys.map((key) => [key, 0]));

    let totalUsd = 0;
    for (const payment of payments) {
      totalUsd += payment.totalUsd;
      if (payment.paidAt == null) continue;
      const key = pacificMonthKey(payment.paidAt);
      if (!byMonth.has(key)) continue;
      byMonth.set(key, (byMonth.get(key) ?? 0) + payment.totalUsd);
    }

    return {
      totalUsd,
      paymentCount: payments.length,
      byMonth: monthKeys.map((monthKey) => ({
        monthKey,
        amountUsd: byMonth.get(monthKey) ?? 0,
      })),
      truncated,
    };
  },
});

export const getBandPayoutQueueAging = query({
  args: {},
  returns: v.object({
    queues: v.array(
      v.object({
        status: v.string(),
        count: v.number(),
        totalUsd: v.number(),
        avgAgeDays: v.union(v.number(), v.null()),
        medianAgeDays: v.union(v.number(), v.null()),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAnalyticsAccess(ctx);
    const now = Date.now();
    let truncated = false;
    const queues = [];

    for (const status of PENDING_BAND_STATUSES) {
      const rows = await ctx.db
        .query("eventBandPayments")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(BAND_PAYMENT_SCAN_LIMIT);
      if (rows.length >= BAND_PAYMENT_SCAN_LIMIT) truncated = true;

      const ages: number[] = [];
      let totalUsd = 0;
      for (const payment of rows) {
        totalUsd += payment.totalUsd;
        ages.push(msToDays(now - queueAgeAnchorMs(payment)));
      }

      queues.push({
        status: status as PendingBandStatus,
        count: rows.length,
        totalUsd,
        avgAgeDays: average(ages),
        medianAgeDays: median(ages),
      });
    }

    return { queues, truncated };
  },
});

export const getBandPayoutTurnaround = query({
  args: analyticsRangeArgs,
  returns: v.object({
    emailToConfirmed: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    confirmedToPaid: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { payments, truncated } = await loadPaidBandPaymentsInRange(
      ctx,
      args.startMs,
      args.endMs,
    );

    const emailToConfirmed: number[] = [];
    const confirmedToPaid: number[] = [];

    for (const payment of payments) {
      const { confirmationEmailSentAt, confirmedAt, paidAt } = payment;
      if (
        confirmationEmailSentAt != null &&
        confirmedAt != null &&
        confirmedAt >= confirmationEmailSentAt
      ) {
        emailToConfirmed.push(msToDays(confirmedAt - confirmationEmailSentAt));
      }
      if (confirmedAt != null && paidAt != null && paidAt >= confirmedAt) {
        confirmedToPaid.push(msToDays(paidAt - confirmedAt));
      }
    }

    return {
      emailToConfirmed: {
        sampleSize: emailToConfirmed.length,
        avgDays: average(emailToConfirmed),
        medianDays: median(emailToConfirmed),
      },
      confirmedToPaid: {
        sampleSize: confirmedToPaid.length,
        avgDays: average(confirmedToPaid),
        medianDays: median(confirmedToPaid),
      },
      truncated,
    };
  },
});

export const getDamageInsights = query({
  args: analyticsRangeArgs,
  returns: v.object({
    openCount: v.number(),
    inProgressCount: v.number(),
    resolvedInRange: v.number(),
    reportedInRange: v.number(),
    severityMix: v.array(countBucketValidator),
    openAgingDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    resolutionDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);
    const now = Date.now();

    const [openRows, inProgressRows, resolvedRows] = await Promise.all([
      ctx.db
        .query("damageReports")
        .withIndex("by_status_and_reportedAt", (q) => q.eq("status", "open"))
        .take(DAMAGE_SCAN_LIMIT),
      ctx.db
        .query("damageReports")
        .withIndex("by_status_and_reportedAt", (q) => q.eq("status", "in_progress"))
        .take(DAMAGE_SCAN_LIMIT),
      ctx.db
        .query("damageReports")
        .withIndex("by_status_and_reportedAt", (q) =>
          q.eq("status", "resolved").gte("reportedAt", args.startMs).lte("reportedAt", args.endMs),
        )
        .take(DAMAGE_SCAN_LIMIT),
    ]);

    // Also count reports opened in range (any status) via open+in_progress filter + resolved scan.
    const reportedInRangeRows = [
      ...openRows.filter((row) => row.reportedAt >= args.startMs && row.reportedAt <= args.endMs),
      ...inProgressRows.filter(
        (row) => row.reportedAt >= args.startMs && row.reportedAt <= args.endMs,
      ),
      ...resolvedRows,
    ];

    const severityMix = new Map<string, number>();
    for (const row of reportedInRangeRows) {
      const key = String(row.severity);
      severityMix.set(key, (severityMix.get(key) ?? 0) + 1);
    }

    const openAging: number[] = [];
    for (const row of [...openRows, ...inProgressRows]) {
      openAging.push(msToDays(now - row.reportedAt));
    }

    const resolution: number[] = [];
    for (const row of resolvedRows) {
      if (row.resolvedAt == null || row.resolvedAt < row.reportedAt) continue;
      resolution.push(msToDays(row.resolvedAt - row.reportedAt));
    }

    return {
      openCount: openRows.length,
      inProgressCount: inProgressRows.length,
      resolvedInRange: resolvedRows.length,
      reportedInRange: reportedInRangeRows.length,
      severityMix: [...severityMix.entries()]
        .map(([key, count]) => ({ key: `Sev ${key}`, count }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      openAgingDays: {
        sampleSize: openAging.length,
        avgDays: average(openAging),
        medianDays: median(openAging),
      },
      resolutionDays: {
        sampleSize: resolution.length,
        avgDays: average(resolution),
        medianDays: median(resolution),
      },
      truncated:
        openRows.length >= DAMAGE_SCAN_LIMIT ||
        inProgressRows.length >= DAMAGE_SCAN_LIMIT ||
        resolvedRows.length >= DAMAGE_SCAN_LIMIT,
    };
  },
});

export const getRentalFulfillmentInsights = query({
  args: analyticsRangeArgs,
  returns: v.object({
    completedCount: v.number(),
    inProgressCount: v.number(),
    durationDays: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    returnUnits: v.number(),
    missingUnits: v.number(),
    damagedUnits: v.number(),
    missingRate: v.union(v.number(), v.null()),
    damagedRate: v.union(v.number(), v.null()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { events, truncated: eventsTruncated } = await loadEventsInRange(
      ctx,
      args.startMs,
      args.endMs,
    );

    let completedCount = 0;
    let inProgressCount = 0;
    const durations: number[] = [];
    let returnUnits = 0;
    let missingUnits = 0;
    let damagedUnits = 0;
    let truncated = eventsTruncated || events.length >= EVENT_SCAN_LIMIT;

    for (const event of events) {
      const fulfillments = await ctx.db
        .query("eventRentalFulfillments")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(FULFILLMENT_PER_EVENT_LIMIT);
      if (fulfillments.length >= FULFILLMENT_PER_EVENT_LIMIT) truncated = true;

      for (const fulfillment of fulfillments) {
        if (fulfillment.status === "completed") {
          completedCount += 1;
          if (
            fulfillment.completedAt != null &&
            fulfillment.completedAt >= fulfillment.startedAt
          ) {
            durations.push(msToDays(fulfillment.completedAt - fulfillment.startedAt));
          }
        } else if (fulfillment.status === "in_progress") {
          inProgressCount += 1;
        }

        if (fulfillment.direction !== "return") continue;

        const units = await ctx.db
          .query("eventRentalUnits")
          .withIndex("by_fulfillmentId", (q) => q.eq("fulfillmentId", fulfillment._id))
          .take(UNITS_PER_FULFILLMENT_LIMIT);
        if (units.length >= UNITS_PER_FULFILLMENT_LIMIT) truncated = true;

        for (const unit of units) {
          returnUnits += 1;
          if (unit.returnStatus === "missing") missingUnits += 1;
          if (unit.returnStatus === "damaged") damagedUnits += 1;
        }
      }
    }

    return {
      completedCount,
      inProgressCount,
      durationDays: {
        sampleSize: durations.length,
        avgDays: average(durations),
        medianDays: median(durations),
      },
      returnUnits,
      missingUnits,
      damagedUnits,
      missingRate: returnUnits > 0 ? missingUnits / returnUnits : null,
      damagedRate: returnUnits > 0 ? damagedUnits / returnUnits : null,
      truncated,
    };
  },
});
