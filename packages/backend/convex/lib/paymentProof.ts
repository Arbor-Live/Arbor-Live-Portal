import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { EVENT_TIMEZONE, reminderDayKey } from "../email/constants";
import {
  computeLateFeeSummary,
  getPaymentDueAt,
  isSubmissionActive,
} from "./invoicePaymentStatus";

export const PAYMENT_PROOF_OPEN_HOUR = 9;
export const PAYMENT_PROOF_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PaymentProofMethod = "assu_epay" | "ijournal" | "granted_transfer";

export const paymentProofMethodValue = {
  assu_epay: "assu_epay" as const,
  ijournal: "ijournal" as const,
  granted_transfer: "granted_transfer" as const,
};

function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return utcDate.toISOString().slice(0, 10);
}

function formatZonedDateTime(ms: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function zonedLocalTimeToUtcMs(
  dayKey: string,
  hour: number,
  minute: number,
  timezone: string = EVENT_TIMEZONE,
) {
  const [year, month, day] = dayKey.split("-").map(Number);
  let lo = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  let hi = Date.UTC(year, month - 1, day + 1, 23, 59, 59);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const zoned = formatZonedDateTime(mid, timezone);
    const target = `${dayKey} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const actual = `${zoned.dayKey} ${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`;
    if (actual < target) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

export function getPaymentProofOpensAt(endAtMs: number, timezone: string = EVENT_TIMEZONE) {
  const eventEndDayKey = reminderDayKey(endAtMs, timezone);
  const opensDayKey = addCalendarDays(eventEndDayKey, 1);
  return zonedLocalTimeToUtcMs(opensDayKey, PAYMENT_PROOF_OPEN_HOUR, 0, timezone);
}

export function isPaymentProofOpen(nowMs: number, endAtMs: number, timezone: string = EVENT_TIMEZONE) {
  return nowMs >= getPaymentProofOpensAt(endAtMs, timezone);
}

export function normalizePaymentReference(method: PaymentProofMethod, raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Payment reference is required.");

  if (method === "assu_epay") {
    const digits = trimmed.replace(/^#/, "");
    if (!/^\d+$/.test(digits)) {
      throw new Error("ASSU ePay payment numbers should contain digits only.");
    }
    return digits;
  }

  if (method === "granted_transfer") {
    const normalized = trimmed.toUpperCase();
    if (!/^GT-[A-Z0-9]+$/.test(normalized)) {
      throw new Error("GrantEd transfer codes should look like GT-XXXXXX.");
    }
    return normalized;
  }

  if (trimmed.length < 3) {
    throw new Error("iJournal transfer numbers must be at least 3 characters.");
  }
  return trimmed;
}

export function paymentMethodLabel(method: PaymentProofMethod) {
  switch (method) {
    case "assu_epay":
      return "ASSU ePay";
    case "ijournal":
      return "iJournal transfer";
    case "granted_transfer":
      return "GrantEd Group Transfer to VSO #5001";
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeFinanceContactEmail(raw: string | undefined) {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (!isValidEmail(trimmed)) throw new Error("Finance contact email is invalid.");
  return trimmed;
}

export async function getActivePaymentProofSubmission(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const active = await ctx.db
    .query("eventPaymentProofSubmissions")
    .withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "active"))
    .take(5);
  if (active.length > 0) return active[0];

  const legacy = await ctx.db
    .query("eventPaymentProofSubmissions")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(20);
  return legacy.find((row) => isSubmissionActive(row)) ?? null;
}

/** @deprecated Use getActivePaymentProofSubmission */
export async function getPaymentProofSubmissionForEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  return await getActivePaymentProofSubmission(ctx, eventId);
}

export async function loadPaymentProofState(
  ctx: QueryCtx,
  invoice: Doc<"invoices">,
  linkedEvent: Doc<"events"> | null,
) {
  if (!linkedEvent) {
    return {
      eligible: false,
      canSubmit: false,
      opensAt: null,
      submission: null,
      paymentReceived: false,
      lateFee: null,
    };
  }

  const approved = (invoice.clientApprovalStatus ?? "pending") === "approved";
  const timezone = linkedEvent.timezone || EVENT_TIMEZONE;
  const opensAt = getPaymentProofOpensAt(linkedEvent.endAt, timezone);
  const now = Date.now();
  const activeSubmission = await getActivePaymentProofSubmission(ctx, linkedEvent._id);
  const open = approved && isPaymentProofOpen(now, linkedEvent.endAt, timezone);
  const dueAt = getPaymentDueAt(invoice, linkedEvent);
  const lateFee = approved ? computeLateFeeSummary(dueAt, now) : null;
  const paymentReceived = Boolean(invoice.paymentReceivedAt);

  return {
    eligible: approved,
    canSubmit: open && !activeSubmission && !paymentReceived,
    opensAt,
    paymentReceived,
    lateFee: lateFee
      ? {
          dueAt: lateFee.dueAt,
          lateFeeUsd: lateFee.lateFeeUsd,
          isOverdue: lateFee.isOverdue,
          weeksUntilLateFee: lateFee.weeksUntilLateFee,
        }
      : null,
    submission: activeSubmission
      ? {
          paymentMethod: activeSubmission.paymentMethod,
          paymentReference: activeSubmission.paymentReference,
          financeContactEmail: activeSubmission.financeContactEmail,
          submittedAt: activeSubmission.submittedAt,
        }
      : null,
  };
}

export async function submitPaymentProof(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  linkedEvent: Doc<"events">,
  args: {
    paymentMethod: PaymentProofMethod;
    paymentReference: string;
    financeContactEmail?: string;
  },
) {
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
    throw new Error("Payment proof can be submitted after the quote is approved.");
  }

  if (invoice.paymentReceivedAt) {
    throw new Error("Payment has already been marked as received.");
  }

  const timezone = linkedEvent.timezone || EVENT_TIMEZONE;
  if (!isPaymentProofOpen(Date.now(), linkedEvent.endAt, timezone)) {
    throw new Error("Payment proof submission opens the day after the event at 9:00 AM Pacific.");
  }

  const existing = await getActivePaymentProofSubmission(ctx, linkedEvent._id);
  if (existing) throw new Error("Payment proof has already been submitted for this event.");

  const paymentReference = normalizePaymentReference(args.paymentMethod, args.paymentReference);
  const financeContactEmail = normalizeFinanceContactEmail(args.financeContactEmail);
  const now = Date.now();

  const submissionId = await ctx.db.insert("eventPaymentProofSubmissions", {
    eventId: linkedEvent._id,
    invoiceId: invoice._id,
    paymentMethod: args.paymentMethod,
    paymentReference,
    financeContactEmail,
    status: "active",
    submittedAt: now,
    createdAt: now,
  });

  return { submissionId, paymentReference, financeContactEmail };
}

export async function resolvePortalTokenForInvoice(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
) {
  if (invoice.sourceEventRequestId) {
    const request = await ctx.db.get(invoice.sourceEventRequestId);
    if (request?.publicToken) {
      return { token: request.publicToken, portal: "request" as const };
    }
  }
  if (invoice.publicApprovalToken) {
    return { token: invoice.publicApprovalToken, portal: "quote" as const };
  }
  return null;
}
