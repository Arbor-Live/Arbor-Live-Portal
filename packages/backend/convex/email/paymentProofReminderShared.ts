import type { Doc } from "../_generated/dataModel";
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function runPaymentProofReminders(
  ctx: MutationCtx,
  mode: "first" | "monday",
) {
  const now = Date.now();
  const dayKey = reminderDayKey(now, EVENT_TIMEZONE);
  const windowStart = now - REMINDER_LOOKBACK_MS;

  const candidates = await ctx.db
    .query("events")
    .withIndex("by_startAt", (q) => q.gte("startAt", windowStart))
    .take(500);

  let enqueuedCount = 0;
  const remindedInvoiceIds = new Set<Doc<"invoices">["_id"]>();

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

  for (const event of candidates) {
    const invoiceIds: Doc<"invoices">["_id"][] = [];
    if (event.invoiceId) invoiceIds.push(event.invoiceId);
    for (const invoiceId of await listAdditionalInvoiceIds(ctx, event._id)) {
      if (!invoiceIds.includes(invoiceId)) invoiceIds.push(invoiceId);
    }
    for (const invoiceId of invoiceIds) {
      const invoice = await ctx.db.get(invoiceId);
      if (!invoice) continue;
      await considerInvoice(invoice, event);
    }
  }

  const unlinked = await listApprovedInvoicesWithoutEvent(ctx, windowStart, remindedInvoiceIds);
  for (const invoice of unlinked) {
    await considerInvoice(invoice, null);
  }

  return { enqueuedCount };
}
