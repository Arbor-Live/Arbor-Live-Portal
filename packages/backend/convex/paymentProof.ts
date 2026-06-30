import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  classifyPaymentQueue,
  computeLateFeeSummary,
  getPaymentDueAt,
  isSubmissionActive,
  paymentMethodLabelForQueue,
} from "./lib/invoicePaymentStatus";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import {
  getActivePaymentProofSubmission,
  loadPaymentProofState,
  resolvePortalTokenForInvoice,
  submitPaymentProof,
} from "./lib/paymentProof";
import { schedulePaymentProofSubmittedEmails } from "./email/paymentProofEmails";

const paymentProofMethodArg = v.union(
  v.literal("assu_epay"),
  v.literal("ijournal"),
  v.literal("granted_transfer"),
);

const paymentQueueValue = v.union(
  v.literal("payment_received"),
  v.literal("proof_no_receipt"),
  v.literal("payment_pending"),
  v.literal("overdue"),
);

const paymentQueueRowValidator = v.object({
  invoiceId: v.id("invoices"),
  eventId: v.id("events"),
  invoiceNumber: v.string(),
  eventTitle: v.string(),
  clientContactName: v.optional(v.string()),
  clientEmail: v.optional(v.string()),
  totalUsd: v.number(),
  dueAt: v.number(),
  lateFeeUsd: v.number(),
  isOverdue: v.boolean(),
  weeksUntilLateFee: v.number(),
  paymentReceivedAt: v.optional(v.number()),
  hasReceipt: v.boolean(),
  submission: v.optional(
    v.object({
      id: v.id("eventPaymentProofSubmissions"),
      paymentMethod: paymentProofMethodArg,
      paymentMethodLabel: v.string(),
      paymentReference: v.string(),
      financeContactEmail: v.optional(v.string()),
      submittedAt: v.number(),
    }),
  ),
});

const REMINDER_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

async function resolveInvoiceAndEventByQuoteToken(ctx: MutationCtx, token: string) {
  const invoice = await ctx.db
    .query("invoices")
    .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", token))
    .unique();
  if (!invoice) throw new Error("Quote not found.");
  if (invoice.sourceEventRequestId) throw new Error("Quote not found.");
  if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
    throw new Error("Quote not found.");
  }
  if (invoice.status === "void") throw new Error("Quote not found.");

  const linkedEvents = await listEventsByInvoiceId(ctx, invoice._id);
  const linkedEvent = linkedEvents[0];
  if (!linkedEvent) throw new Error("This quote is not linked to an event yet.");

  return { invoice, linkedEvent };
}

async function resolveInvoiceAndEventByRequestToken(ctx: MutationCtx, token: string) {
  const request = await ctx.db
    .query("eventRequests")
    .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
    .unique();
  if (!request?.linkedInvoiceId) throw new Error("Quote not found.");

  const invoice = await ctx.db.get(request.linkedInvoiceId);
  if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
    throw new Error("Quote is not ready for review yet.");
  }

  const linkedEvents = await listEventsByInvoiceId(ctx, invoice._id);
  const linkedEvent = linkedEvents[0];
  if (!linkedEvent) throw new Error("This quote is not linked to an event yet.");

  return { invoice, linkedEvent };
}

async function buildPaymentQueueRow(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
  event: Doc<"events">,
  nowMs: number,
) {
  const activeSubmission = await getActivePaymentProofSubmission(ctx, event._id);
  const queue = classifyPaymentQueue({ invoice, event, activeSubmission, nowMs });
  if (!queue) return null;

  const dueAt = getPaymentDueAt(invoice, event);
  const late = computeLateFeeSummary(dueAt, nowMs);

  return {
    invoiceId: invoice._id,
    eventId: event._id,
    invoiceNumber: invoice.invoiceNumber,
    eventTitle: event.title,
    clientContactName: invoice.clientContactName,
    clientEmail: invoice.clientEmail,
    totalUsd: invoice.totalUsd,
    dueAt: late.dueAt,
    lateFeeUsd: late.lateFeeUsd,
    isOverdue: late.isOverdue,
    weeksUntilLateFee: late.weeksUntilLateFee,
    paymentReceivedAt: invoice.paymentReceivedAt,
    hasReceipt: Boolean(invoice.paymentReceiptStorageFileId),
    queue,
    submission: activeSubmission
      ? {
          id: activeSubmission._id,
          paymentMethod: activeSubmission.paymentMethod,
          paymentMethodLabel: paymentMethodLabelForQueue(activeSubmission.paymentMethod),
          paymentReference: activeSubmission.paymentReference,
          financeContactEmail: activeSubmission.financeContactEmail,
          submittedAt: activeSubmission.submittedAt,
        }
      : undefined,
  };
}

