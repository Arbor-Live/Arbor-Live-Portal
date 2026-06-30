import type { MutationCtx } from "../_generated/server";
import {
  computeLateFeeSummary,
  getPaymentDueAt,
  shouldSendFirstPaymentProofReminder,
  shouldSendMondayPaymentProofReminder,
} from "../lib/invoicePaymentStatus";
import {
  getActivePaymentProofSubmission,
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
    .withIndex("by_startAt", (q) => q.gte("startAt", windowStart).lte("startAt", now))
    .take(500);

  let enqueuedCount = 0;

  for (const event of candidates) {
    if (event.endAt > now) continue;
    if (!event.invoiceId) continue;

    const invoice = await ctx.db.get(event.invoiceId);
    if (!invoice || invoice.status === "void") continue;
    if ((invoice.clientApprovalStatus ?? "pending") !== "approved") continue;
    if (invoice.paymentReceivedAt) continue;

    const clientEmail = invoice.clientEmail?.trim().toLowerCase();
    if (!clientEmail || !isValidEmail(clientEmail)) continue;

    const activeSubmission = await getActivePaymentProofSubmission(ctx, event._id);
    if (activeSubmission) continue;

    const timezone = event.timezone || EVENT_TIMEZONE;
    const opensAt = getPaymentProofOpensAt(event.endAt, timezone);
    const shouldSend =
      mode === "first"
        ? shouldSendFirstPaymentProofReminder(now, opensAt, timezone)
        : shouldSendMondayPaymentProofReminder(now, opensAt, timezone);
    if (!shouldSend) continue;

    const portalInfo = await resolvePortalTokenForInvoice(ctx, invoice);
    if (!portalInfo) continue;

    const dueAt = getPaymentDueAt(invoice, event);
    const late = computeLateFeeSummary(dueAt, now);
    const opensDayKey = reminderDayKey(opensAt, timezone);
    const reminderKey =
      mode === "first"
        ? `first:${opensDayKey}`
        : `mon:${dayKey}`;

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
    enqueuedCount += 1;
  }

  return { enqueuedCount };
}
