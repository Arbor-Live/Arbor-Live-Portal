import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { EVENT_TIMEZONE } from "../email/constants";

export { BAND_PAYMENT_REFERENCE_PREFIX as BAND_PAYMENT_TOKEN_PREFIX } from "./publicReferenceIds";

export type BandPaymentPricingMode = "per_member_hourly" | "fixed_total";
export type BandPaymentStatus =
  | "draft"
  | "pending_onboarding"
  | "pending_payee"
  | "pending_email"
  | "awaiting_confirmation"
  | "confirmed"
  | "paid"
  | "cancelled";

export type BandOrgOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "waived";

export function isBandOrgOnboardingComplete(
  status: BandOrgOnboardingStatus | null | undefined,
) {
  return status === "completed" || status === "waived";
}

export async function isOrganizationBandOnboardingComplete(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const row = await ctx.db
    .query("organizationOnboarding")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return isBandOrgOnboardingComplete(row?.status);
}

export type BandPayeePayoutMethod = "pickup" | "delivery";

export type BandPayeeFields = {
  designatedPayeeUserId?: string;
  designatedPayeeName?: string;
  designatedPayeeEmail?: string;
  designatedPayeeMailingAddress?: string;
  designatedPayeePayoutMethod?: BandPayeePayoutMethod;
};

export function formatBandPayeePayoutMethod(method?: BandPayeePayoutMethod) {
  if (method === "pickup") return "Pickup (ASSU office)";
  if (method === "delivery") return "Delivery";
  return "—";
}

export function isBandPayeeComplete(payee: BandPayeeFields) {
  const name = payee.designatedPayeeName?.trim();
  const email = payee.designatedPayeeEmail?.trim().toLowerCase();
  const address = payee.designatedPayeeMailingAddress?.trim();
  const method = payee.designatedPayeePayoutMethod;
  return Boolean(name && email?.includes("@") && address && method);
}

export function payeeFieldsFromProfile(
  profile: BandPayeeFields | null | undefined,
): BandPayeeFields {
  if (!profile) return {};
  const fields: BandPayeeFields = {};
  const userId = profile.designatedPayeeUserId?.trim();
  const name = profile.designatedPayeeName?.trim();
  const email = profile.designatedPayeeEmail?.trim().toLowerCase();
  const address = profile.designatedPayeeMailingAddress?.trim();
  const method =
    profile.designatedPayeePayoutMethod === "pickup" ||
    profile.designatedPayeePayoutMethod === "delivery"
      ? profile.designatedPayeePayoutMethod
      : undefined;
  // Omit empty keys so merges don't wipe org values with `undefined`.
  if (userId) fields.designatedPayeeUserId = userId;
  if (name) fields.designatedPayeeName = name;
  if (email) fields.designatedPayeeEmail = email;
  if (address) fields.designatedPayeeMailingAddress = address;
  if (method) fields.designatedPayeePayoutMethod = method;
  return fields;
}

export function resolvePayeeSnapshot(
  orgPayee: BandPayeeFields,
  overrides?: BandPayeeFields,
): BandPayeeFields {
  const merged = { ...payeeFieldsFromProfile(orgPayee), ...payeeFieldsFromProfile(overrides) };
  return {
    designatedPayeeUserId: merged.designatedPayeeUserId,
    designatedPayeeName: merged.designatedPayeeName,
    designatedPayeeEmail: merged.designatedPayeeEmail,
    designatedPayeeMailingAddress: merged.designatedPayeeMailingAddress,
    designatedPayeePayoutMethod: merged.designatedPayeePayoutMethod,
  };
}

export function queueStatusForEndedEvent(args: {
  onboardingComplete: boolean;
  payeeComplete: boolean;
}): "pending_onboarding" | "pending_payee" | "pending_email" {
  if (!args.onboardingComplete) return "pending_onboarding";
  return args.payeeComplete ? "pending_email" : "pending_payee";
}

export function computeBandPaymentTotal(args: {
  pricingMode: BandPaymentPricingMode;
  ratePerMemberPerHourUsd?: number;
  performanceHours?: number;
  memberCount?: number;
  totalUsd?: number;
}) {
  if (args.pricingMode === "fixed_total") {
    return Math.max(0, args.totalUsd ?? 0);
  }
  const rate = args.ratePerMemberPerHourUsd ?? 0;
  const hours = args.performanceHours ?? 0;
  const members = args.memberCount ?? 0;
  return Math.max(0, rate * hours * members);
}