export const listByQueue = query({
  args: { queue: paymentQueueValue },
  returns: v.array(paymentQueueRowValidator),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const now = Date.now();
    const windowStart = now - REMINDER_LOOKBACK_MS;

    const candidates = await ctx.db
      .query("events")
      .withIndex("by_startAt", (q) => q.gte("startAt", windowStart).lte("startAt", now))
      .take(500);

    const rows = [];
    for (const event of candidates) {
      if (!event.invoiceId) continue;
      const invoice = await ctx.db.get(event.invoiceId);
      if (!invoice) continue;

      const row = await buildPaymentQueueRow(ctx, invoice, event, now);
      if (!row) continue;

      if (args.queue === "overdue") {
        if (!row.isOverdue || row.paymentReceivedAt) continue;
      } else if (args.queue === "payment_received") {
        if (!row.paymentReceivedAt) continue;
      } else if (args.queue === "proof_no_receipt") {
        if (!row.submission || row.paymentReceivedAt) continue;
      } else if (args.queue === "payment_pending") {
        if (row.submission || row.paymentReceivedAt || row.isOverdue) continue;
      }

      const { queue: _queue, ...publicRow } = row;
      rows.push(publicRow);
    }

    rows.sort((a, b) => b.dueAt - a.dueAt);
    return rows;
  },
});

export const getByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(paymentQueueRowValidator, v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const events = await listEventsByInvoiceId(ctx, args.invoiceId);
    const event = events[0];
    if (!event) return null;
    const row = await buildPaymentQueueRow(ctx, invoice, event, Date.now());
    if (!row) return null;
    const { queue: _queue, ...publicRow } = row;
    return publicRow;
  },
});

export const submitByQuoteToken = mutation({
  args: {
    token: v.string(),
    paymentMethod: paymentProofMethodArg,
    paymentReference: v.string(),
    financeContactEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const { invoice, linkedEvent } = await resolveInvoiceAndEventByQuoteToken(ctx, args.token);
    const result = await submitPaymentProof(ctx, invoice, linkedEvent, {
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
      financeContactEmail: args.financeContactEmail,
    });

    await schedulePaymentProofSubmittedEmails(ctx, {
      invoice,
      event: linkedEvent,
      paymentMethod: args.paymentMethod,
      paymentReference: result.paymentReference,
      financeContactEmail: result.financeContactEmail,
      publicQuoteToken: args.token,
      portal: "quote",
    });

    return { ok: true as const };
  },
});

export const submitByRequestToken = mutation({
  args: {
    token: v.string(),
    paymentMethod: paymentProofMethodArg,
    paymentReference: v.string(),
    financeContactEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const { invoice, linkedEvent } = await resolveInvoiceAndEventByRequestToken(ctx, args.token);
    const result = await submitPaymentProof(ctx, invoice, linkedEvent, {
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
      financeContactEmail: args.financeContactEmail,
    });

    await schedulePaymentProofSubmittedEmails(ctx, {
      invoice,
      event: linkedEvent,
      paymentMethod: args.paymentMethod,
      paymentReference: result.paymentReference,
      financeContactEmail: result.financeContactEmail,
      publicQuoteToken: args.token,
      portal: "request",
    });

    return { ok: true as const };
  },
});

export const markPaymentReceived = mutation({
  args: { invoiceId: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");

    const now = Date.now();
    await ctx.db.patch(args.invoiceId, {
      paymentReceivedAt: now,
      paymentReceivedByUserId: getUserId(user),
      updatedAt: now,
    });
    return null;
  },
});

export const attachReceipt = mutation({
  args: {
    invoiceId: v.id("invoices"),
    storageFileId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");

    await ctx.db.patch(args.invoiceId, {
      paymentReceiptStorageFileId: args.storageFileId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const generateReceiptUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireArborInternalContext(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const invalidateSubmission = mutation({
  args: {
    submissionId: v.id("eventPaymentProofSubmissions"),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found.");
    if (!isSubmissionActive(submission)) {
      throw new Error("Only active submissions can be invalidated.");
    }

    const note = args.note.trim();
    if (!note) throw new Error("Please include a note explaining why the proof was invalidated.");

    const now = Date.now();
    await ctx.db.patch(args.submissionId, {
      status: "invalidated",
      invalidatedAt: now,
      invalidatedByUserId: getUserId(user),
      invalidationNote: note,
    });
    return null;
  },
});
