import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireArborInternalContext } from "./lib/auth";
import {
  average,
  listPacificMonthKeys,
  median,
  msToDays,
  pacificMonthKey,
} from "./lib/analyticsTime";
import { classifyPaymentQueue } from "./lib/invoicePaymentStatus";
import { getActivePaymentProofSubmission } from "./lib/paymentProof";

/** Bounded scan caps — intentional; return `truncated` when hit. */
const INVOICE_SCAN_LIMIT = 2000;
const EVENT_SCAN_LIMIT = 1000;
const BAND_PAYMENT_SCAN_LIMIT = 1000;
/** Match paymentProof.listByQueue lookback so AR aligns with Payments queues. */
const AR_EVENT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const AR_EVENT_SCAN_LIMIT = 500;
const TOP_CLIENTS_DEFAULT = 10;

const rangeArgs = {
  startMs: v.number(),
  endMs: v.number(),
};

const monthBucketValidator = v.object({
  monthKey: v.string(),
  amountUsd: v.number(),
});

const sparklinePointValidator = v.object({
  monthKey: v.string(),
  revenueUsd: v.number(),
  expensesUsd: v.number(),
});

async function requireAnalyticsAccess(ctx: QueryCtx) {
  await requireAdmin(ctx);
  await requireArborInternalContext(ctx);
}

function assertValidRange(startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error("Invalid analytics date range.");
  }
}

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

async function loadEventsInRange(ctx: QueryCtx, startMs: number, endMs: number) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", startMs).lte("startAt", endMs))
    .take(EVENT_SCAN_LIMIT);
  return { events: rows, truncated: rows.length >= EVENT_SCAN_LIMIT };
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

    const revenueRecognizedUsd = paid.invoices.reduce((sum, inv) => sum + inv.totalUsd, 0);
    const revenueBookedUsd = approved.invoices.reduce((sum, inv) => sum + inv.totalUsd, 0);

    const eventCostsUsd = events.events.reduce((sum, event) => sum + eventCostUsd(event), 0);
    const bandPayoutsUsd = payouts.payments.reduce((sum, row) => sum + row.totalUsd, 0);
    const expensesUsd = eventCostsUsd + bandPayoutsUsd;

    const monthKeys = listPacificMonthKeys(args.startMs, args.endMs);
    const revenueByMonth = emptyMonthMap(monthKeys);
    const expensesByMonth = emptyMonthMap(monthKeys);

    for (const invoice of paid.invoices) {
      if (invoice.paymentReceivedAt == null) continue;
      const key = pacificMonthKey(invoice.paymentReceivedAt);
      if (!revenueByMonth.has(key)) continue;
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + invoice.totalUsd);
    }

    for (const event of events.events) {
      const key = pacificMonthKey(event.startAt);
      if (!expensesByMonth.has(key)) continue;
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + eventCostUsd(event));
    }
    for (const payment of payouts.payments) {
      if (payment.paidAt == null) continue;
      const key = pacificMonthKey(payment.paidAt);
      if (!expensesByMonth.has(key)) continue;
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + payment.totalUsd);
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
      byMonth.set(key, (byMonth.get(key) ?? 0) + invoice.totalUsd);
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
    let artistsUsd = 0;
    let feesUsd = 0;
    let externalRentalsUsd = 0;

    for (const invoice of invoices) {
      equipmentUsd += invoice.equipmentSubtotalUsd;
      crewUsd += invoice.crewSubtotalUsd;
      artistsUsd += invoice.artistsSubtotalUsd;
      feesUsd += invoice.feesSubtotalUsd;
      externalRentalsUsd += invoice.externalRentalsSubtotalUsd;
    }

    return {
      equipmentUsd,
      crewUsd,
      artistsUsd,
      feesUsd,
      externalRentalsUsd,
      truncated,
    };
  },
});

export const getArSnapshot = query({
  args: {},
  returns: v.object({
    paymentPending: v.object({ count: v.number(), totalUsd: v.number() }),
    proofNoReceipt: v.object({ count: v.number(), totalUsd: v.number() }),
    overdue: v.object({ count: v.number(), totalUsd: v.number() }),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAnalyticsAccess(ctx);
    const now = Date.now();
    const windowStart = now - AR_EVENT_LOOKBACK_MS;

    const candidates = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
      .take(AR_EVENT_SCAN_LIMIT);

    const buckets = {
      payment_pending: { count: 0, totalUsd: 0 },
      proof_no_receipt: { count: 0, totalUsd: 0 },
      overdue: { count: 0, totalUsd: 0 },
    };

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
      if (queue === "payment_pending") {
        buckets.payment_pending.count += 1;
        buckets.payment_pending.totalUsd += invoice.totalUsd;
      } else if (queue === "proof_no_receipt") {
        buckets.proof_no_receipt.count += 1;
        buckets.proof_no_receipt.totalUsd += invoice.totalUsd;
      } else if (queue === "overdue") {
        buckets.overdue.count += 1;
        buckets.overdue.totalUsd += invoice.totalUsd;
      }
    }

    return {
      paymentPending: buckets.payment_pending,
      proofNoReceipt: buckets.proof_no_receipt,
      overdue: buckets.overdue,
      truncated: candidates.length >= AR_EVENT_SCAN_LIMIT,
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
        existing.totalUsd += invoice.totalUsd;
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
        totalUsd: invoice.totalUsd,
        invoiceCount: 1,
      });
    }

    const clients = [...byKey.values()]
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, limit);

    return { clients, truncated };
  },
});
