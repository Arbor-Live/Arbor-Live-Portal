import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { EVENT_TIMEZONE } from "../email/constants";

export const BAND_PAYMENT_SETTINGS_KEY = "default";
export { BAND_PAYMENT_REFERENCE_PREFIX as BAND_PAYMENT_TOKEN_PREFIX } from "./publicReferenceIds";

export type BandPaymentPricingMode = "per_member_hourly" | "fixed_total";
export type BandPaymentStatus =
  | "draft"
  | "pending_payee"
  | "pending_email"
  | "awaiting_confirmation"
  | "confirmed"
  | "paid"
  | "cancelled";

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
  return {
    designatedPayeeUserId: profile.designatedPayeeUserId?.trim() || undefined,
    designatedPayeeName: profile.designatedPayeeName?.trim() || undefined,
    designatedPayeeEmail: profile.designatedPayeeEmail?.trim().toLowerCase() || undefined,
    designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress?.trim() || undefined,
    designatedPayeePayoutMethod:
      profile.designatedPayeePayoutMethod === "pickup" ||
      profile.designatedPayeePayoutMethod === "delivery"
        ? profile.designatedPayeePayoutMethod
        : undefined,
  };
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

export function queueStatusForEndedEvent(payeeComplete: boolean): "pending_payee" | "pending_email" {
  return payeeComplete ? "pending_email" : "pending_payee";
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

export async function getBandPaymentSettings(ctx: QueryCtx | MutationCtx) {
  const row = await ctx.db
    .query("bandPaymentSettings")
    .withIndex("by_key", (q) => q.eq("key", BAND_PAYMENT_SETTINGS_KEY))
    .unique();
  return {
    photoAlbumUrl: row?.photoAlbumUrl ?? "",
  };
}

export function bandPaymentQueueForStatus(status: BandPaymentStatus) {
  switch (status) {
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
      return "Draft";
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
