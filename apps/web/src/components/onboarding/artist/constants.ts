import { DEFAULT_BAND_PAYEE_PAYOUT_METHOD } from "@/lib/band-payout-copy";
import type { FormState, StepId } from "./types";

export const QUESTION_STEPS: StepId[] = [
  "welcome",
  "identity",
  "passkey",
  "hero",
  "socials",
  "members",
  "rates",
  "payment",
];

export const STEP_ORDER: StepId[] = [...QUESTION_STEPS, "thankYou"];

export const STEP_HEADLINES: Record<StepId, string> = {
  welcome: "Welcome to Arbor Live",
  identity: "Tell us about your artist profile",
  passkey: "Secure your account",
  hero: "Add a hero photo",
  socials: "Where can people find you?",
  members: "Who's in the group?",
  rates: "Rates & payout details",
  payment: "How payouts work",
  thankYou: "You're all set!",
};

export const EMPTY_FORM: FormState = {
  displayName: "",
  bio: "",
  publicHeroImageUrl: "",
  artistLinks: [],
  organizationType: "",
  demoURL: "",
  publicListing: false,
  publicSlug: "",
  performerHourlyRateUsd: 0,
  designatedPayeeUserId: "",
  designatedPayeeName: "",
  designatedPayeeEmail: "",
  designatedPayeeMailingAddress: "",
  designatedPayeePayoutMethod: DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
  inviteDraft: "",
  inviteRoleDraft: "",
  inviteEmails: [],
  isSolo: false,
  paymentExplainedAck: false,
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const PENDING_PAYEE_PREFIX = "pending:";

export function firstIncompleteStepIndex(onboarding: {
  identityCompletedAt?: number;
  heroCompletedAt?: number;
  socialsCompletedAt?: number;
  membersCompletedAt?: number;
  soloAcknowledgedAt?: number;
  ratesPayeeCompletedAt?: number;
  paymentExplainedAt?: number;
}): number {
  const done = {
    identity: Boolean(onboarding.identityCompletedAt),
    hero: Boolean(onboarding.heroCompletedAt),
    socials: Boolean(onboarding.socialsCompletedAt),
    members: Boolean(onboarding.membersCompletedAt || onboarding.soloAcknowledgedAt),
    rates: Boolean(onboarding.ratesPayeeCompletedAt),
    payment: Boolean(onboarding.paymentExplainedAt),
  };
  const hasProgress = Object.values(done).some(Boolean);
  for (let i = 0; i < STEP_ORDER.length; i += 1) {
    const id = STEP_ORDER[i]!;
    if (id === "welcome") {
      if (hasProgress) continue;
      return i;
    }
    if (id === "thankYou") return i;
    // No persisted completion flag — never force a returning user back to it.
    if (id === "passkey") continue;
    if (id === "identity" && done.identity) continue;
    if (id === "hero" && done.hero) continue;
    if (id === "socials" && done.socials) continue;
    if (id === "members" && done.members) continue;
    if (id === "rates" && done.rates) continue;
    if (id === "payment" && done.payment) continue;
    return i;
  }
  return 0;
}
