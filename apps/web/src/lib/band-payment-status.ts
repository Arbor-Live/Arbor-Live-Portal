import type { Tone } from "@/components/page-header";

export type BandPaymentStatus =
  | "draft"
  | "pending_onboarding"
  | "pending_payee"
  | "pending_email"
  | "awaiting_confirmation"
  | "confirmed"
  | "paid"
  | "cancelled";

/**
 * Status pill tone for an artist payout, as the artist sees it: amber when it
 * waits on a signature, blue once it's agreed, emerald when paid. Pass
 * `undefined` for a show with no payout yet.
 */
export function bandPaymentStatusTone(status: BandPaymentStatus | undefined): Tone {
  switch (status) {
    case "awaiting_confirmation":
      return "amber";
    case "draft":
    case "confirmed":
      return "blue";
    case "paid":
      return "emerald";
    case "cancelled":
      return "rose";
    default:
      return "neutral";
  }
}
