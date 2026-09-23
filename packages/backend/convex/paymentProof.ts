import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  computeLateFeeSummary,
  getPaymentDueAt,
  isSubmissionActive,
  paymentMethodLabelForQueue,
} from "./lib/invoicePaymentStatus";
import { listAdditionalInvoiceIds } from "./lib/eventInvoiceLinks";
import { listApprovedInvoicesWithoutEvent, listEventsLinkedToInvoice } from "./lib/invoiceEvents";
import { isRequestPublicTokenExpired } from "./lib/requestToken";
import {
  getActivePaymentProofSubmissionForInvoice,
  resolvePortalTokenForInvoice,
  submitPaymentProof,
} from "./lib/paymentProof";
import {
  schedulePaymentProofRejectedEmails,
  schedulePaymentProofSubmittedEmails,
} from "./email/paymentProofEmails";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";

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
  eventId: v.optional(v.id("events")),
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

const invoicePaymentDetailsValidator = v.object({
  invoiceId: v.id("invoices"),
  eventId: v.optional(v.id("events")),
  eventTitle: v.optional(v.string()),
  eventLinked: v.boolean(),
  eligible: v.boolean(),
  status: v.union(
    v.literal("not_applicable"),
    v.literal("payment_received"),
    v.literal("proof_submitted"),
    v.literal("payment_pending"),
    v.literal("overdue"),
  ),
  totalUsd: v.number(),
  dueAt: v.optional(v.number()),
  lateFeeUsd: v.number(),
  isOverdue: v.boolean(),
  paymentReceivedAt: v.optional(v.number()),
  hasReceipt: v.boolean(),
  canRecordProof: v.boolean(),
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
  invalidatedSubmissions: v.array(
    v.object({
      id: v.id("eventPaymentProofSubmissions"),
      paymentMethodLabel: v.string(),
      paymentReference: v.string(),
      submittedAt: v.number(),
      invalidatedAt: v.optional(v.number()),
      invalidationNote: v.optional(v.string()),
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

  const linkedEvents = await listEventsLinkedToInvoice(ctx, invoice._id);
  return { invoice, linkedEvent: linkedEvents[0] ?? null };
}

async function resolveInvoiceAndEventByRequestToken(ctx: MutationCtx, token: string) {
  const request = await ctx.db
    .query("eventRequests")
    .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
    .unique();
  if (!request?.linkedInvoiceId) throw new Error("Quote not found.");
  if (isRequestPublicTokenExpired(request)) throw new Error("This request link has expired.");

  const invoice = await ctx.db.get(request.linkedInvoiceId);
  if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
    throw new Error("Quote is not ready for review yet.");
  }

  const linkedEvents = await listEventsLinkedToInvoice(ctx, invoice._id);
  return { invoice, linkedEvent: linkedEvents[0] ?? null };
}

function includeInPaymentQueue(
  queue: "payment_received" | "proof_no_receipt" | "payment_pending" | "overdue",
  row: {
    isOverdue: boolean;
    paymentReceivedAt?: number;
    submission?: unknown;
  },
) {
  if (queue === "overdue") return row.isOverdue && !row.paymentReceivedAt;
  if (queue === "payment_received") return Boolean(row.paymentReceivedAt);
  if (queue === "proof_no_receipt") return Boolean(row.submission) && !row.paymentReceivedAt;
  return !row.submission && !row.paymentReceivedAt && !row.isOverdue;
}

async function buildPaymentQueueRow(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
  event: Doc<"events"> | null,
  nowMs: number,
) {
  const details = await buildInvoicePaymentDetails(ctx, invoice, event, nowMs);
  if (!details.eligible) return null;

  return {
    invoiceId: invoice._id,
    ...(details.eventId ? { eventId: details.eventId } : {}),
    invoiceNumber: invoice.invoiceNumber,
    eventTitle: details.eventTitle ?? (invoice.clientGroupName?.trim() || invoice.invoiceNumber),
    clientContactName: invoice.clientContactName,
    clientEmail: invoice.clientEmail,
    totalUsd: details.totalUsd,
    dueAt: details.dueAt ?? nowMs,
    lateFeeUsd: details.lateFeeUsd,
    isOverdue: details.isOverdue,
    weeksUntilLateFee: details.dueAt
      ? computeLateFeeSummary(details.dueAt, nowMs).weeksUntilLateFee
      : 0,
    paymentReceivedAt: details.paymentReceivedAt,
    hasReceipt: details.hasReceipt,
    queue:
      details.status === "payment_received"
        ? ("payment_received" as const)
        : details.status === "proof_submitted"
          ? details.isOverdue
            ? ("overdue" as const)
            : ("proof_no_receipt" as const)
          : details.status === "overdue"
            ? ("overdue" as const)
            : ("payment_pending" as const),
    submission: details.submission,
  };
}

async function buildInvoicePaymentDetails(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
  event: Doc<"events"> | null,
  nowMs: number,
) {
  const approved = (invoice.clientApprovalStatus ?? "pending") === "approved";
  const submissions = await ctx.db
    .query("eventPaymentProofSubmissions")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
    .take(20);
  const invalidatedSubmissions = submissions
    .filter((row) => row.status === "invalidated")
    .sort((a, b) => (b.invalidatedAt ?? b.submittedAt) - (a.invalidatedAt ?? a.submittedAt))
    .slice(0, 5)
    .map((row) => ({
      id: row._id,
      paymentMethodLabel: paymentMethodLabelForQueue(row.paymentMethod),
      paymentReference: row.paymentReference,
      submittedAt: row.submittedAt,
      invalidatedAt: row.invalidatedAt,
      invalidationNote: row.invalidationNote,
    }));

  if (!approved) {
    return {
      invoiceId: invoice._id,
      eventLinked: Boolean(event),
      eventId: event?._id,
      eventTitle: event?.title,
      eligible: false,
      status: "not_applicable" as const,
      totalUsd: invoice.totalUsd,
      dueAt: undefined,
      lateFeeUsd: 0,
      isOverdue: false,
      paymentReceivedAt: invoice.paymentReceivedAt,
      hasReceipt: Boolean(invoice.paymentReceiptStorageFileId),
      canRecordProof: false,
      submission: undefined,
      invalidatedSubmissions,
    };
  }

  const activeSubmission = await getActivePaymentProofSubmissionForInvoice(ctx, invoice._id);
  const dueAt = getPaymentDueAt(invoice, event);
  const late = dueAt ? computeLateFeeSummary(dueAt, nowMs) : { lateFeeUsd: 0, isOverdue: false };

  let status: "payment_received" | "proof_submitted" | "payment_pending" | "overdue";
  if (invoice.paymentReceivedAt) {
    status = "payment_received";
  } else if (activeSubmission) {
    status = late.isOverdue ? "overdue" : "proof_submitted";
  } else {
    status = late.isOverdue ? "overdue" : "payment_pending";
  }

  return {
    invoiceId: invoice._id,
    eventLinked: Boolean(event),
    eventId: event?._id,
    eventTitle: event?.title,
    eligible: true,
    status,
    totalUsd: invoice.totalUsd,
    dueAt,
    lateFeeUsd: late.lateFeeUsd,
    isOverdue: late.isOverdue,
    paymentReceivedAt: invoice.paymentReceivedAt,
    hasReceipt: Boolean(invoice.paymentReceiptStorageFileId),
    canRecordProof: !invoice.paymentReceivedAt && !activeSubmission,
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
    invalidatedSubmissions,
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
      .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
      .take(500);

    const rows = [];
    const consideredInvoiceIds = new Set<Doc<"invoices">["_id"]>();
    for (const event of candidates) {
      const invoiceIds: Doc<"invoices">["_id"][] = [];
      if (event.invoiceId) invoiceIds.push(event.invoiceId);
      for (const invoiceId of await listAdditionalInvoiceIds(ctx, event._id)) {
        if (!invoiceIds.includes(invoiceId)) invoiceIds.push(invoiceId);
      }
      for (const invoiceId of invoiceIds) {
        if (consideredInvoiceIds.has(invoiceId)) continue;
        consideredInvoiceIds.add(invoiceId);
        const invoice = await ctx.db.get(invoiceId);
        if (!invoice) continue;

        const row = await buildPaymentQueueRow(ctx, invoice, event, now);
        if (!row || !includeInPaymentQueue(args.queue, row)) continue;

        const { queue: _queue, ...publicRow } = row;
        rows.push(publicRow);
      }
    }

    const unlinked = await listApprovedInvoicesWithoutEvent(ctx, windowStart, consideredInvoiceIds);
    for (const invoice of unlinked) {
      const row = await buildPaymentQueueRow(ctx, invoice, null, now);
      if (!row || !includeInPaymentQueue(args.queue, row)) continue;

      const { queue: _queue, ...publicRow } = row;
      rows.push(publicRow);
    }

    rows.sort((a, b) => b.dueAt - a.dueAt);
    return rows;
  },
});

export const getByInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(invoicePaymentDetailsValidator, v.null()),
  handler: async (ctx, args) => {
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const events = await listEventsLinkedToInvoice(ctx, args.invoiceId);
    const event = events[0] ?? null;
    return await buildInvoicePaymentDetails(ctx, invoice, event, Date.now());
  },
});

