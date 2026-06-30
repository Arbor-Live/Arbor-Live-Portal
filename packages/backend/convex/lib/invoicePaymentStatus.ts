import type { Doc } from "../_generated/dataModel";
import { EVENT_TIMEZONE, reminderDayKey } from "../email/constants";
import {
  getPaymentProofOpensAt,
  zonedLocalTimeToUtcMs,
  type PaymentProofMethod,
} from "./paymentProof";

export const LATE_FEE_USD_PER_MONTH = 25;
export const PAYMENT_GRACE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
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

export function getPaymentDueAt(
  invoice: Pick<Doc<"invoices">, "dueDate">,
  event: Pick<Doc<"events">, "endAt" | "timezone">,
) {
  const timezone = event.timezone || EVENT_TIMEZONE;
  const opensAt = getPaymentProofOpensAt(event.endAt, timezone);
  const dueFromInvoice = invoice.dueDate ? parseDueDateString(invoice.dueDate, timezone) : null;
  if (dueFromInvoice && dueFromInvoice > opensAt) return dueFromInvoice;
  return opensAt;
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
  if (args.event.endAt > nowMs) return null;

  if (args.invoice.paymentReceivedAt) return "payment_received";

  const dueAt = getPaymentDueAt(args.invoice, args.event);
  const late = computeLateFeeSummary(dueAt, nowMs);

  if (isSubmissionActive(args.activeSubmission)) {
    return late.isOverdue ? "overdue" : "proof_no_receipt";
  }

  const timezone = args.event.timezone || EVENT_TIMEZONE;
  const opensAt = getPaymentProofOpensAt(args.event.endAt, timezone);
  if (nowMs < opensAt) return null;

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
