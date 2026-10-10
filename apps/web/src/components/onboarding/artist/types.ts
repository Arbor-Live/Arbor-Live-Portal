import type { BandPayeePayoutMethod } from "@/lib/band-payout-copy";

export type StepId =
  | "welcome"
  | "identity"
  | "passkey"
  | "hero"
  | "socials"
  | "members"
  | "rates"
  | "payment"
  | "thankYou";

export type FormState = {
  displayName: string;
  bio: string;
  publicHeroImageUrl: string;
  artistLinks: Array<{ label: string; url: string; icon?: string }>;
  organizationType: string;
  demoURL: string;
  publicListing: boolean;
  publicSlug: string;
  performerHourlyRateUsd: number;
  designatedPayeeUserId: string;
  designatedPayeeName: string;
  designatedPayeeEmail: string;
  designatedPayeeMailingAddress: string;
  designatedPayeePayoutMethod: BandPayeePayoutMethod;
  inviteDraft: string;
  inviteRoleDraft: string;
  inviteEmails: Array<{ email: string; bandRole: string }>;
  isSolo: boolean;
  paymentExplainedAck: boolean;
};