export const submitByQuoteToken = mutation({
  args: {
    token: v.string(),
    paymentMethod: paymentProofMethodArg,
    paymentReference: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `paymentProofQuoteToken:${args.token}`, {
      limit: 10,
      windowMs: HOUR_MS,
    });
    await enforceRateLimit(ctx, "paymentProofSubmit:global", { limit: 120, windowMs: HOUR_MS });
    const { invoice, linkedEvent } = await resolveInvoiceAndEventByQuoteToken(ctx, args.token);
    const result = await submitPaymentProof(ctx, invoice, linkedEvent, {
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
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
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `paymentProofRequestToken:${args.token}`, {
      limit: 10,
      windowMs: HOUR_MS,
    });
    await enforceRateLimit(ctx, "paymentProofSubmit:global", { limit: 120, windowMs: HOUR_MS });
    const { invoice, linkedEvent } = await resolveInvoiceAndEventByRequestToken(ctx, args.token);
    const result = await submitPaymentProof(ctx, invoice, linkedEvent, {
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
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

export const submitByInvoiceId = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethod: paymentProofMethodArg,
    paymentReference: v.string(),
    sendNotificationEmails: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");

    const linkedEvents = await listEventsLinkedToInvoice(ctx, args.invoiceId);
    const linkedEvent = linkedEvents[0] ?? null;

    const result = await submitPaymentProof(ctx, invoice, linkedEvent, {
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
    });

    if (args.sendNotificationEmails !== false) {
      const portalInfo = await resolvePortalTokenForInvoice(ctx, invoice);
      if (portalInfo) {
        await schedulePaymentProofSubmittedEmails(ctx, {
          invoice,
          event: linkedEvent,
          paymentMethod: args.paymentMethod,
          paymentReference: result.paymentReference,
          financeContactEmail: result.financeContactEmail,
          publicQuoteToken: portalInfo.token,
          portal: portalInfo.portal,
        });
      }
    }

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

    const invoice = await ctx.db.get(submission.invoiceId);
    const event = submission.eventId ? await ctx.db.get(submission.eventId) : null;
    if (invoice) {
      const portalInfo = await resolvePortalTokenForInvoice(ctx, invoice);
      if (portalInfo) {
        await schedulePaymentProofRejectedEmails(ctx, {
          invoice,
          event,
          note,
          invalidatedAt: now,
          publicQuoteToken: portalInfo.token,
          portal: portalInfo.portal,
        });
      }
    }
    return null;
  },
});
