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
  INVOICE_SCAN_LIMIT,
  loadEventsInRange,
  requireAnalyticsAccess,
} from "./lib/analyticsQuery";
import { arborEarnedRevenueUsd, invoicePassThroughUsd } from "./lib/invoiceProfit";
import { collectPaymentRows } from "./paymentProof";

/** Bounded scan caps — intentional; return `truncated` when hit. */
const BAND_PAYMENT_SCAN_LIMIT = 1000;
const TOP_CLIENTS_DEFAULT = 10;

const rangeArgs = analyticsRangeArgs;

const monthBucketValidator = v.object({
  monthKey: v.string(),
  amountUsd: v.number(),
});

const sparklinePointValidator = v.object({
  monthKey: v.string(),
  revenueUsd: v.number(),
  expensesUsd: v.number(),
});

function eventCostUsd(event: Doc<"events">): number {
  return (
    (event.crewCostUsd ?? 0) +
    (event.bandsCostUsd ?? 0) +
    (event.externalRentalsCostUsd ?? 0) +
    (event.otherCostUsd ?? 0)
  );
}

async function loadPaidInvoicesInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_paymentReceivedAt", (q) =>
      q.gte("paymentReceivedAt", startMs).lte("paymentReceivedAt", endMs),
    )
    .take(INVOICE_SCAN_LIMIT);
  const truncated = rows.length >= INVOICE_SCAN_LIMIT;
  const invoices = rows.filter((invoice) => invoice.status !== "void");
  return { invoices, truncated };
}

async function loadApprovedInvoicesInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_approvedAt", (q) => q.gte("approvedAt", startMs).lte("approvedAt", endMs))
    .take(INVOICE_SCAN_LIMIT);
  const truncated = rows.length >= INVOICE_SCAN_LIMIT;
  const invoices = rows.filter(
    (invoice) =>
      invoice.status !== "void" &&
      invoice.status === "finalized" &&
      (invoice.clientApprovalStatus ?? "pending") === "approved",
  );
  return { invoices, truncated };
}

async function loadBandPayoutsInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_paidAt", (q) => q.gte("paidAt", startMs).lte("paidAt", endMs))
    .take(BAND_PAYMENT_SCAN_LIMIT);
  const truncated = rows.length >= BAND_PAYMENT_SCAN_LIMIT;
  const payments = rows.filter((row) => row.status === "paid");
  return { payments, truncated };
}

function emptyMonthMap(monthKeys: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const key of monthKeys) map.set(key, 0);
  return map;
}