export function formatBandPaymentDate(startAt: number, timezone: string = EVENT_TIMEZONE) {
  return new Date(startAt).toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

export function formatPerformanceHours(hours: number | undefined) {
  if (hours === undefined) return "—";
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} hrs`;
}

export function shouldPromoteBandPaymentToQueue(event: Doc<"events">, nowMs: number) {
  return event.endAt <= nowMs && event.status !== "cancelled";
}

export function bandPaymentQueueForStatus(status: BandPaymentStatus) {
  switch (status) {
    case "draft":
      return "upcoming" as const;
    case "pending_onboarding":
      return "needs_onboarding" as const;
    case "pending_payee":
      return "needs_payee" as const;
    case "pending_email":
      return "needs_email" as const;
    case "awaiting_confirmation":
      return "awaiting_reply" as const;
    case "confirmed":
      return "ready_to_pay" as const;
    case "paid":
      return "paid" as const;
    default:
      return null;
  }
}

export function bandPaymentStatusLabel(status: BandPaymentStatus) {
  switch (status) {
    case "draft":
      // Internal status stays `draft` until the event ends; staff see "Upcoming".
      return "Upcoming";
    case "pending_onboarding":
      return "Pending onboarding";
    case "pending_payee":
      return "Needs payee info";
    case "pending_email":
      return "Needs signature request";
    case "awaiting_confirmation":
      return "Awaiting signature";
    case "confirmed":
      return "Ready to pay";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
  }
}

export function bandPaymentHasAgreementPdf(payment: {
  status: BandPaymentStatus;
  confirmedAt?: number;
  signatureTypedName?: string;
  confirmationReplyFrom?: string;
  confirmationEmailSentAt?: number;
}) {
  if (payment.status !== "confirmed" && payment.status !== "paid") return false;
  if (!payment.confirmedAt) return false;
  const hasPayeeAgreement = Boolean(
    payment.signatureTypedName?.trim() || payment.confirmationReplyFrom?.trim(),
  );
  return hasPayeeAgreement && Boolean(payment.confirmationEmailSentAt);
}

/**
 * Fields to patch alongside a status change: `statusChangedAt` always, and
 * `promotedAt` when the payout joins the queue (leaves `draft`, or is created
 * for an event that already ended). Empty when the status doesn't change.
 */
export function bandPaymentStatusStamp(
  previous: BandPaymentStatus | undefined,
  next: BandPaymentStatus,
  nowMs: number,
): { statusChangedAt?: number; promotedAt?: number } {
  if (previous === next) return {};
  const joinsQueue =
    next !== "draft" &&
    next !== "cancelled" &&
    (previous === undefined || previous === "draft" || previous === "cancelled");
  return joinsQueue ? { statusChangedAt: nowMs, promotedAt: nowMs } : { statusChangedAt: nowMs };
}

/**
 * The payouts pipeline's stages, in workflow order. Onboarding and payee info
 * share one stage because both wait on the artist.
 */
export type BandPayoutStage =
  | "upcoming"
  | "waiting_on_artist"
  | "ready_to_send"
  | "waiting_on_signature"
  | "ready_to_pay"
  | "paid";

export const BAND_PAYOUT_STAGES: BandPayoutStage[] = [
  "upcoming",
  "waiting_on_artist",
  "ready_to_send",
  "waiting_on_signature",
  "ready_to_pay",
  "paid",
];

export function bandPayoutStageForStatus(status: BandPaymentStatus): BandPayoutStage | null {
  switch (status) {
    case "draft":
      return "upcoming";
    case "pending_onboarding":
    case "pending_payee":
      return "waiting_on_artist";
    case "pending_email":
      return "ready_to_send";
    case "awaiting_confirmation":
      return "waiting_on_signature";
    case "confirmed":
      return "ready_to_pay";
    case "paid":
      return "paid";
    case "cancelled":
      return null;
  }
}

/**
 * When the payout entered its current pipeline stage. Payouts written before
 * `statusChangedAt` existed fall back to the milestone that put them there
 * (event end for the post-show queue).
 */
export function bandPaymentStageEnteredAt(
  payment: Pick<
    Doc<"eventBandPayments">,
    | "status"
    | "statusChangedAt"
    | "promotedAt"
    | "createdAt"
    | "confirmationEmailSentAt"
    | "confirmedAt"
    | "paidAt"
  >,
  eventEndAt: number,
) {
  const queuedAt = payment.promotedAt ?? Math.max(eventEndAt, payment.createdAt);
  switch (payment.status) {
    case "draft":
      return payment.createdAt;
    case "pending_onboarding":
    case "pending_payee":
      return queuedAt;
    case "pending_email":
      return payment.statusChangedAt ?? queuedAt;
    case "awaiting_confirmation":
      return payment.confirmationEmailSentAt ?? payment.statusChangedAt ?? queuedAt;
    case "confirmed":
      return payment.confirmedAt ?? payment.statusChangedAt ?? queuedAt;
    case "paid":
    case "cancelled":
      return payment.paidAt ?? payment.statusChangedAt ?? queuedAt;
  }
}

/**
 * A payout priced like the quote line that bills the act: per person per hour
 * when the line has its people × hours split, else the line's amount.
 */
export function payoutPricingFromLine(line: {
  rateUsd: number;
  amountUsd: number;
  memberCount?: number;
  performanceHours?: number;
}):
  | {
      pricingMode: "per_member_hourly";
      ratePerMemberPerHourUsd: number;
      memberCount: number;
      performanceHours: number;
    }
  | { pricingMode: "fixed_total"; totalUsd: number } {
  if (
    line.memberCount !== undefined &&
    line.memberCount > 0 &&
    line.performanceHours !== undefined &&
    line.performanceHours > 0
  ) {
    return {
      pricingMode: "per_member_hourly",
      ratePerMemberPerHourUsd: line.rateUsd,
      memberCount: line.memberCount,
      performanceHours: line.performanceHours,
    };
  }
  return { pricingMode: "fixed_total", totalUsd: line.amountUsd };
}
