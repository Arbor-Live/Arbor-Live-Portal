import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listAdditionalInvoiceIds } from "../lib/eventInvoiceLinks";
import { listApprovedInvoicesWithoutEvent } from "../lib/invoiceEvents";
import {
  computeLateFeeSummary,
  getPaymentDueAt,
  isWithinPaymentProofReminderLead,
  shouldSendFirstPaymentProofReminder,
  shouldSendMondayPaymentProofReminder,
} from "../lib/invoicePaymentStatus";
import {
  getActivePaymentProofSubmissionForInvoice,
  getPaymentProofOpensAt,
  resolvePortalTokenForInvoice,
} from "../lib/paymentProof";
import { EVENT_TIMEZONE, reminderDayKey } from "./constants";
import { schedulePaymentProofReminderEmail } from "./paymentProofEmails";

const REMINDER_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Events per transaction. Each can fan out to a few invoices, and each reminder
 * resolves a booking thread and queues an email; 50 keeps a batch far inside the
 * mutation read/write limits while a normal week still finishes in a few batches.
 */
export const REMINDER_EVENT_BATCH_SIZE = 50;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Where a reminder run is. `now` is fixed for the whole run so every batch uses the same reminder keys. */
export type ReminderRun = {
  now: number;
  phase: "events" | "unlinked";
  cursor: string | null;
  /** Invoices already reminded this run, so an invoice on two events gets one reminder. */
  remindedInvoiceIds: Id<"invoices">[];
};

export function startReminderRun(): ReminderRun {
  return { now: Date.now(), phase: "events", cursor: null, remindedInvoiceIds: [] };
}

/**
 * One batch of payment-proof reminders: a page of recent events, or, once the
 * events are done, the approved invoices with no event. Returns the next batch
 * to schedule, or null when the run is finished.
 */
export async function runPaymentProofReminderBatch(
  ctx: MutationCtx,
  mode: "first" | "monday",
  run: ReminderRun,
): Promise<{ enqueuedCount: number; next: ReminderRun | null }> {
  const { now } = run;
  const dayKey = reminderDayKey(now, EVENT_TIMEZONE);
  const windowStart = now - REMINDER_LOOKBACK_MS;

  let enqueuedCount = 0;
  const remindedInvoiceIds = new Set<Id<"invoices">>(run.remindedInvoiceIds);

  async function considerInvoice(invoice: Doc<"invoices">, event: Doc<"events"> | null) {
    if (remindedInvoiceIds.has(invoice._id)) return;
    if (invoice.status === "void") return;
    if ((invoice.clientApprovalStatus ?? "pending") !== "approved") return;
    if (invoice.paymentReceivedAt) return;

    const clientEmail = invoice.clientEmail?.trim().toLowerCase();
    if (!clientEmail || !isValidEmail(clientEmail)) return;

    const activeSubmission = await getActivePaymentProofSubmissionForInvoice(ctx, invoice._id);
    if (activeSubmission) return;

    const dueAt = getPaymentDueAt(invoice, event);
    if (!isWithinPaymentProofReminderLead(dueAt, now)) return;

    const timezone = event?.timezone || EVENT_TIMEZONE;
    const opensAt = getPaymentProofOpensAt(invoice);
    if (opensAt == null) return;
    const shouldSend =
      mode === "first"
        ? shouldSendFirstPaymentProofReminder(now, opensAt, timezone)
        : shouldSendMondayPaymentProofReminder(now, opensAt, timezone);
    if (!shouldSend) return;

    const portalInfo = await resolvePortalTokenForInvoice(ctx, invoice);
    if (!portalInfo) return;

    const late = computeLateFeeSummary(dueAt, now);
    const opensDayKey = reminderDayKey(opensAt, timezone);
    const reminderKey = mode === "first" ? `first:${opensDayKey}` : `mon:${dayKey}`;

    await schedulePaymentProofReminderEmail(ctx, {
      invoice,
      event,
      reminderKey,
      publicQuoteToken: portalInfo.token,
      portal: portalInfo.portal,
      recipient: {
        email: clientEmail,
        name: invoice.clientContactName ?? undefined,
      },
      reminderKind: mode === "first" ? "first" : "weekly",
      lateFeeUsd: late.lateFeeUsd,
      isOverdue: late.isOverdue,
      weeksUntilLateFee: late.weeksUntilLateFee,
    });
    remindedInvoiceIds.add(invoice._id);
    enqueuedCount += 1;
  }

  if (run.phase === "unlinked") {
    const unlinked = await listApprovedInvoicesWithoutEvent(ctx, windowStart, remindedInvoiceIds);
    for (const invoice of unlinked) {
      await considerInvoice(invoice, null);
    }
    return { enqueuedCount, next: null };
  }

  const page = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
    .paginate({ numItems: REMINDER_EVENT_BATCH_SIZE, cursor: run.cursor });

  for (const event of page.page) {
    const invoiceIds: Id<"invoices">[] = [];
    if (event.invoiceId) invoiceIds.push(event.invoiceId);
    for (const invoiceId of await listAdditionalInvoiceIds(ctx, event._id)) {
      if (!invoiceIds.includes(invoiceId)) invoiceIds.push(invoiceId);
    }
    for (const invoiceId of invoiceIds) {
      if (remindedInvoiceIds.has(invoiceId)) continue;
      const invoice = await ctx.db.get(invoiceId);
      if (!invoice) continue;
      await considerInvoice(invoice, event);
    }
  }

  return {
    enqueuedCount,
    next: {
      now,
      phase: page.isDone ? "unlinked" : "events",
      cursor: page.isDone ? null : page.continueCursor,
      remindedInvoiceIds: [...remindedInvoiceIds],
    },
  };
}