export const getFinancialSummary = query({
  args: rangeArgs,
  returns: v.object({
    revenueRecognizedUsd: v.number(),
    revenueBookedUsd: v.number(),
    expensesUsd: v.number(),
    eventCostsUsd: v.number(),
    bandPayoutsUsd: v.number(),
    sparkline: v.array(sparklinePointValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const [paid, approved, events, payouts] = await Promise.all([
      loadPaidInvoicesInRange(ctx, args.startMs, args.endMs),
      loadApprovedInvoicesInRange(ctx, args.startMs, args.endMs),
      loadEventsInRange(ctx, args.startMs, args.endMs),
      loadBandPayoutsInRange(ctx, args.startMs, args.endMs),
    ]);

    const revenueRecognizedUsd = paid.invoices.reduce(
      (sum, inv) =>
        sum +
        arborEarnedRevenueUsd(
          inv.totalUsd,
          invoicePassThroughUsd(inv.artistsSubtotalUsd, inv.externalRentalsSubtotalUsd),
        ),
      0,
    );
    const revenueBookedUsd = approved.invoices.reduce(
      (sum, inv) =>
        sum +
        arborEarnedRevenueUsd(
          inv.totalUsd,
          invoicePassThroughUsd(inv.artistsSubtotalUsd, inv.externalRentalsSubtotalUsd),
        ),
      0,
    );

    // Event costs already include bandsCostUsd (synced from band payments). Do not
    // add paid payouts again — that double-counts band expenses.
    const eventCostsUsd = events.events.reduce((sum, event) => sum + eventCostUsd(event), 0);
    const bandPayoutsUsd = payouts.payments.reduce((sum, row) => sum + row.totalUsd, 0);
    const expensesUsd = eventCostsUsd;

    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const revenueByMonth = emptyMonthMap(monthKeys);
    const expensesByMonth = emptyMonthMap(monthKeys);

    for (const invoice of paid.invoices) {
      if (invoice.paymentReceivedAt == null) continue;
      const key = pacificMonthKey(invoice.paymentReceivedAt);
      if (!revenueByMonth.has(key)) continue;
      revenueByMonth.set(
        key,
        (revenueByMonth.get(key) ?? 0) +
          arborEarnedRevenueUsd(
            invoice.totalUsd,
            invoicePassThroughUsd(
              invoice.artistsSubtotalUsd,
              invoice.externalRentalsSubtotalUsd,
            ),
          ),
      );
    }

    for (const event of events.events) {
      const key = pacificMonthKey(event.startAt);
      if (!expensesByMonth.has(key)) continue;
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + eventCostUsd(event));
    }

    const sparkline = monthKeys.map((monthKey) => ({
      monthKey,
      revenueUsd: revenueByMonth.get(monthKey) ?? 0,
      expensesUsd: expensesByMonth.get(monthKey) ?? 0,
    }));

    return {
      revenueRecognizedUsd,
      revenueBookedUsd,
      expensesUsd,
      eventCostsUsd,
      bandPayoutsUsd,
      sparkline,
      truncated:
        paid.truncated || approved.truncated || events.truncated || payouts.truncated,
    };
  },
});

export const getRevenueByMonth = query({
  args: rangeArgs,
  returns: v.object({
    months: v.array(monthBucketValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { invoices, truncated } = await loadPaidInvoicesInRange(ctx, args.startMs, args.endMs);
    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const byMonth = emptyMonthMap(monthKeys);

    for (const invoice of invoices) {
      if (invoice.paymentReceivedAt == null) continue;
      const key = pacificMonthKey(invoice.paymentReceivedAt);
      if (!byMonth.has(key)) continue;
      byMonth.set(
        key,
        (byMonth.get(key) ?? 0) +
          arborEarnedRevenueUsd(
            invoice.totalUsd,
            invoicePassThroughUsd(
              invoice.artistsSubtotalUsd,
              invoice.externalRentalsSubtotalUsd,
            ),
          ),
      );
    }

    return {
      months: monthKeys.map((monthKey) => ({
        monthKey,
        amountUsd: byMonth.get(monthKey) ?? 0,
      })),
      truncated,
    };
  },
});

export const getRevenueMix = query({
  args: rangeArgs,
  returns: v.object({
    equipmentUsd: v.number(),
    crewUsd: v.number(),
    artistsUsd: v.number(),
    feesUsd: v.number(),
    externalRentalsUsd: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    const { invoices, truncated } = await loadPaidInvoicesInRange(ctx, args.startMs, args.endMs);

    let equipmentUsd = 0;
    let crewUsd = 0;
    let feesUsd = 0;

    for (const invoice of invoices) {
      equipmentUsd += invoice.equipmentSubtotalUsd;
      crewUsd += invoice.crewSubtotalUsd;
      feesUsd += invoice.feesSubtotalUsd;
    }

    return {
      equipmentUsd,
      crewUsd,
      // Artists / bands and external rentals are expenses, not earned revenue.
      artistsUsd: 0,
      feesUsd,
      externalRentalsUsd: 0,
      truncated,
    };
  },
});

const arBucketValidator = v.object({ count: v.number(), totalUsd: v.number() });
const AR_AGING_BUCKETS = ["not_due", "1_30", "31_60", "61_90", "90_plus"] as const;
const AR_OLDEST_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the due date; due later today is not yet past due. */
function daysPastDue(dueAt: number, now: number) {
  return Math.floor((now - dueAt) / DAY_MS);
}

function arAgingBucket(daysPastDue: number): (typeof AR_AGING_BUCKETS)[number] {
  if (daysPastDue <= 0) return "not_due";
  if (daysPastDue <= 30) return "1_30";
  if (daysPastDue <= 60) return "31_60";
  if (daysPastDue <= 90) return "61_90";
  return "90_plus";
}

/**
 * Open receivables right now, from the same rows as the Payments tab (each
 * invoice once, shared multi-day and series invoices included). Aging is days
 * past the payment due date.
 */
export const getArSnapshot = query({
  args: {},
  returns: v.object({
    openTotalUsd: v.number(),
    openCount: v.number(),
    paymentPending: arBucketValidator,
    proofNoReceipt: arBucketValidator,
    overdue: arBucketValidator,
    aging: v.array(
      v.object({
        bucket: v.union(...AR_AGING_BUCKETS.map((bucket) => v.literal(bucket))),
        count: v.number(),
        totalUsd: v.number(),
      }),
    ),
    oldest: v.array(
      v.object({
        invoiceId: v.id("invoices"),
        invoiceNumber: v.string(),
        title: v.string(),
        totalUsd: v.number(),
        dueAt: v.number(),
        daysPastDue: v.number(),
        proofSubmitted: v.boolean(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAnalyticsAccess(ctx);
    const now = Date.now();
    const rows = (await collectPaymentRows(ctx, now)).filter(
      (row) => row.queue !== "payment_received",
    );

    const queues = {
      payment_pending: { count: 0, totalUsd: 0 },
      proof_no_receipt: { count: 0, totalUsd: 0 },
      overdue: { count: 0, totalUsd: 0 },
    };
    const aging = new Map(AR_AGING_BUCKETS.map((bucket) => [bucket, { count: 0, totalUsd: 0 }]));
    for (const row of rows) {
      if (row.queue === "payment_received") continue;
      const queue = queues[row.queue];
      queue.count += 1;
      queue.totalUsd += row.totalUsd;
      const bucket = aging.get(arAgingBucket(daysPastDue(row.dueAt, now)))!;
      bucket.count += 1;
      bucket.totalUsd += row.totalUsd;
    }

    return {
      openTotalUsd: rows.reduce((sum, row) => sum + row.totalUsd, 0),
      openCount: rows.length,
      paymentPending: queues.payment_pending,
      proofNoReceipt: queues.proof_no_receipt,
      overdue: queues.overdue,
      aging: AR_AGING_BUCKETS.map((bucket) => ({ bucket, ...aging.get(bucket)! })),
      oldest: rows
        .filter((row) => daysPastDue(row.dueAt, now) > 0)
        .sort((a, b) => a.dueAt - b.dueAt)
        .slice(0, AR_OLDEST_LIMIT)
        .map((row) => ({
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
          title: row.eventTitle,
          totalUsd: row.totalUsd,
          dueAt: row.dueAt,
          daysPastDue: daysPastDue(row.dueAt, now),
          proofSubmitted: Boolean(row.submission),
        })),
      // The Payments rows scan a bounded event window; nothing to flag here.
      truncated: false,
    };
  },
});

export const getQuoteCashCycle = query({
  args: rangeArgs,
  returns: v.object({
    reviewToApprove: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    approveToPaid: v.object({
      sampleSize: v.number(),
      avgDays: v.union(v.number(), v.null()),
      medianDays: v.union(v.number(), v.null()),
    }),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);

    // Pull invoices whose approval or payment fell in range (union of two scans).
    const [approvedScan, paidScan] = await Promise.all([
      loadApprovedInvoicesInRange(ctx, args.startMs, args.endMs),
      loadPaidInvoicesInRange(ctx, args.startMs, args.endMs),
    ]);

    const byId = new Map<string, Doc<"invoices">>();
    for (const invoice of approvedScan.invoices) byId.set(invoice._id, invoice);
    for (const invoice of paidScan.invoices) byId.set(invoice._id, invoice);

    const reviewToApproveDays: number[] = [];
    const approveToPaidDays: number[] = [];

    for (const invoice of byId.values()) {
      const { clientReviewReadyAt, approvedAt, paymentReceivedAt } = invoice;
      if (
        clientReviewReadyAt != null &&
        approvedAt != null &&
        approvedAt >= args.startMs &&
        approvedAt <= args.endMs
      ) {
        reviewToApproveDays.push(msToDays(approvedAt - clientReviewReadyAt));
      }
      if (
        approvedAt != null &&
        paymentReceivedAt != null &&
        paymentReceivedAt >= args.startMs &&
        paymentReceivedAt <= args.endMs
      ) {
        approveToPaidDays.push(msToDays(paymentReceivedAt - approvedAt));
      }
    }

    return {
      reviewToApprove: {
        sampleSize: reviewToApproveDays.length,
        avgDays: average(reviewToApproveDays),
        medianDays: median(reviewToApproveDays),
      },
      approveToPaid: {
        sampleSize: approveToPaidDays.length,
        avgDays: average(approveToPaidDays),
        medianDays: median(approveToPaidDays),
      },
      truncated: approvedScan.truncated || paidScan.truncated,
    };
  },
});

export const getTopClients = query({
  args: {
    ...rangeArgs,
    limit: v.optional(v.number()),
  },
  returns: v.object({
    clients: v.array(
      v.object({
        groupId: v.union(v.id("invoiceGroups"), v.null()),
        name: v.string(),
        totalUsd: v.number(),
        invoiceCount: v.number(),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAnalyticsAccess(ctx);
    assertValidRange(args.startMs, args.endMs);
    const limit = Math.min(Math.max(args.limit ?? TOP_CLIENTS_DEFAULT, 1), 50);

    const { invoices, truncated } = await loadPaidInvoicesInRange(ctx, args.startMs, args.endMs);

    type Acc = {
      groupId: Doc<"invoiceGroups">["_id"] | null;
      name: string;
      totalUsd: number;
      invoiceCount: number;
    };
    const byKey = new Map<string, Acc>();

    for (const invoice of invoices) {
      const key = invoice.groupId ?? `name:${invoice.clientGroupName ?? "Unknown"}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.totalUsd += arborEarnedRevenueUsd(
          invoice.totalUsd,
          invoicePassThroughUsd(
            invoice.artistsSubtotalUsd,
            invoice.externalRentalsSubtotalUsd,
          ),
        );
        existing.invoiceCount += 1;
        continue;
      }
      let name = invoice.clientGroupName ?? "Unknown";
      const groupId = invoice.groupId ?? null;
      if (groupId) {
        const group = await ctx.db.get(groupId);
        if (group?.name) name = group.name;
      }
      byKey.set(key, {
        groupId,
        name,
        totalUsd: arborEarnedRevenueUsd(
          invoice.totalUsd,
          invoicePassThroughUsd(
            invoice.artistsSubtotalUsd,
            invoice.externalRentalsSubtotalUsd,
          ),
        ),
        invoiceCount: 1,
      });
    }

    const clients = [...byKey.values()]
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, limit);

    return { clients, truncated };
  },
});
