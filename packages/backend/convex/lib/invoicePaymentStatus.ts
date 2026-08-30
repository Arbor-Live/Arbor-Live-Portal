import type { Doc } from "../_generated/dataModel";
import { EVENT_TIMEZONE, reminderDayKey } from "../email/constants";
import {
  getPaymentProofOpensAt,
  zonedLocalTimeToUtcMs,
  type PaymentProofMethod,
} from "./paymentProof";

export const LATE_FEE_USD_PER_MONTH = 25;
export const PAYMENT_GRACE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/** Don't nag for payment proof until the due date is within this window. */
export const PAYMENT_PROOF_REMINDER_LEAD_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type PaymentQueue =
  | "payment_received"
  | "proof_no_receipt"
  | "payment_pending"
  | "overdue";

export type LateFeeSummary = {
  dueAt: number;
  lateFeeUsd: number;
  isOverdue: boolean;
  weeksUntilLateFee: number;
  monthsLate: number;
};

function parseDueDateString(dueDate: string, timezone: string) {
  const trimmed = dueDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return zonedLocalTimeToUtcMs(trimmed, 9, 0, timezone);
}

/**
 * End of the due-date calendar day (Pacific), or null when no due date is set.
 * An invoice is "overdue" once this instant has passed. Parses at 9am then
 * adds 15h so the boundary lands on the midnight after the due day — a due
 * date that is still today is not yet overdue.
 */
export function invoiceDueEndMs(
  invoice: Pick<Doc<"invoices">, "dueDate">,
  timezone: string = EVENT_TIMEZONE,
): number | null {
  if (!invoice.dueDate) return null;
  const dueAt = parseDueDateString(invoice.dueDate, timezone);
  return dueAt == null ? null : dueAt + 15 * 60 * 60 * 1000;
}

export function getPaymentDueAt(
  invoice: Pick<Doc<"invoices">, "dueDate" | "approvedAt" | "clientApprovalStatus">,
  event: Pick<Doc<"events">, "timezone">,
) {
  const timezone = event.timezone || EVENT_TIMEZONE;
  const opensAt = getPaymentProofOpensAt(invoice);
  const dueFromInvoice = invoice.dueDate ? parseDueDateString(invoice.dueDate, timezone) : null;
  if (dueFromInvoice && opensAt != null && dueFromInvoice > opensAt) return dueFromInvoice;
  if (opensAt != null) return opensAt;
  if (dueFromInvoice) return dueFromInvoice;
  return Date.now();
}

export function computeLateFeeSummary(dueAt: number, nowMs: number = Date.now()): LateFeeSummary {
  const elapsed = Math.max(0, nowMs - dueAt);
  const monthsSinceDue = Math.floor(elapsed / PAYMENT_GRACE_MONTH_MS);
  const monthsLate = Math.max(0, monthsSinceDue - 1);
  const lateFeeUsd = monthsLate * LATE_FEE_USD_PER_MONTH;
  const overdueStartsAt = dueAt + PAYMENT_GRACE_MONTH_MS;
  const isOverdue = nowMs > overdueStartsAt;
  const weeksUntilLateFee =
    nowMs < overdueStartsAt ? Math.max(0, Math.ceil((overdueStartsAt - nowMs) / WEEK_MS)) : 0;

  return {
    dueAt,
    lateFeeUsd,
    isOverdue,
    weeksUntilLateFee,
    monthsLate,
  };
}

export function isSubmissionActive(
  submission: Pick<Doc<"eventPaymentProofSubmissions">, "status"> | null | undefined,
) {
  return submission != null && (submission.status ?? "active") === "active";
}

export function classifyPaymentQueue(args: {
  invoice: Doc<"invoices">;
  event: Doc<"events">;
  activeSubmission: Doc<"eventPaymentProofSubmissions"> | null;
  nowMs?: number;
}): PaymentQueue | null {
  const nowMs = args.nowMs ?? Date.now();
  if (args.invoice.status === "void") return null;
  if ((args.invoice.clientApprovalStatus ?? "pending") !== "approved") return null;

  if (args.invoice.paymentReceivedAt) return "payment_received";

  const dueAt = getPaymentDueAt(args.invoice, args.event);
  const late = computeLateFeeSummary(dueAt, nowMs);

  if (isSubmissionActive(args.activeSubmission)) {
    return late.isOverdue ? "overdue" : "proof_no_receipt";
  }

  return late.isOverdue ? "overdue" : "payment_pending";
}

export function paymentMethodLabelForQueue(method: PaymentProofMethod) {
  switch (method) {
    case "assu_epay":
      return "ASSU ePay";
    case "ijournal":
      return "iJournal";
    case "granted_transfer":
      return "GrantEd GT";
  }
}

export function isMondayInTimezone(nowMs: number, timezone: string = EVENT_TIMEZONE) {
  const weekday = new Date(nowMs).toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" });
  return weekday === "Mon";
}

export function shouldSendFirstPaymentProofReminder(
  nowMs: number,
  opensAtMs: number,
  timezone: string = EVENT_TIMEZONE,
) {
  if (nowMs < opensAtMs) return false;
  return reminderDayKey(opensAtMs, timezone) === reminderDayKey(nowMs, timezone);
}

export function shouldSendMondayPaymentProofReminder(
  nowMs: number,
  opensAtMs: number,
  timezone: string = EVENT_TIMEZONE,
) {
  if (nowMs < opensAtMs) return false;
  if (!isMondayInTimezone(nowMs, timezone)) return false;
  if (reminderDayKey(opensAtMs, timezone) === reminderDayKey(nowMs, timezone)) return false;
  return true;
}

/** True when due is overdue or fewer than 30 days remain until due. */
export function isWithinPaymentProofReminderLead(
  dueAtMs: number,
  nowMs: number = Date.now(),
) {
  return dueAtMs - nowMs < PAYMENT_PROOF_REMINDER_LEAD_MS;
}
